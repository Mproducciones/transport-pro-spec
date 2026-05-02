import { Router } from "express";
import { Prisma, Role, ShipmentStatus, SubscriptionStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";
import { requireOwnerApiKey } from "../middleware/ownerAuth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ApiError } from "../lib/apiError.js";
import { assertValidChileanRut } from "../lib/chileRut.js";

type BillingCycle = "monthly" | "annual";

const createTenantSchema = z.object({
  tenantName: z.string().min(2),
  tenantSlug: z.string().min(2),
  companyLegalName: z.string().min(2),
  companyTaxId: z.string().min(7),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
  billingCycle: z.enum(["monthly", "annual"]).default("monthly"),
  billingAmount: z.number().positive().optional(),
});

const updateSubSchema = z.object({
  status: z.nativeEnum(SubscriptionStatus).optional(),
  billingCycle: z.enum(["monthly", "annual"]).optional(),
  billingAmount: z.number().positive().optional(),
  extendDays: z.number().int().positive().optional(),
});

function defaultAmount(cycle: BillingCycle): number {
  return cycle === "annual" ? 490 : 49;
}

export const ownerRouter = Router();
ownerRouter.use(requireOwnerApiKey);

ownerRouter.get(
  "/dashboard",
  asyncHandler(async (_req, res) => {
    const subs = await prisma.subscription.findMany();
    const active = subs.filter((s) => s.status === SubscriptionStatus.active || s.status === SubscriptionStatus.trialing);
    const now = Date.now();
    const expiringSoon = active.filter(
      (s) => !!s.currentPeriodEnd && s.currentPeriodEnd.getTime() <= now + 7 * 86400000
    );
    const mrr = active.reduce((acc, s) => {
      const monthlyEquivalent =
        s.billingCycle === "annual" ? Number(s.billingAmount) / 12 : Number(s.billingAmount);
      return acc + monthlyEquivalent;
    }, 0);
    const arr = mrr * 12;
    res.json({
      success: true,
      data: {
        tenantsTotal: subs.length,
        tenantsActivos: active.length,
        subscriptionsExpiringSoon: expiringSoon.length,
        mrr: mrr.toFixed(2),
        arr: arr.toFixed(2),
      },
    });
  })
);

ownerRouter.get(
  "/logistics-kpi",
  asyncHandler(async (_req, res) => {
    const [statusCounts, rechazosPorTenant, deliveredTimed, driverDeliveries] = await Promise.all([
      prisma.shipment.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
      prisma.shipment.groupBy({
        by: ["tenantId"],
        where: { status: ShipmentStatus.rechazado },
        _count: { id: true },
      }),
      prisma.shipment.findMany({
        where: {
          status: ShipmentStatus.entregado,
          deliveredAt: { not: null },
        },
        select: { deliveredAt: true, scheduledDelivery: true },
      }),
      prisma.shipment.groupBy({
        by: ["driverId"],
        where: { status: ShipmentStatus.entregado, driverId: { not: null } },
        _count: { id: true },
      }),
    ]);

    const onTime = deliveredTimed.filter((s) => s.deliveredAt! <= s.scheduledDelivery!).length;
    const deliveredTotal = deliveredTimed.length;
    const onTimePct =
      deliveredTotal > 0 ? Math.round((onTime / deliveredTotal) * 1000) / 10 : null;

    const shipmentsByStatus: Record<string, number> = {};
    for (const r of statusCounts) {
      shipmentsByStatus[r.status] = r._count.id;
    }

    const topRechazosPorTenant = [...rechazosPorTenant]
      .sort((a, b) => b._count.id - a._count.id)
      .slice(0, 10)
      .map((r) => ({ tenantId: r.tenantId, rechazos: r._count.id }));

    const topChoferesEntregas = [...driverDeliveries]
      .sort((a, b) => b._count.id - a._count.id)
      .slice(0, 10)
      .map((r) => ({ driverId: r.driverId, entregas: r._count.id }));

    res.json({
      success: true,
      data: {
        shipmentsByStatus,
        entregasConFechaLimite: deliveredTotal,
        entregasATiempo: onTime,
        puntualidadPct: onTimePct,
        topRechazosPorTenant,
        topChoferesEntregas,
      },
    });
  })
);

ownerRouter.get(
  "/tenants",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.tenant.findMany({
      include: {
        company: true,
        subscription: true,
        users: { where: { role: Role.admin }, select: { id: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: rows });
  })
);

ownerRouter.post(
  "/tenants",
  asyncHandler(async (req, res) => {
    const body = createTenantSchema.parse(req.body);
    const companyTaxId = assertValidChileanRut(body.companyTaxId, "RUT empresa");
    const adminEmail = body.adminEmail.trim().toLowerCase();
    const exists = await prisma.user.findFirst({ where: { email: adminEmail }, select: { id: true } });
    if (exists) throw new ApiError(409, "El correo admin ya existe", "DUPLICATE_ADMIN_EMAIL");

    const passwordHash = await hashPassword(body.adminPassword);
    const billingAmount = body.billingAmount ?? defaultAmount(body.billingCycle);
    const tenant = await prisma.$transaction(async (tx) => {
      const t = await tx.tenant.create({
        data: {
          name: body.tenantName.trim(),
          slug: body.tenantSlug.trim().toLowerCase(),
          company: {
            create: {
              legalName: body.companyLegalName.trim(),
              taxId: companyTaxId,
            },
          },
          users: {
            create: {
              email: adminEmail,
              passwordHash,
              role: Role.admin,
            },
          },
          subscription: {
            create: {
              plan: "pro",
              status: SubscriptionStatus.active,
              billingCycle: body.billingCycle,
              billingAmount: new Prisma.Decimal(billingAmount),
              currentPeriodEnd: new Date(
                Date.now() + (body.billingCycle === "annual" ? 365 : 30) * 86400000
              ),
            },
          },
        },
        include: { company: true, subscription: true, users: { where: { role: Role.admin } } },
      });
      return t;
    });
    res.status(201).json({ success: true, data: tenant });
  })
);

ownerRouter.patch(
  "/subscriptions/:tenantId",
  asyncHandler(async (req, res) => {
    const body = updateSubSchema.parse(req.body);
    const current = await prisma.subscription.findUnique({ where: { tenantId: req.params.tenantId } });
    if (!current) throw new ApiError(404, "Suscripción no encontrada", "NOT_FOUND");
    const cycle = body.billingCycle ?? current.billingCycle;
    const nextAmount = body.billingAmount ?? Number(current.billingAmount);
    const extendDays = body.extendDays ?? 0;
    const baseEnd = current.currentPeriodEnd ?? new Date();
    const nextEnd = extendDays > 0 ? new Date(baseEnd.getTime() + extendDays * 86400000) : baseEnd;
    const row = await prisma.subscription.update({
      where: { tenantId: req.params.tenantId },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.billingCycle ? { billingCycle: cycle } : {}),
        ...(body.billingAmount !== undefined ? { billingAmount: new Prisma.Decimal(nextAmount) } : {}),
        ...(extendDays > 0 ? { currentPeriodEnd: nextEnd } : {}),
      },
    });
    res.json({ success: true, data: row });
  })
);

