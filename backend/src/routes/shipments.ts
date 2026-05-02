import { Router } from "express";
import { z } from "zod";
import {
  AttachmentKind,
  CargoType,
  PaymentStatus,
  Prisma,
  Role,
  ShipmentStatus,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ApiError } from "../lib/apiError.js";
import { geocodeAddress } from "../lib/geocode.js";
import {
  assertConductorRecogidoPickupWindow,
  assertEntregadoPayload,
  assertUpfrontSatisfiedForRecogido,
  computeReadiness,
} from "../services/shipmentAutomation.js";
import {
  assertShipmentDriverVehicle,
  assertShipmentReadyForConfirm,
  assertUpfrontSatisfiedForConfirmado,
  canTransition,
  rejectionPhaseForTransition,
} from "../services/shipmentService.js";

/** Solo el rol cliente crea solicitudes; conductor/vehículo los asigna la empresa. */
const createSchema = z
  .object({
    customerId: z.string().optional(),
    origin: z.string().min(1),
    destination: z.string().min(1),
    pickupAddress: z.string().min(1).optional(),
    deliveryAddress: z.string().min(1).optional(),
    cargoDescription: z.string().optional(),
    cargoType: z.nativeEnum(CargoType),
    cargoQuantity: z.number().positive().optional(),
    cargoWeightKg: z.number().positive(),
    cargoVolumeM3: z.number().positive(),
    amount: z.number().nonnegative().optional(),
    requiresHelper: z.boolean().optional(),
    helperSurcharge: z.number().nonnegative().optional(),
    scheduledPickup: z.string().datetime(),
    scheduledDelivery: z.string().datetime(),
    pickupWindowStart: z.string().datetime().optional(),
    pickupWindowEnd: z.string().datetime().optional(),
    deliveryWindowStart: z.string().datetime().optional(),
    deliveryWindowEnd: z.string().datetime().optional(),
    pickupNotes: z.string().optional(),
    deliveryNotes: z.string().optional(),
    loadSequence: z.number().int().min(1).max(999).optional().nullable(),
    unloadAccess: z.string().max(500).optional().nullable(),
    /** Si el cliente eligió una sugerencia del mapa, se envían para evitar re-geocodificar. */
    originLat: z.number().min(-90).max(90).optional(),
    originLng: z.number().min(-180).max(180).optional(),
    destinationLat: z.number().min(-90).max(90).optional(),
    destinationLng: z.number().min(-180).max(180).optional(),
  })
  .refine(
    (d) => new Date(d.scheduledDelivery).getTime() >= new Date(d.scheduledPickup).getTime(),
    {
      message: "La fecha límite de entrega debe ser posterior al retiro.",
      path: ["scheduledDelivery"],
    }
  );

const updateSchema = z.object({
  status: z.nativeEnum(ShipmentStatus).optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  paymentTerm: z.enum(["upfront_full", "upfront_partial", "delivery"]).optional(),
  upfrontPercent: z.number().min(0).max(100).optional(),
  decisionNote: z.string().optional(),
  driverId: z.string().nullable().optional(),
  vehicleId: z.string().nullable().optional(),
  amount: z.number().nonnegative().optional(),
  requiresHelper: z.boolean().optional(),
  helperSurcharge: z.number().nonnegative().optional(),
  scheduledPickup: z.string().datetime().optional(),
  scheduledDelivery: z.string().datetime().optional(),
  pickupWindowStart: z.string().datetime().optional(),
  pickupWindowEnd: z.string().datetime().optional(),
  deliveryWindowStart: z.string().datetime().optional(),
  deliveryWindowEnd: z.string().datetime().optional(),
  pickupAddress: z.string().min(1).optional(),
  deliveryAddress: z.string().min(1).optional(),
  pickupNotes: z.string().optional(),
  deliveryNotes: z.string().optional(),
  loadSequence: z.number().int().min(1).max(999).optional().nullable(),
  unloadAccess: z.string().max(500).optional().nullable(),
  deliveredToName: z.string().min(2).optional(),
  deliveredToId: z.string().min(3).optional(),
  deliveryEvidence: z.string().min(3).optional(),
  deliveredLat: z.number().min(-90).max(90).optional(),
  deliveredLng: z.number().min(-180).max(180).optional(),
  note: z.string().optional(),
});

