import { Router } from "express";
import { z } from "zod";
import { CargoType, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ApiError } from "../lib/apiError.js";

const createSchema = z.object({
  customerId: z.string().optional().nullable(),
  origin: z.string().min(1),
  destination: z.string().min(1),
  cargoType: z.nativeEnum(CargoType).optional().nullable(),
  baseAmount: z.number().positive(),
  helperSurcharge: z.number().nonnegative().optional(),
  active: z.boolean().optional(),
});

export const tariffsRouter = Router();
tariffsRouter.use(authenticate, requireRole("admin"));

tariffsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const rows = await prisma.tariffRule.findMany({
      where: { tenantId },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    });
    res.json({ success: true, data: rows });
  })
);

tariffsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const body = createSchema.parse(req.body);
    if (body.customerId) {
      const c = await prisma.customer.findFirst({ where: { id: body.customerId, tenantId } });
      if (!c) throw new ApiError(404, "Cliente no encontrado", "NOT_FOUND");
    }
    const row = await prisma.tariffRule.create({
      data: {
        tenantId,
        customerId: body.customerId ?? null,
        origin: body.origin.trim(),
        destination: body.destination.trim(),
        cargoType: body.cargoType ?? null,
        baseAmount: new Prisma.Decimal(body.baseAmount),
        helperSurcharge: new Prisma.Decimal(body.helperSurcharge ?? 0),
        active: body.active ?? true,
      },
      include: { customer: { select: { id: true, name: true } } },
    });
    res.status(201).json({ success: true, data: row });
  })
);

