import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { Router } from "express";
import multer from "multer";
import { AttachmentKind, Role, ShipmentStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ApiError } from "../lib/apiError.js";
import { config } from "../config.js";
import { z } from "zod";
import { extensionForMimeType, isAllowedUploadMimeType } from "../lib/uploads.js";

const kindSchema = z.nativeEnum(AttachmentKind);

export const attachmentsRouter = Router();
attachmentsRouter.use(authenticate);

const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    const shipmentId = (req.params as { shipmentId?: string }).shipmentId;
    if (!shipmentId) {
      cb(new Error("shipmentId requerido"), "");
      return;
    }
    const tenantId = req.auth!.tenantId;
    const dir = path.join(config.uploadDir, tenantId, shipmentId);
    await fs.promises.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${randomUUID()}${extensionForMimeType(file.mimetype)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedUploadMimeType(file.mimetype)) {
      cb(new ApiError(400, "Solo se permiten PDF o imagenes JPG, PNG y WebP.", "UNSUPPORTED_FILE_TYPE"));
      return;
    }
    cb(null, true);
  },
});

attachmentsRouter.post(
  "/shipments/:shipmentId/attachments",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role !== Role.conductor && auth.role !== Role.admin) {
      throw new ApiError(403, "Solo conductor o admin sube adjuntos", "FORBIDDEN");
    }
    if (!req.file) throw new ApiError(400, "Archivo requerido (campo file)", "FILE_REQUIRED");

    const shipment = await prisma.shipment.findFirst({
      where: { id: req.params.shipmentId, tenantId: auth.tenantId },
      select: { id: true, driverId: true, status: true },
    });
    if (!shipment) throw new ApiError(404, "Envío no encontrado", "NOT_FOUND");

    if (auth.role === Role.conductor) {
      const user = await prisma.user.findUnique({ where: { id: auth.sub }, select: { driverId: true } });
      if (!user?.driverId || user.driverId !== shipment.driverId) {
        throw new ApiError(403, "No autorizado", "FORBIDDEN");
      }
      if (shipment.status === ShipmentStatus.entregado || shipment.status === ShipmentStatus.rechazado) {
        throw new ApiError(400, "No se pueden adjuntar archivos a un envío ya cerrado", "SHIPMENT_CLOSED");
      }
    }

    const rawKind = req.body?.kind;
    if (typeof rawKind !== "string") {
      throw new ApiError(400, "Campo kind requerido (delivery_photo o delivery_signature)", "KIND_REQUIRED");
    }
    const kind = kindSchema.parse(rawKind);

    const row = await prisma.shipmentAttachment.create({
      data: {
        tenantId: auth.tenantId,
        shipmentId: shipment.id,
        kind,
        fileName: req.file.filename,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        createdById: auth.sub,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: row.id,
        shipmentId: row.shipmentId,
        kind: row.kind,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        createdAt: row.createdAt,
        downloadPath: `/attachments/${row.id}/file`,
      },
    });
  })
);

attachmentsRouter.get(
  "/shipments/:shipmentId/attachments",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const shipment = await prisma.shipment.findFirst({
      where: { id: req.params.shipmentId, tenantId: auth.tenantId },
      select: { id: true, driverId: true, customerId: true },
    });
    if (!shipment) throw new ApiError(404, "Envío no encontrado", "NOT_FOUND");

    if (auth.role === Role.conductor) {
      const user = await prisma.user.findUnique({ where: { id: auth.sub }, select: { driverId: true } });
      if (!user?.driverId || user.driverId !== shipment.driverId) {
        throw new ApiError(403, "No autorizado", "FORBIDDEN");
      }
    } else if (auth.role === Role.cliente) {
      const user = await prisma.user.findUnique({ where: { id: auth.sub }, select: { customerId: true } });
      if (!user?.customerId || user.customerId !== shipment.customerId) {
        throw new ApiError(403, "No autorizado", "FORBIDDEN");
      }
    }

    const rows = await prisma.shipmentAttachment.findMany({
      where: { shipmentId: shipment.id, tenantId: auth.tenantId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        kind: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    });
    res.json({
      success: true,
      data: rows.map((r) => ({ ...r, downloadPath: `/attachments/${r.id}/file` })),
    });
  })
);

attachmentsRouter.get(
  "/attachments/:attachmentId/file",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const row = await prisma.shipmentAttachment.findFirst({
      where: { id: req.params.attachmentId, tenantId: auth.tenantId },
      include: { shipment: { select: { driverId: true, customerId: true } } },
    });
    if (!row) throw new ApiError(404, "Adjunto no encontrado", "NOT_FOUND");

    if (auth.role === Role.conductor) {
      const user = await prisma.user.findUnique({ where: { id: auth.sub }, select: { driverId: true } });
      if (!user?.driverId || user.driverId !== row.shipment.driverId) {
        throw new ApiError(403, "No autorizado", "FORBIDDEN");
      }
    } else if (auth.role === Role.cliente) {
      const user = await prisma.user.findUnique({ where: { id: auth.sub }, select: { customerId: true } });
      if (!user?.customerId || user.customerId !== row.shipment.customerId) {
        throw new ApiError(403, "No autorizado", "FORBIDDEN");
      }
    }

    const abs = path.join(config.uploadDir, row.tenantId, row.shipmentId, row.fileName);
    if (!fs.existsSync(abs)) throw new ApiError(404, "Archivo no disponible", "FILE_MISSING");

    res.setHeader("Content-Type", row.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${row.fileName}"`);
    fs.createReadStream(abs).pipe(res);
  })
);
