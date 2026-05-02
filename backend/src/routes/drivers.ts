import { Router } from "express";
import { z } from "zod";
import { Role, VehicleStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ApiError } from "../lib/apiError.js";
import { hashPassword } from "../lib/password.js";
import { assertValidChileanRut } from "../lib/chileRut.js";

const createSchema = z.object({
  fullName: z.string().min(1),
  taxId: z.string().min(5),
  phone: z.string().optional(),
  licenseNumber: z.string().optional(),
  portalEmail: z.string().email().optional(),
  portalPassword: z.string().min(8).optional(),
});

const assignSchema = z.object({
  vehicleId: z.string().nullable(),
});

export const driversRouter = Router();

driversRouter.use(authenticate, requireRole("admin"));

driversRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const rows = await prisma.driver.findMany({
      where: { tenantId },
      include: {
        assignedVehicle: true,
        user: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: rows });
  })
);

driversRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const body = createSchema.parse(req.body);
    const portalEmail = body.portalEmail?.trim().toLowerCase();
    const normalizedTaxId = assertValidChileanRut(body.taxId, "RUT conductor");

    if (portalEmail && !body.portalPassword) {
      throw new ApiError(400, "Si indica email de portal, debe indicar contraseña", "VALIDATION");
    }
    if (portalEmail) {
      const existingPortalUser = await prisma.user.findFirst({
        where: { email: portalEmail },
        select: { id: true },
      });
      if (existingPortalUser) {
        throw new ApiError(409, "Ya existe un usuario con este correo", "USER_EXISTS");
      }
    }
    const duplicateDriverTax = await prisma.driver.findFirst({
      where: { tenantId, taxId: normalizedTaxId },
      select: { id: true },
    });
    if (duplicateDriverTax) {
      throw new ApiError(409, "Ya existe un conductor con este RUT/NIT", "DUPLICATE_TAX_ID");
    }
    const duplicateCustomerTax = await prisma.customer.findFirst({
      where: { tenantId, taxId: normalizedTaxId },
      select: { id: true },
    });
    if (duplicateCustomerTax) {
      throw new ApiError(409, "Este RUT/NIT ya está registrado en un cliente", "DUPLICATE_TAX_ID");
    }

    const driver = await prisma.$transaction(async (tx) => {
      const d = await tx.driver.create({
        data: {
          tenantId,
          fullName: body.fullName,
          taxId: normalizedTaxId,
          phone: body.phone,
          licenseNumber: body.licenseNumber,
        },
      });

      if (portalEmail && body.portalPassword) {
        const passwordHash = await hashPassword(body.portalPassword);
        await tx.user.create({
          data: {
            tenantId,
            email: portalEmail,
            passwordHash,
            role: Role.conductor,
            driverId: d.id,
          },
        });
      }

      return d;
    });

    const full = await prisma.driver.findUnique({
      where: { id: driver.id },
      include: { assignedVehicle: true, user: { select: { id: true, email: true } } },
    });

    res.status(201).json({ success: true, data: full });
  })
);

driversRouter.patch(
  "/:id/vehicle",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const body = assignSchema.parse(req.body);

    const driver = await prisma.driver.findFirst({
      where: { id: req.params.id, tenantId },
      include: { assignedVehicle: true },
    });
    if (!driver) throw new ApiError(404, "Conductor no encontrado", "NOT_FOUND");

    const updated = await prisma.$transaction(async (tx) => {
      if (driver.assignedVehicleId) {
        await tx.vehicle.update({
          where: { id: driver.assignedVehicleId },
          data: { status: VehicleStatus.disponible },
        });
        await tx.driver.update({
          where: { id: driver.id },
          data: { assignedVehicleId: null },
        });
      }

      if (body.vehicleId === null) {
        return tx.driver.findUnique({
          where: { id: driver.id },
          include: { assignedVehicle: true, user: { select: { id: true, email: true } } },
        });
      }

      const vehicle = await tx.vehicle.findFirst({
        where: { id: body.vehicleId!, tenantId },
      });
      if (!vehicle) throw new ApiError(404, "Vehículo no encontrado", "NOT_FOUND");

      if (vehicle.status === VehicleStatus.en_taller) {
        throw new ApiError(400, "Vehículo en taller no puede asignarse", "VEHICLE_EN_TALLER");
      }
      if (vehicle.status !== VehicleStatus.disponible) {
        throw new ApiError(400, "Solo vehículos disponibles pueden asignarse", "VEHICLE_NOT_AVAILABLE");
      }

      const other = await tx.driver.findFirst({
        where: { assignedVehicleId: vehicle.id, NOT: { id: driver.id } },
      });
      if (other) {
        throw new ApiError(409, "El vehículo ya está asignado a otro conductor", "VEHICLE_TAKEN");
      }

      await tx.vehicle.update({
        where: { id: vehicle.id },
        data: { status: VehicleStatus.asignado },
      });

      return tx.driver.update({
        where: { id: driver.id },
        data: { assignedVehicleId: vehicle.id },
        include: { assignedVehicle: true, user: { select: { id: true, email: true } } },
      });
    });

    res.json({ success: true, data: updated });
  })
);

driversRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const driverId = req.params.id;

    const driver = await prisma.driver.findFirst({
      where: { id: driverId, tenantId },
    });
    if (!driver) throw new ApiError(404, "Conductor no encontrado", "NOT_FOUND");

    // Eliminar el conductor y sus datos relacionados en cascada
    await prisma.$transaction(async (tx) => {
      // Desasignar vehículo si tiene uno asignado
      if (driver.assignedVehicleId) {
        await tx.vehicle.update({
          where: { id: driver.assignedVehicleId },
          data: { status: VehicleStatus.disponible },
        });
      }

      // Eliminar el usuario del portal si existe
      if (driver.userId) {
        await tx.user.delete({
          where: { id: driver.userId },
        });
      }

      // Eliminar el conductor
      await tx.driver.delete({
        where: { id: driverId },
      });
    });

    res.status(204).send();
  })
);
