import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ApiError } from "../lib/apiError.js";
import { assertValidChileanRut } from "../lib/chileRut.js";

function normalizeCompanyTaxId(value: string): string {
  const raw = value.trim();
  if (!raw) return raw;
  // Accept non-Chilean tax IDs (e.g. NIT/RUC) as-is, only validate Chilean-looking RUTs.
  const maybeRut = raw.replace(/[.\-\s]/g, "").toUpperCase();
  if (/^\d{7,8}[0-9K]$/.test(maybeRut)) {
    return assertValidChileanRut(raw, "RUT empresa");
  }
  return raw;
}

const patchSchema = z.object({
  tenantName: z.string().min(1).optional(),
  company: z
    .object({
      legalName: z.string().min(1).optional(),
      taxId: z.string().optional().nullable(),
      address: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      pricingBaseFee: z.number().nonnegative().optional(),
      pricingPerKg: z.number().nonnegative().optional(),
      pricingPerM3: z.number().nonnegative().optional(),
      pricingMinimumCharge: z.number().nonnegative().optional(),
      /** % sobre monto de entregas para liquidación automática del chofer (0–100). */
      driverCommissionPercent: z.number().min(0).max(100).optional(),
    })
    .optional(),
});

export const settingsRouter = Router();

settingsRouter.use(authenticate, requireRole("admin"));

settingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { company: true, subscription: true },
    });
    if (!tenant) throw new ApiError(404, "Tenant no encontrado", "NOT_FOUND");
    res.json({
      success: true,
      data: {
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, createdAt: tenant.createdAt },
        company: tenant.company,
        subscription: tenant.subscription,
        mpEnabled: config.mpEnabled,
      },
    });
  })
);

settingsRouter.patch(
  "/",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const body = patchSchema.parse(req.body);

    await prisma.$transaction(async (tx) => {
      if (body.tenantName) {
        await tx.tenant.update({ where: { id: tenantId }, data: { name: body.tenantName } });
      }
      if (body.company) {
        const c = await tx.company.findUnique({ where: { tenantId } });
        const d = body.company;
        if (c) {
          const normalizedTaxId =
            d.taxId !== undefined && d.taxId !== null
              ? normalizeCompanyTaxId(d.taxId)
              : d.taxId;
          await tx.company.update({
            where: { tenantId },
            data: {
              ...(d.legalName !== undefined ? { legalName: d.legalName } : {}),
              ...(d.taxId !== undefined ? { taxId: normalizedTaxId } : {}),
              ...(d.address !== undefined ? { address: d.address } : {}),
              ...(d.phone !== undefined ? { phone: d.phone } : {}),
              ...(d.pricingBaseFee !== undefined
                ? { pricingBaseFee: new Prisma.Decimal(d.pricingBaseFee) }
                : {}),
              ...(d.pricingPerKg !== undefined
                ? { pricingPerKg: new Prisma.Decimal(d.pricingPerKg) }
                : {}),
              ...(d.pricingPerM3 !== undefined
                ? { pricingPerM3: new Prisma.Decimal(d.pricingPerM3) }
                : {}),
              ...(d.pricingMinimumCharge !== undefined
                ? { pricingMinimumCharge: new Prisma.Decimal(d.pricingMinimumCharge) }
                : {}),
              ...(d.driverCommissionPercent !== undefined
                ? { driverCommissionPercent: new Prisma.Decimal(d.driverCommissionPercent) }
                : {}),
            },
          });
        } else if (d.legalName) {
          const normalizedTaxId =
            d.taxId !== undefined && d.taxId !== null
              ? normalizeCompanyTaxId(d.taxId)
              : undefined;
          await tx.company.create({
            data: {
              tenantId,
              legalName: d.legalName,
              taxId: normalizedTaxId,
              address: d.address ?? undefined,
              phone: d.phone ?? undefined,
              pricingBaseFee:
                d.pricingBaseFee !== undefined
                  ? new Prisma.Decimal(d.pricingBaseFee)
                  : undefined,
              pricingPerKg:
                d.pricingPerKg !== undefined
                  ? new Prisma.Decimal(d.pricingPerKg)
                  : undefined,
              pricingPerM3:
                d.pricingPerM3 !== undefined
                  ? new Prisma.Decimal(d.pricingPerM3)
                  : undefined,
              pricingMinimumCharge:
                d.pricingMinimumCharge !== undefined
                  ? new Prisma.Decimal(d.pricingMinimumCharge)
                  : undefined,
              driverCommissionPercent:
                d.driverCommissionPercent !== undefined
                  ? new Prisma.Decimal(d.driverCommissionPercent)
                  : undefined,
            },
          });
        }
      }
    });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { company: true, subscription: true },
    });
    res.json({ success: true, data: tenant });
  })
);
