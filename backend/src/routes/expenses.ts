import { Router } from "express";
import { z } from "zod";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ApiError } from "../lib/apiError.js";

const createSchema = z.object({
  shipmentId: z.string(),
  category: z.string().min(2),
  amount: z.number().positive(),
  note: z.string().optional(),
  recordedAt: z.string().datetime().optional(),
});

export const expensesRouter = Router();

expensesRouter.use(authenticate);

expensesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role !== Role.admin) throw new ApiError(403, "No autorizado", "FORBIDDEN");

    const rows = await prisma.expense.findMany({
      where: { tenantId: auth.tenantId },
      include: {
        shipment: { select: { id: true, origin: true, destination: true, customer: { select: { name: true } } } },
        recordedBy: { select: { id: true, email: true } },
      },
      orderBy: { recordedAt: "desc" },
    });
    res.json({ success: true, data: rows });
  })
);

expensesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role !== Role.admin) throw new ApiError(403, "No autorizado", "FORBIDDEN");
    const body = createSchema.parse(req.body);

    const shipment = await prisma.shipment.findFirst({
      where: { id: body.shipmentId, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!shipment) throw new ApiError(404, "Envío no encontrado", "NOT_FOUND");

    const row = await prisma.expense.create({
      data: {
        tenantId: auth.tenantId,
        shipmentId: body.shipmentId,
        category: body.category.trim(),
        amount: new Prisma.Decimal(body.amount),
        note: body.note?.trim() || undefined,
        recordedAt: body.recordedAt ? new Date(body.recordedAt) : undefined,
        recordedById: auth.sub,
      },
      include: {
        shipment: { select: { id: true, origin: true, destination: true, customer: { select: { name: true } } } },
        recordedBy: { select: { id: true, email: true } },
      },
    });
    res.status(201).json({ success: true, data: row });
  })
);

