import { Router } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ApiError } from "../lib/apiError.js";

const postSchema = z.object({
  body: z.string().min(1).max(8000),
  shipmentId: z.string().optional(),
});

export const supportRouter = Router();
supportRouter.use(authenticate);

/** Mensajes texto entre chofer y empresa (base para chat; WebRTC es otro flujo). */
supportRouter.get(
  "/support/messages",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const driverIdParam = typeof req.query.driverId === "string" ? req.query.driverId : undefined;

    if (auth.role === Role.admin) {
      const where =
        driverIdParam !== undefined && driverIdParam.length > 0
          ? { tenantId: auth.tenantId, driverId: driverIdParam }
          : { tenantId: auth.tenantId };
      const rows = await prisma.supportMessage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          driver: { select: { id: true, fullName: true, phone: true } },
          shipment: { select: { id: true, origin: true, destination: true } },
          author: { select: { id: true, email: true, role: true } },
        },
      });
      return res.json({ success: true, data: rows });
    }

    if (auth.role !== Role.conductor) {
      throw new ApiError(403, "No autorizado", "FORBIDDEN");
    }
    const user = await prisma.user.findUnique({ where: { id: auth.sub }, select: { driverId: true } });
    if (!user?.driverId) throw new ApiError(403, "Sin conductor vinculado", "FORBIDDEN");

    const rows = await prisma.supportMessage.findMany({
      where: { tenantId: auth.tenantId, driverId: user.driverId },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: {
        driver: { select: { id: true, fullName: true, phone: true } },
        shipment: { select: { id: true, origin: true, destination: true } },
        author: { select: { id: true, email: true, role: true } },
      },
    });
    res.json({ success: true, data: rows });
  })
);

supportRouter.post(
  "/support/messages",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role !== Role.conductor && auth.role !== Role.admin) {
      throw new ApiError(403, "No autorizado", "FORBIDDEN");
    }
    const input = postSchema.parse(req.body);

    let driverId: string;
    if (auth.role === Role.conductor) {
      const user = await prisma.user.findUnique({ where: { id: auth.sub }, select: { driverId: true } });
      if (!user?.driverId) throw new ApiError(403, "Sin conductor vinculado", "FORBIDDEN");
      driverId = user.driverId;
    } else {
      const did = typeof req.body?.driverId === "string" ? req.body.driverId : "";
      if (!did) throw new ApiError(400, "Administrador debe indicar driverId del chofer", "DRIVER_ID_REQUIRED");
      const d = await prisma.driver.findFirst({ where: { id: did, tenantId: auth.tenantId } });
      if (!d) throw new ApiError(404, "Chofer no encontrado", "NOT_FOUND");
      driverId = d.id;
    }

    if (input.shipmentId) {
      const sh = await prisma.shipment.findFirst({
        where: { id: input.shipmentId, tenantId: auth.tenantId },
        select: { id: true, driverId: true },
      });
      if (!sh) throw new ApiError(404, "Envío no encontrado", "NOT_FOUND");
      if (auth.role === Role.conductor && sh.driverId !== driverId) {
        throw new ApiError(403, "El envío no está asignado a tu cuenta", "FORBIDDEN");
      }
    }

    const row = await prisma.supportMessage.create({
      data: {
        tenantId: auth.tenantId,
        driverId,
        shipmentId: input.shipmentId,
        authorRole: auth.role,
        authorUserId: auth.sub,
        body: input.body.trim(),
      },
      include: {
        shipment: { select: { id: true, origin: true, destination: true } },
        author: { select: { id: true, email: true, role: true } },
      },
    });
    res.status(201).json({ success: true, data: row });
  })
);

supportRouter.delete(
  "/support/messages/:id",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role !== Role.admin) {
      throw new ApiError(403, "Solo administración puede eliminar mensajes de la bandeja", "FORBIDDEN");
    }
    const id = req.params.id;
    const row = await prisma.supportMessage.findFirst({
      where: { id, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!row) throw new ApiError(404, "Mensaje no encontrado", "NOT_FOUND");
    await prisma.supportMessage.delete({ where: { id } });
    res.json({ success: true, data: { id } });
  })
);

/** STUN público + nota de signaling (sin servidor SFU en este MVP). */
supportRouter.get(
  "/communications/webrtc/config",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role !== Role.conductor && auth.role !== Role.admin) {
      throw new ApiError(403, "No autorizado", "FORBIDDEN");
    }
    res.json({
      success: true,
      data: {
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        signaling: "not_configured",
        hint:
          "Intercambio de SDP/ICE requiere un servidor de signaling (WS) o proveedor (Daily, Twilio, etc.). Mientras tanto usá mensajes de soporte o teléfono.",
      },
    });
  })
);

supportRouter.post(
  "/communications/webrtc/session",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role !== Role.conductor && auth.role !== Role.admin) {
      throw new ApiError(403, "No autorizado", "FORBIDDEN");
    }
    const shipmentId = typeof req.body?.shipmentId === "string" ? req.body.shipmentId : undefined;
    if (shipmentId) {
      const sh = await prisma.shipment.findFirst({
        where: { id: shipmentId, tenantId: auth.tenantId },
        select: { id: true },
      });
      if (!sh) throw new ApiError(404, "Envío no encontrado", "NOT_FOUND");
    }
    res.status(202).json({
      success: true,
      data: {
        sessionId: `sess_${Date.now().toString(36)}`,
        status: "pending_signaling",
        message:
          "Sesión registrada a nivel demo. Para llamada real integrá un proveedor WebRTC o un canal WebSocket para intercambiar SDP/ICE.",
      },
    });
  })
);