export const shipmentsRouter = Router();

shipmentsRouter.use(authenticate);

shipmentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const tenantId = auth.tenantId;
    const vista = typeof req.query.vista === "string" ? req.query.vista : undefined;

    const where: Prisma.ShipmentWhereInput = { tenantId };

    if (auth.role === Role.cliente) {
      const user = await prisma.user.findUnique({ where: { id: auth.sub } });
      if (!user?.customerId) {
        throw new ApiError(403, "Usuario cliente sin vínculo a cliente comercial", "FORBIDDEN");
      }
      where.customerId = user.customerId;
      if (vista === "activos") {
        where.status = { notIn: [ShipmentStatus.entregado, ShipmentStatus.rechazado] };
      } else if (vista === "finalizados") {
        where.status = ShipmentStatus.entregado;
      } else if (vista === "rechazados") {
        where.status = ShipmentStatus.rechazado;
      }
    } else if (auth.role === Role.conductor) {
      const user = await prisma.user.findUnique({ where: { id: auth.sub } });
      if (!user?.driverId) {
        throw new ApiError(403, "Usuario conductor sin perfil de conductor", "FORBIDDEN");
      }
      where.driverId = user.driverId;
      where.status = { notIn: [ShipmentStatus.pendiente, ShipmentStatus.rechazado] };
    } else {
      /** Admin: filtro opcional por conductor (p. ej. historial en pantalla Choferes). */
      const driverIdQ = typeof req.query.driverId === "string" ? req.query.driverId.trim() : "";
      if (driverIdQ) {
        const ok = await prisma.driver.findFirst({
          where: { id: driverIdQ, tenantId },
          select: { id: true },
        });
        if (!ok) throw new ApiError(404, "Conductor no encontrado", "NOT_FOUND");
        where.driverId = driverIdQ;
      }
    }

    const driverIdQ = typeof req.query.driverId === "string" ? req.query.driverId.trim() : "";
    const takeRaw = req.query.take;
    const take =
      auth.role === Role.admin && driverIdQ
        ? Math.min(500, Math.max(1, parseInt(String(takeRaw ?? "300"), 10) || 300))
        : undefined;

    const rows = await prisma.shipment.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        driver: { select: { id: true, fullName: true, phone: true, avatarUrl: true } },
        vehicle: { select: { id: true, plate: true, kind: true } },
        attachments: {
          select: { id: true, kind: true, mimeType: true, sizeBytes: true, createdAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
      ...(take ? { take } : {}),
    });

    const paymentAgg =
      rows.length > 0
        ? await prisma.payment.groupBy({
            by: ["shipmentId"],
            where: {
              tenantId,
              shipmentId: { in: rows.map((r) => r.id) },
              verificationStatus: "aprobado",
            },
            _sum: { amount: true },
          })
        : [];
    const paidByShipment = new Map(
      paymentAgg
        .filter((x) => x.shipmentId)
        .map((x) => [x.shipmentId!, new Prisma.Decimal(x._sum.amount ?? 0)])
    );
    const data = rows.map((r) => {
      const target = r.totalAmount ?? r.amount ?? new Prisma.Decimal(0);
      const paid = paidByShipment.get(r.id) ?? new Prisma.Decimal(0);
      const balance = target.sub(paid);
      return {
        ...r,
        paidAmount: paid.toString(),
        balanceAmount: (balance.gt(0) ? balance : new Prisma.Decimal(0)).toString(),
      };
    });

    res.json({ success: true, data });
  })
);

/** Checklist de automatización / reglas de negocio (quién recibe, anticipos, etc.). */
shipmentsRouter.get(
  "/:id/readiness",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const tenantId = auth.tenantId;
    const row = await prisma.shipment.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!row) throw new ApiError(404, "Envío no encontrado", "NOT_FOUND");

    if (auth.role === Role.cliente) {
      const user = await prisma.user.findUnique({ where: { id: auth.sub } });
      if (row.customerId !== user?.customerId) throw new ApiError(403, "No autorizado", "FORBIDDEN");
    } else if (auth.role === Role.conductor) {
      const user = await prisma.user.findUnique({ where: { id: auth.sub } });
      if (row.driverId !== user?.driverId) throw new ApiError(403, "No autorizado", "FORBIDDEN");
    }

    const [payAgg, attCount] = await Promise.all([
      prisma.payment.aggregate({
        where: { shipmentId: row.id, verificationStatus: "aprobado" },
        _sum: { amount: true },
      }),
      prisma.shipmentAttachment.count({
        where: {
          shipmentId: row.id,
          kind: { in: [AttachmentKind.delivery_photo, AttachmentKind.delivery_signature] },
        },
      }),
    ]);
    const paid = payAgg._sum.amount ?? new Prisma.Decimal(0);
    const data = computeReadiness(row, {
      paidApproved: paid,
      deliveryAttachmentCount: attCount,
    });
    res.json({ success: true, data });
  })
);

