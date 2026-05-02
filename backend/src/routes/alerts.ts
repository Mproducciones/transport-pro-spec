import { Router } from "express";
import { AlertType, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ApiError } from "../lib/apiError.js";

const createSchema = z.object({
  type: z.nativeEnum(AlertType),
  message: z.string().min(3),
  shipmentId: z.string().optional(),
});

const updateSchema = z.object({
  type: z.nativeEnum(AlertType).optional(),
  message: z.string().min(3).optional(),
});

export const alertsRouter = Router();

alertsRouter.use(authenticate);

alertsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const rows = await prisma.alert.findMany({
      where: { tenantId: auth.tenantId },
      include: {
        shipment: { select: { id: true, origin: true, destination: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: rows });
  })
);

alertsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role !== Role.admin && auth.role !== Role.conductor) {
      throw new ApiError(403, "No autorizado", "FORBIDDEN");
    }
    const body = createSchema.parse(req.body);
    if (body.shipmentId) {
      const shipment = await prisma.shipment.findFirst({
        where: { id: body.shipmentId, tenantId: auth.tenantId },
        select: { id: true },
      });
      if (!shipment) throw new ApiError(404, "Viaje no encontrado", "NOT_FOUND");
    }
    const row = await prisma.alert.create({
      data: {
        tenantId: auth.tenantId,
        shipmentId: body.shipmentId,
        type: body.type,
        message: body.message.trim(),
      },
      include: {
        shipment: { select: { id: true, origin: true, destination: true, status: true } },
      },
    });
    res.status(201).json({ success: true, data: row });
  })
);

alertsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role !== Role.admin) throw new ApiError(403, "No autorizado", "FORBIDDEN");
    const body = updateSchema.parse(req.body);
    const row = await prisma.alert.findFirst({
      where: { id: req.params.id, tenantId: auth.tenantId },
    });
    if (!row) throw new ApiError(404, "Alerta no encontrada", "NOT_FOUND");
    const updated = await prisma.alert.update({
      where: { id: row.id },
      data: {
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.message !== undefined ? { message: body.message.trim() } : {}),
      },
    });
    res.json({ success: true, data: updated });
  })
);

alertsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role !== Role.admin) throw new ApiError(403, "No autorizado", "FORBIDDEN");
    const row = await prisma.alert.findFirst({
      where: { id: req.params.id, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!row) throw new ApiError(404, "Alerta no encontrada", "NOT_FOUND");
    await prisma.alert.delete({ where: { id: row.id } });
    res.json({ success: true });
  })
);

