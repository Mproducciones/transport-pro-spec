import { Router } from "express";
import { z } from "zod";
import { VehicleStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ApiError } from "../lib/apiError.js";

const createSchema = z.object({
  plate: z.string().min(1),
  kind: z.string().optional(),
  status: z.nativeEnum(VehicleStatus).optional(),
});

const updateSchema = z.object({
  plate: z.string().min(1).optional(),
  kind: z.string().optional().nullable(),
  status: z.nativeEnum(VehicleStatus).optional(),
});

export const vehiclesRouter = Router();

vehiclesRouter.use(authenticate, requireRole("admin"));

vehiclesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const rows = await prisma.vehicle.findMany({
      where: { tenantId },
      include: { assignedTo: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: rows });
  })
);

vehiclesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const body = createSchema.parse(req.body);
    const row = await prisma.vehicle.create({
      data: {
        tenantId,
        plate: body.plate,
        kind: body.kind,
        status: body.status ?? VehicleStatus.disponible,
      },
    });
    res.status(201).json({ success: true, data: row });
  })
);

vehiclesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const body = updateSchema.parse(req.body);
    const existing = await prisma.vehicle.findFirst({
      where: { id: req.params.id, tenantId },
      include: { assignedTo: true },
    });
    if (!existing) throw new ApiError(404, "Vehículo no encontrado", "NOT_FOUND");

    if (body.status === VehicleStatus.en_taller && existing.assignedTo) {
      throw new ApiError(
        400,
        "Desasigne el vehículo del conductor antes de marcarlo en taller",
        "VEHICLE_ASSIGNED"
      );
    }

    const row = await prisma.vehicle.update({
      where: { id: existing.id },
      data: body,
    });
    res.json({ success: true, data: row });
  })
);
