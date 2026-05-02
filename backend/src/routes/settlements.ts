import { Router } from "express";
import type { DriverSettlement } from "@prisma/client";
import { Prisma, Role, ShipmentStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ApiError } from "../lib/apiError.js";
import { periodBounds } from "../lib/periodBounds.js";

const checkoutSchema = z.object({
  period: z.enum(["day", "week", "month"]),
  /** Fecha local YYYY-MM-DD (mediodía interpretado en servidor como ancla). */
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(2000).optional(),
});

const adminPatchSchema = z.object({
  status: z.enum(["cerrado"]).optional(),
  bonusAmount: z.number().nonnegative().optional(),
  deductionAmount: z.number().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
});

function parseAnchor(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return new Date(NaN);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

export const settlementsRouter = Router();
settlementsRouter.use(authenticate);

function settlementJson(
  row: DriverSettlement & {
    driver?: { id: string; fullName: string };
    closedBy?: { email: string; role: string } | null;
  }
) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    driverId: row.driverId,
    driver: row.driver,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    entregasCount: row.entregasCount,
    baseAmount: row.baseAmount.toString(),
    commissionPercent: row.commissionPercent.toString(),
    grossAmount: row.grossAmount.toString(),
    bonusAmount: row.bonusAmount.toString(),
    deductionAmount: row.deductionAmount.toString(),
    netAmount: row.netAmount.toString(),
    notes: row.notes,
    status: row.status,
    closedAt: row.closedAt,
    closedById: row.closedById,
    closedBy: row.closedBy ?? null,
    createdAt: row.createdAt,
  };
}

settlementsRouter.post(
  "/settlements/checkout",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role !== Role.conductor) {
      throw new ApiError(403, "Solo el chofer genera su pre-liquidación", "FORBIDDEN");
    }
    const user = await prisma.user.findUnique({ where: { id: auth.sub }, select: { driverId: true } });
    if (!user?.driverId) throw new ApiError(403, "Sin conductor vinculado", "FORBIDDEN");

    const body = checkoutSchema.parse(req.body);
    const anchor = parseAnchor(body.anchorDate);
    if (Number.isNaN(anchor.getTime())) throw new ApiError(400, "Fecha inválida", "INVALID_DATE");

    const { start, end } = periodBounds(body.period, anchor);

    const delivered = await prisma.shipment.findMany({
      where: {
        tenantId: auth.tenantId,
        driverId: user.driverId,
        status: ShipmentStatus.entregado,
        deliveredAt: { gte: start, lte: end },
      },
      select: { id: true, totalAmount: true, amount: true },
    });

    const company = await prisma.company.findUnique({
      where: { tenantId: auth.tenantId },
      select: { driverCommissionPercent: true },
    });
    const pct = company?.driverCommissionPercent ?? new Prisma.Decimal(40);
    const pctNum = Number(pct);

    let base = new Prisma.Decimal(0);
    for (const s of delivered) {
      const amt = s.totalAmount ?? s.amount ?? new Prisma.Decimal(0);
      base = base.add(amt);
    }
    const gross = base.mul(new Prisma.Decimal(pctNum)).div(new Prisma.Decimal(100));
    const bonus = new Prisma.Decimal(0);
    const deduction = new Prisma.Decimal(0);
    const net = gross.add(bonus).sub(deduction);

    const row = await prisma.driverSettlement.create({
      data: {
        tenantId: auth.tenantId,
        driverId: user.driverId,
        periodStart: start,
        periodEnd: end,
        entregasCount: delivered.length,
        baseAmount: base,
        commissionPercent: pct,
        grossAmount: gross,
        bonusAmount: bonus,
        deductionAmount: deduction,
        netAmount: net,
        notes: body.notes?.trim() || null,
        status: "borrador",
      },
      include: {
        driver: { select: { id: true, fullName: true } },
        closedBy: { select: { email: true, role: true } },
      },
    });

    res.status(201).json({ success: true, data: settlementJson(row) });
  })
);

settlementsRouter.get(
  "/settlements",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role === Role.admin) {
      const driverId = typeof req.query.driverId === "string" ? req.query.driverId : undefined;
      const rows = await prisma.driverSettlement.findMany({
        where: {
          tenantId: auth.tenantId,
          ...(driverId ? { driverId } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          driver: { select: { id: true, fullName: true } },
          closedBy: { select: { email: true, role: true } },
        },
      });
      return res.json({ success: true, data: rows.map((r) => settlementJson(r)) });
    }
    if (auth.role !== Role.conductor) throw new ApiError(403, "No autorizado", "FORBIDDEN");
    const user = await prisma.user.findUnique({ where: { id: auth.sub }, select: { driverId: true } });
    if (!user?.driverId) throw new ApiError(403, "Sin conductor vinculado", "FORBIDDEN");
    const rows = await prisma.driverSettlement.findMany({
      where: { tenantId: auth.tenantId, driverId: user.driverId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({ success: true, data: rows.map((r) => settlementJson(r)) });
  })
);

settlementsRouter.patch(
  "/settlements/:id",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role !== Role.admin) throw new ApiError(403, "Solo administración cierra liquidaciones", "FORBIDDEN");
    const body = adminPatchSchema.parse(req.body);

    const row = await prisma.driverSettlement.findFirst({
      where: { id: req.params.id, tenantId: auth.tenantId },
    });
    if (!row) throw new ApiError(404, "Liquidación no encontrada", "NOT_FOUND");

    let bonus = row.bonusAmount;
    let deduction = row.deductionAmount;
    if (body.bonusAmount !== undefined) bonus = new Prisma.Decimal(body.bonusAmount);
    if (body.deductionAmount !== undefined) deduction = new Prisma.Decimal(body.deductionAmount);
    const net = row.grossAmount.add(bonus).sub(deduction);

    const updated = await prisma.driverSettlement.update({
      where: { id: row.id },
      data: {
        bonusAmount: bonus,
        deductionAmount: deduction,
        netAmount: net,
        ...(body.notes !== undefined ? { notes: body.notes.trim() || null } : {}),
        ...(body.status === "cerrado"
          ? { status: "cerrado", closedAt: new Date(), closedById: auth.sub }
          : {}),
      },
      include: {
        driver: { select: { id: true, fullName: true } },
        closedBy: { select: { email: true, role: true } },
      },
    });
    res.json({ success: true, data: settlementJson(updated) });
  })
);