const shipmentDetailInclude = {
  customer: true,
  driver: true,
  vehicle: true,
  statusHistory: {
    orderBy: { createdAt: "asc" as const },
    include: { changedBy: { select: { id: true, email: true, role: true } } },
  },
} as const;

shipmentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const row = await prisma.shipment.findFirst({
      where: { id: req.params.id, tenantId: auth.tenantId },
      include: shipmentDetailInclude,
    });
    if (!row) throw new ApiError(404, "Envío no encontrado", "NOT_FOUND");

    if (auth.role === Role.cliente) {
      const user = await prisma.user.findUnique({ where: { id: auth.sub } });
      if (row.customerId !== user?.customerId) {
        throw new ApiError(403, "No autorizado", "FORBIDDEN");
      }
    } else if (auth.role === Role.conductor) {
      const user = await prisma.user.findUnique({ where: { id: auth.sub } });
      if (row.driverId !== user?.driverId) {
        throw new ApiError(403, "No autorizado", "FORBIDDEN");
      }
    }

    const needsOrigin = row.originLat == null || row.originLng == null;
    const needsDest = row.destinationLat == null || row.destinationLng == null;
    if (needsOrigin || needsDest) {
      const data: Prisma.ShipmentUpdateInput = {};
      if (needsOrigin) {
        const g = await geocodeAddress(row.origin);
        if (g) {
          data.originLat = new Prisma.Decimal(g.lat);
          data.originLng = new Prisma.Decimal(g.lng);
        }
      }
      if (needsDest) {
        if (needsOrigin) {
          await new Promise((r) => setTimeout(r, 1100));
        }
        const g = await geocodeAddress(row.destination);
        if (g) {
          data.destinationLat = new Prisma.Decimal(g.lat);
          data.destinationLng = new Prisma.Decimal(g.lng);
        }
      }
      if (Object.keys(data).length > 0) {
        await prisma.shipment.update({ where: { id: row.id }, data });
        const refreshed = await prisma.shipment.findFirst({
          where: { id: req.params.id, tenantId: auth.tenantId },
          include: shipmentDetailInclude,
        });
        if (refreshed) {
          res.json({ success: true, data: refreshed });
          return;
        }
      }
    }

    res.json({ success: true, data: row });
  })
);

shipmentsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const tenantId = auth.tenantId;
    const body = createSchema.parse(req.body);

    let customerId = body.customerId;
    if (auth.role === Role.cliente) {
      const user = await prisma.user.findUnique({ where: { id: auth.sub } });
      if (!user?.customerId) throw new ApiError(403, "Sin cliente vinculado", "FORBIDDEN");
      customerId = user.customerId;
    }
    if (auth.role === Role.conductor) {
      throw new ApiError(403, "Los conductores no crean envíos", "FORBIDDEN");
    }
    if (auth.role === Role.admin) {
      throw new ApiError(
        403,
        "Los envíos solo pueden ser solicitados por clientes. El administrador aprueba o rechaza la solicitud.",
        "ADMIN_CANNOT_CREATE_SHIPMENT"
      );
    }
    if (!customerId) throw new ApiError(400, "customerId requerido", "VALIDATION");

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, tenantId },
    });
    if (!customer) throw new ApiError(404, "Cliente no encontrado", "NOT_FOUND");

    const tariff = await prisma.tariffRule.findFirst({
      where: {
        tenantId,
        active: true,
        origin: body.origin,
        destination: body.destination,
        cargoType: body.cargoType ?? null,
        OR: [{ customerId }, { customerId: null }],
      },
      orderBy: { customerId: "desc" },
    });
    const baseAmount = body.amount ?? (tariff ? Number(tariff.baseAmount) : undefined);
    const helperSurcharge =
      body.helperSurcharge ??
      (body.requiresHelper ? (tariff ? Number(tariff.helperSurcharge) : 0) : 0);
    const totalAmount =
      baseAmount !== undefined ? baseAmount + ((body.requiresHelper ?? false) ? helperSurcharge : 0) : undefined;

    const originGeo =
      body.originLat !== undefined && body.originLng !== undefined
        ? { lat: body.originLat, lng: body.originLng }
        : await geocodeAddress(body.origin);
    const destGeo =
      body.destinationLat !== undefined && body.destinationLng !== undefined
        ? { lat: body.destinationLat, lng: body.destinationLng }
        : await geocodeAddress(body.destination);

    const shipment = await prisma.$transaction(async (tx) => {
      const s = await tx.shipment.create({
        data: {
          tenantId,
          customerId,
          origin: body.origin,
          pickupAddress: body.pickupAddress ?? body.origin,
          originLat: originGeo ? new Prisma.Decimal(originGeo.lat) : undefined,
          originLng: originGeo ? new Prisma.Decimal(originGeo.lng) : undefined,
          destination: body.destination,
          deliveryAddress: body.deliveryAddress ?? body.destination,
          destinationLat: destGeo ? new Prisma.Decimal(destGeo.lat) : undefined,
          destinationLng: destGeo ? new Prisma.Decimal(destGeo.lng) : undefined,
          cargoType: body.cargoType,
          cargoQuantity:
            body.cargoQuantity !== undefined ? new Prisma.Decimal(body.cargoQuantity) : undefined,
          cargoWeightKg:
            body.cargoWeightKg !== undefined ? new Prisma.Decimal(body.cargoWeightKg) : undefined,
          cargoVolumeM3:
            body.cargoVolumeM3 !== undefined ? new Prisma.Decimal(body.cargoVolumeM3) : undefined,
          cargoDescription: body.cargoDescription,
          amount: baseAmount !== undefined ? new Prisma.Decimal(baseAmount) : undefined,
          baseAmount: baseAmount !== undefined ? new Prisma.Decimal(baseAmount) : undefined,
          requiresHelper: body.requiresHelper ?? false,
          helperSurcharge: new Prisma.Decimal(helperSurcharge),
          totalAmount: totalAmount !== undefined ? new Prisma.Decimal(totalAmount) : undefined,
          scheduledPickup: new Date(body.scheduledPickup),
          scheduledDelivery: new Date(body.scheduledDelivery),
          pickupWindowStart: body.pickupWindowStart ? new Date(body.pickupWindowStart) : undefined,
          pickupWindowEnd: body.pickupWindowEnd ? new Date(body.pickupWindowEnd) : undefined,
          deliveryWindowStart: body.deliveryWindowStart ? new Date(body.deliveryWindowStart) : undefined,
          deliveryWindowEnd: body.deliveryWindowEnd ? new Date(body.deliveryWindowEnd) : undefined,
          pickupNotes: body.pickupNotes,
          deliveryNotes: body.deliveryNotes,
          loadSequence: body.loadSequence ?? undefined,
          unloadAccess: body.unloadAccess?.trim() || undefined,
          driverId: undefined,
          vehicleId: undefined,
          status: ShipmentStatus.pendiente,
        },
      });
      await tx.shipmentStatusHistory.create({
        data: {
          shipmentId: s.id,
          fromStatus: null,
          toStatus: ShipmentStatus.pendiente,
          note: "Envío creado",
          changedById: auth.sub,
        },
      });
      return s;
    });

    const full = await prisma.shipment.findUnique({
      where: { id: shipment.id },
      include: {
        customer: { select: { id: true, name: true } },
        driver: true,
        vehicle: true,
      },
    });

    res.status(201).json({ success: true, data: full });
  })
);

shipmentsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const tenantId = auth.tenantId;
    const body = updateSchema.parse(req.body);

    const existing = await prisma.shipment.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!existing) throw new ApiError(404, "Envío no encontrado", "NOT_FOUND");

    if (auth.role === Role.cliente) {
      const user = await prisma.user.findUnique({ where: { id: auth.sub } });
      if (existing.customerId !== user?.customerId) {
        throw new ApiError(403, "No autorizado", "FORBIDDEN");
      }
      throw new ApiError(403, "El cliente no puede modificar envíos en este MVP", "FORBIDDEN");
    }

    if (auth.role === Role.conductor) {
      const user = await prisma.user.findUnique({ where: { id: auth.sub } });
      if (existing.driverId !== user?.driverId) {
        throw new ApiError(403, "No autorizado", "FORBIDDEN");
      }
      if (
        body.driverId !== undefined ||
        body.vehicleId !== undefined ||
        body.paymentStatus !== undefined
      ) {
        throw new ApiError(403, "El conductor solo puede cambiar estado", "FORBIDDEN");
      }
      if (body.status === undefined) {
        throw new ApiError(400, "Debe enviar el nuevo estado", "VALIDATION");
      }
    }

    if (body.status !== undefined && body.status !== existing.status) {
      if (!canTransition(auth.role, existing.status, body.status)) {
        throw new ApiError(400, "Transición de estado no permitida (siga el flujo: recogida → ruta → entrega, o use rechazado).", "INVALID_TRANSITION");
      }
      if (body.status === ShipmentStatus.recogido) {
        await assertUpfrontSatisfiedForRecogido(prisma, existing);
        if (auth.role === Role.conductor) {
          assertConductorRecogidoPickupWindow(existing);
        }
      }
      if (body.status === ShipmentStatus.entregado) {
        await assertEntregadoPayload(
          prisma,
          {
            id: existing.id,
            deliveredToName: body.deliveredToName ?? existing.deliveredToName,
            deliveryEvidence: body.deliveryEvidence ?? existing.deliveryEvidence,
          },
          body
        );
      }
    }

    let nextDriverId = existing.driverId;
    let nextVehicleId = existing.vehicleId;
    if (auth.role === Role.admin) {
      if (body.driverId !== undefined) nextDriverId = body.driverId;
      if (body.vehicleId !== undefined) nextVehicleId = body.vehicleId;
    }

    const resolvedVehicleId = await assertShipmentDriverVehicle(
      tenantId,
      nextDriverId,
      nextVehicleId
    );

    await prisma.$transaction(async (tx) => {
      let row = await tx.shipment.findUnique({ where: { id: existing.id } });
      if (!row) throw new ApiError(404, "Envío no encontrado", "NOT_FOUND");

      if (
        auth.role === Role.admin &&
        (body.driverId !== undefined || body.vehicleId !== undefined)
      ) {
        row = await tx.shipment.update({
          where: { id: existing.id },
          data: {
            driverId: nextDriverId,
            vehicleId: resolvedVehicleId ?? nextVehicleId,
          },
        });
      }

      if (body.paymentStatus !== undefined && auth.role === Role.admin) {
        row = await tx.shipment.update({
          where: { id: existing.id },
          data: { paymentStatus: body.paymentStatus },
        });
      }

      if (
        auth.role === Role.admin &&
        (body.amount !== undefined ||
          body.requiresHelper !== undefined ||
          body.helperSurcharge !== undefined ||
          body.paymentTerm !== undefined ||
          body.upfrontPercent !== undefined ||
          body.decisionNote !== undefined ||
          body.scheduledPickup !== undefined ||
          body.scheduledDelivery !== undefined ||
          body.pickupWindowStart !== undefined ||
          body.pickupWindowEnd !== undefined ||
          body.deliveryWindowStart !== undefined ||
          body.deliveryWindowEnd !== undefined ||
          body.pickupAddress !== undefined ||
          body.deliveryAddress !== undefined ||
          body.pickupNotes !== undefined ||
          body.deliveryNotes !== undefined ||
          body.loadSequence !== undefined ||
          body.unloadAccess !== undefined)
      ) {
        const nextBaseAmount =
          body.amount !== undefined ? new Prisma.Decimal(body.amount) : row.baseAmount ?? row.amount;
        const nextRequiresHelper = body.requiresHelper ?? row.requiresHelper;
        const nextHelperSurcharge =
          body.helperSurcharge !== undefined
            ? new Prisma.Decimal(body.helperSurcharge)
            : row.helperSurcharge ?? new Prisma.Decimal(0);
        const nextTotal =
          nextBaseAmount != null
            ? nextBaseAmount.add(nextRequiresHelper ? nextHelperSurcharge : new Prisma.Decimal(0))
            : null;
        const nextPaymentTerm = body.paymentTerm ?? row.paymentTerm;
        const nextUpfrontPercent =
          body.upfrontPercent !== undefined ? new Prisma.Decimal(body.upfrontPercent) : row.upfrontPercent;
        const nextUpfrontAmount =
          nextPaymentTerm === "upfront_full"
            ? nextTotal
            : nextPaymentTerm === "upfront_partial"
              ? nextTotal && nextUpfrontPercent
                ? nextTotal.mul(nextUpfrontPercent).div(new Prisma.Decimal(100))
                : row.upfrontAmount
              : new Prisma.Decimal(0);

        row = await tx.shipment.update({
          where: { id: existing.id },
          data: {
            amount: nextBaseAmount ?? undefined,
            baseAmount: nextBaseAmount ?? undefined,
            requiresHelper: nextRequiresHelper,
            helperSurcharge: nextHelperSurcharge,
            totalAmount: nextTotal ?? undefined,
            paymentTerm: nextPaymentTerm,
            upfrontPercent: nextUpfrontPercent ?? undefined,
            upfrontAmount: nextUpfrontAmount ?? undefined,
            ...(body.scheduledPickup !== undefined ? { scheduledPickup: new Date(body.scheduledPickup) } : {}),
            ...(body.scheduledDelivery !== undefined ? { scheduledDelivery: new Date(body.scheduledDelivery) } : {}),
            ...(body.pickupWindowStart !== undefined ? { pickupWindowStart: new Date(body.pickupWindowStart) } : {}),
            ...(body.pickupWindowEnd !== undefined ? { pickupWindowEnd: new Date(body.pickupWindowEnd) } : {}),
            ...(body.deliveryWindowStart !== undefined ? { deliveryWindowStart: new Date(body.deliveryWindowStart) } : {}),
            ...(body.deliveryWindowEnd !== undefined ? { deliveryWindowEnd: new Date(body.deliveryWindowEnd) } : {}),
            ...(body.pickupAddress !== undefined ? { pickupAddress: body.pickupAddress } : {}),
            ...(body.deliveryAddress !== undefined ? { deliveryAddress: body.deliveryAddress } : {}),
            ...(body.pickupNotes !== undefined ? { pickupNotes: body.pickupNotes } : {}),
            ...(body.deliveryNotes !== undefined ? { deliveryNotes: body.deliveryNotes } : {}),
            ...(body.loadSequence !== undefined ? { loadSequence: body.loadSequence } : {}),
            ...(body.unloadAccess !== undefined
              ? {
                  unloadAccess:
                    body.unloadAccess && body.unloadAccess.trim() ? body.unloadAccess.trim() : null,
                }
              : {}),
            ...(body.decisionNote !== undefined ? { decisionNote: body.decisionNote } : {}),
          },
        });
      }

      if (body.status !== undefined && body.status !== row.status) {
        if (auth.role !== Role.admin && body.status === ShipmentStatus.confirmado) {
          throw new ApiError(403, "Solo admin puede aprobar solicitudes", "FORBIDDEN");
        }
        if (
          auth.role !== Role.admin &&
          body.status === ShipmentStatus.rechazado &&
          row.status === ShipmentStatus.pendiente
        ) {
          throw new ApiError(
            403,
            "Solo admin puede rechazar la solicitud antes de aprobarla. En ruta, el conductor puede registrar rechazo en origen o en destino.",
            "FORBIDDEN"
          );
        }
        if (auth.role === Role.admin && body.status === ShipmentStatus.confirmado) {
          const approvalTotal = row.totalAmount ?? row.amount ?? new Prisma.Decimal(0);
          if (approvalTotal.lte(0)) {
            throw new ApiError(400, "Para aprobar debe definir monto del servicio", "APPROVAL_AMOUNT_REQUIRED");
          }
          if (row.paymentTerm === "upfront_partial" && !row.upfrontPercent) {
            throw new ApiError(400, "Para anticipo parcial debe definir porcentaje", "UPFRONT_PERCENT_REQUIRED");
          }
          assertShipmentReadyForConfirm({
            scheduledPickup: row.scheduledPickup,
            scheduledDelivery: row.scheduledDelivery,
            driverId: row.driverId,
            vehicleId: row.vehicleId,
          });
          await assertUpfrontSatisfiedForConfirmado(tx, row);
        }
        if (!canTransition(auth.role, row.status, body.status)) {
          throw new ApiError(400, "Transición de estado no permitida", "INVALID_TRANSITION");
        }
        const fromStatus = row.status;
        await tx.shipment.update({
          where: { id: existing.id },
          data: {
            status: body.status,
            ...(body.status === ShipmentStatus.rechazado
              ? { rejectionPhase: rejectionPhaseForTransition(fromStatus) }
              : { rejectionPhase: null }),
            ...(auth.role === Role.admin &&
            (body.status === ShipmentStatus.confirmado || body.status === ShipmentStatus.rechazado)
              ? {
                  approvedById: auth.sub,
                  approvedAt: new Date(),
                  decisionNote:
                    body.decisionNote ??
                    (body.status === ShipmentStatus.confirmado ? "Solicitud aprobada" : "Solicitud rechazada"),
                }
              : {}),
            ...(body.status === ShipmentStatus.recogido ? { pickedUpAt: new Date() } : {}),
            ...(body.status === ShipmentStatus.en_transito ? { enTransitoAt: new Date() } : {}),
            ...(body.status === ShipmentStatus.entregado
              ? {
                  deliveredToName: body.deliveredToName?.trim() || row.deliveredToName,
                  deliveredToId: body.deliveredToId?.trim() || row.deliveredToId,
                  deliveryEvidence: body.deliveryEvidence?.trim() || row.deliveryEvidence,
                  deliveredLat:
                    body.deliveredLat !== undefined
                      ? new Prisma.Decimal(body.deliveredLat)
                      : row.deliveredLat,
                  deliveredLng:
                    body.deliveredLng !== undefined
                      ? new Prisma.Decimal(body.deliveredLng)
                      : row.deliveredLng,
                  deliveredAt: new Date(),
                }
              : {}),
          },
        });
        await tx.shipmentStatusHistory.create({
          data: {
            shipmentId: row.id,
            fromStatus,
            toStatus: body.status,
            note: body.note,
            changedById: auth.sub,
          },
        });
      }
    });

    const full = await prisma.shipment.findUnique({
      where: { id: existing.id },
      include: {
        customer: { select: { id: true, name: true } },
        driver: true,
        vehicle: true,
        statusHistory: {
          orderBy: { createdAt: "asc" },
          include: { changedBy: { select: { id: true, email: true, role: true } } },
        },
      },
    });

    res.json({ success: true, data: full });
  })
);

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const LOCATION_ALLOWED_STATUS = new Set<ShipmentStatus>([
  ShipmentStatus.confirmado,
  ShipmentStatus.recogido,
  ShipmentStatus.en_transito,
]);

shipmentsRouter.post(
  "/:id/location",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const { lat, lng } = locationSchema.parse(req.body);
    const existing = await prisma.shipment.findFirst({
      where: { id: req.params.id, tenantId: auth.tenantId },
    });
    if (!existing) throw new ApiError(404, "Envío no encontrado", "NOT_FOUND");

    if (auth.role !== Role.conductor) {
      throw new ApiError(
        403,
        "Solo el conductor asignado puede reportar la ubicación del envío.",
        "LOCATION_CONDUCTOR_ONLY"
      );
    }
    const user = await prisma.user.findUnique({ where: { id: auth.sub } });
    if (existing.driverId !== user?.driverId) {
      throw new ApiError(403, "No autorizado", "FORBIDDEN");
    }
    if (!LOCATION_ALLOWED_STATUS.has(existing.status)) {
      throw new ApiError(
        400,
        "Solo se puede reportar ubicación con el envío confirmado, en retiro o en tránsito.",
        "LOCATION_INVALID_STATUS"
      );
    }

    const updated = await prisma.shipment.update({
      where: { id: existing.id },
      data: {
        lastLat: new Prisma.Decimal(lat),
        lastLng: new Prisma.Decimal(lng),
        lastReportedAt: new Date(),
      },
    });
    res.json({ success: true, data: updated });
  })
);
