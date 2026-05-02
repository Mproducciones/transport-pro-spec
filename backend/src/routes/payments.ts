import { Router } from "express";
import { z } from "zod";
import { PaymentStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ApiError } from "../lib/apiError.js";
import { buildMockProofReference, parseMockProofReference } from "../lib/mockProof.js";
import { streamPaymentProofPdf } from "../services/paymentProofPdf.js";
import { config } from "../config.js";
import { notifyPaymentVerificationEmail } from "../lib/clientNotify.js";
import { ALLOWED_UPLOAD_MIME_TYPES, isReasonableBase64Payload } from "../lib/uploads.js";

const createSchemaBase = z.object({
  invoiceId: z.string().optional(),
  shipmentId: z.string().optional(),
  amount: z.number().positive(),
  method: z.string().min(1),
  reference: z.string().optional(),
  paidAt: z.string().datetime().optional(),
  proofFileName: z.string().min(3).max(120).optional(),
  proofMimeType: z.enum(ALLOWED_UPLOAD_MIME_TYPES).optional(),
  proofBase64: z.string().min(16).max(5000000).refine(isReasonableBase64Payload, "Comprobante inválido").optional(),
});

const createSchema = createSchemaBase.superRefine((d, ctx) => {
  if (!d.invoiceId && !d.shipmentId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Indique factura o envio",
      path: ["shipmentId"],
    });
  }
  const count = Number(Boolean(d.proofFileName)) + Number(Boolean(d.proofMimeType)) + Number(Boolean(d.proofBase64));
  if (!(count === 0 || count === 3)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Para adjuntar comprobante debe enviar nombre, tipo de archivo y contenido.",
      path: ["proofBase64"],
    });
  }
});

const verifySchema = z.object({
  status: z.enum(["aprobado", "rechazado"]),
  note: z.string().optional(),
});

const resubmitProofSchema = z.object({
  proofFileName: z.string().min(3).max(120),
  proofMimeType: z.enum(ALLOWED_UPLOAD_MIME_TYPES),
  proofBase64: z.string().min(16).max(5000000).refine(isReasonableBase64Payload, "Comprobante inválido"),
});

async function refreshShipmentPaymentStatus(tx: Prisma.TransactionClient, shipmentId: string) {
  const shipment = await tx.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) return;
  const targetAmount = shipment.totalAmount ?? shipment.amount;
  const agg = await tx.payment.aggregate({
    where: { shipmentId, verificationStatus: "aprobado" },
    _sum: { amount: true },
  });
  const paid = agg._sum.amount ?? new Prisma.Decimal(0);
  let paymentStatus: PaymentStatus = PaymentStatus.pendiente;
  if (targetAmount) {
    if (paid.gte(targetAmount)) paymentStatus = PaymentStatus.pagado;
    else if (paid.gt(0)) paymentStatus = PaymentStatus.parcial;
  } else if (paid.gt(0)) {
    paymentStatus = PaymentStatus.pagado;
  }
  await tx.shipment.update({ where: { id: shipmentId }, data: { paymentStatus } });
}

async function assertInvoicePaymentWithinBalance(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  amount: Prisma.Decimal,
  excludePaymentId?: string
) {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });
  if (!invoice) throw new ApiError(404, "Factura no encontrada", "NOT_FOUND");
  if (invoice.status === "anulada") throw new ApiError(400, "La factura está anulada", "INVOICE_VOID");
  if (invoice.status === "borrador") throw new ApiError(400, "Factura aún en borrador", "INVOICE_DRAFT");

  const approved = invoice.payments
    .filter((p) => p.id !== excludePaymentId && p.verificationStatus === "aprobado")
    .reduce((sum, p) => sum.add(p.amount), new Prisma.Decimal(0));
  const balance = invoice.total.sub(approved);
  if (balance.lte(0)) {
    throw new ApiError(400, "La factura no tiene saldo pendiente", "INVOICE_PAID");
  }
  if (amount.gt(balance)) {
    throw new ApiError(400, "El monto supera el saldo pendiente de la factura", "PAYMENT_EXCEEDS_BALANCE");
  }
}

function mapPayment<T extends { reference: string | null }>(row: T) {
  const proof = parseMockProofReference(row.reference);
  return {
    ...row,
    mockProof: proof
      ? {
          fileName: proof.fileName,
          mimeType: proof.mimeType,
          sizeBytes: proof.sizeBytes,
          hasInlineData: proof.hasInlineData,
        }
      : null,
  };
}

export const paymentsRouter = Router();

paymentsRouter.use(authenticate);

paymentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const tenantId = auth.tenantId;

    const where: Prisma.PaymentWhereInput = { tenantId };
    if (auth.role === Role.cliente) {
      const user = await prisma.user.findUnique({ where: { id: auth.sub } });
      if (!user?.customerId) throw new ApiError(403, "Sin cliente vinculado", "FORBIDDEN");
      where.OR = [
        { invoice: { customerId: user.customerId } },
        { shipment: { customerId: user.customerId } },
      ];
    } else if (auth.role === Role.conductor) {
      const user = await prisma.user.findUnique({ where: { id: auth.sub } });
      if (!user?.driverId) throw new ApiError(403, "Sin perfil de conductor", "FORBIDDEN");
      where.shipment = { driverId: user.driverId };
    }

    const rows = await prisma.payment.findMany({
      where,
      include: {
        invoice: { select: { id: true, number: true, total: true, customer: { select: { name: true } } } },
        shipment: {
          select: {
            id: true,
            origin: true,
            destination: true,
            totalAmount: true,
            amount: true,
            paymentStatus: true,
            customer: { select: { name: true } },
            invoiceLines: {
              select: {
                invoice: { select: { id: true, number: true } },
              },
            },
          },
        },
        recordedBy: { select: { id: true, email: true, role: true } },
        verifiedBy: { select: { id: true, email: true } },
      },
      orderBy: { paidAt: "desc" },
    });
    res.json({ success: true, data: rows.map(mapPayment) });
  })
);

paymentsRouter.get(
  "/:id/proof-file",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const payment = await prisma.payment.findFirst({
      where: { id: req.params.id, tenantId: auth.tenantId },
      include: {
        invoice: { select: { customerId: true } },
        shipment: { select: { customerId: true } },
      },
    });
    if (!payment) throw new ApiError(404, "Pago no encontrado", "NOT_FOUND");

    if (auth.role === Role.cliente) {
      const user = await prisma.user.findUnique({ where: { id: auth.sub } });
      const cid = user?.customerId;
      const ok =
        (payment.invoiceId && payment.invoice?.customerId === cid) ||
        (payment.shipmentId && payment.shipment?.customerId === cid);
      if (!ok) throw new ApiError(403, "No autorizado", "FORBIDDEN");
    } else if (auth.role === Role.conductor) {
      throw new ApiError(403, "No autorizado", "FORBIDDEN");
    }

    const mockProof = parseMockProofReference(payment.reference);
    if (mockProof?.base64) {
      const buffer = Buffer.from(mockProof.base64, "base64");
      res.setHeader("Content-Type", mockProof.mimeType);
      res.setHeader("Content-Length", String(buffer.length));
      res.setHeader("Content-Disposition", `inline; filename="${mockProof.fileName.replace(/"/g, "")}"`);
      res.end(buffer);
      return;
    }

    streamPaymentProofPdf({ reference: payment.reference, res, paymentId: payment.id });
  })
);

paymentsRouter.post(
  "/:id/resubmit",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role !== Role.cliente) {
      throw new ApiError(403, "Solo el portal cliente puede reenviar comprobantes desde aquí", "FORBIDDEN");
    }
    const body = resubmitProofSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: auth.sub } });
    if (!user?.customerId) throw new ApiError(403, "Sin cliente vinculado", "FORBIDDEN");

    const reference = buildMockProofReference({
      fileName: body.proofFileName,
      mimeType: body.proofMimeType,
      base64: body.proofBase64,
    });

    const updated = await prisma.payment.updateMany({
      where: {
        id: req.params.id,
        tenantId: auth.tenantId,
        verificationStatus: { in: ["rechazado", "pendiente"] },
        OR: [
          { invoice: { customerId: user.customerId } },
          { shipment: { customerId: user.customerId } },
        ],
      },
      data: {
        reference,
        verificationStatus: "pendiente",
        verificationNote: null,
        verifiedById: null,
        verifiedAt: null,
      },
    });
    if (updated.count === 0) {
      throw new ApiError(
        404,
        "Pago no encontrado, no está en estado pendiente/rechazado o no autorizado",
        "NOT_FOUND"
      );
    }

    const full = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: {
        invoice: { select: { id: true, number: true, total: true } },
        shipment: { select: { id: true, origin: true, destination: true } },
        recordedBy: { select: { id: true, email: true } },
        verifiedBy: { select: { id: true, email: true } },
      },
    });
    res.json({ success: true, data: full ? mapPayment(full) : full });
  })
);

paymentsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const tenantId = auth.tenantId;
    const body = createSchema.parse(req.body);
    const hasMockProof = !!body.proofFileName && !!body.proofMimeType && !!body.proofBase64;
    const normalizedReference = hasMockProof
      ? buildMockProofReference({
          fileName: body.proofFileName!,
          mimeType: body.proofMimeType!,
          base64: body.proofBase64!,
        })
      : body.reference;

    if (auth.role === Role.conductor) {
      // El conductor SÍ puede registrar un cobro en efectivo del envío que está realizando.
      // Queda como `pendiente` de validación por el admin (rinde la plata + admin valida).
      if (body.method !== "efectivo") {
        throw new ApiError(
          403,
          "Los conductores solo pueden registrar cobros en efectivo.",
          "DRIVER_PAYMENT_METHOD_FORBIDDEN"
        );
      }
      if (!body.shipmentId) {
        throw new ApiError(400, "El cobro debe estar asociado a un envío.", "VALIDATION");
      }
      const user = await prisma.user.findUnique({ where: { id: auth.sub } });
      if (!user?.driverId) throw new ApiError(403, "Usuario sin perfil de conductor", "FORBIDDEN");

      const shipment = await prisma.shipment.findFirst({
        where: { id: body.shipmentId, tenantId, driverId: user.driverId },
      });
      if (!shipment) {
        throw new ApiError(404, "Envío no encontrado o no asignado a este chofer", "NOT_FOUND");
      }
      if (shipment.status === "rechazado" || shipment.status === "pendiente") {
        throw new ApiError(
          400,
          "Solo se pueden registrar cobros en envíos confirmados o en curso.",
          "SHIPMENT_PAYMENT_STATE"
        );
      }
      const targetAmount = shipment.totalAmount ?? shipment.amount;
      if (!targetAmount || targetAmount.lte(0)) {
        throw new ApiError(
          400,
          "Aún no hay un monto definido para este envío.",
          "SHIPMENT_AMOUNT_NOT_SET"
        );
      }
      const amt = new Prisma.Decimal(body.amount);
      if (amt.lte(0)) throw new ApiError(400, "Monto inválido", "VALIDATION");
      if (amt.gt(targetAmount)) {
        throw new ApiError(
          400,
          "El monto cobrado supera el total acordado del envío.",
          "PAYMENT_EXCEEDS_TOTAL"
        );
      }

      const created = await prisma.payment.create({
        data: {
          tenantId,
          shipmentId: shipment.id,
          amount: amt,
          method: "efectivo",
          reference: body.reference?.trim() || `Cobro en efectivo registrado por chofer (${shipment.id.slice(0, 8)})`,
          verificationStatus: "pendiente",
          paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
          recordedById: auth.sub,
        },
      });
      const full = await prisma.payment.findUnique({
        where: { id: created.id },
        include: { invoice: true, shipment: true },
      });
      return res.status(201).json({ success: true, data: full ? mapPayment(full) : full });
    }

    if (auth.role === Role.admin) {
      if (body.invoiceId) {
        const inv = await prisma.invoice.findFirst({
          where: { id: body.invoiceId, tenantId },
        });
        if (!inv) throw new ApiError(404, "Factura no encontrada", "NOT_FOUND");
      }
      if (body.shipmentId) {
        const s = await prisma.shipment.findFirst({
          where: { id: body.shipmentId, tenantId },
          select: {
            id: true,
            invoiceLines: {
              select: { invoiceId: true },
              take: 1,
            },
          },
        });
        if (!s) throw new ApiError(404, "Envío no encontrado", "NOT_FOUND");
        // Política contable: si el servicio ya fue facturado, la cobranza oficial debe ir contra factura.
        if (!body.invoiceId && s.invoiceLines.length > 0) {
          throw new ApiError(
            400,
            "Este servicio ya está facturado. Registrá el pago en la factura (invoiceId) para mantener la cobranza oficial.",
            "INVOICE_REQUIRED_FOR_BILLED_SHIPMENT"
          );
        }
      }

      const row = await prisma.$transaction(async (tx) => {
        if (body.invoiceId) {
          await assertInvoicePaymentWithinBalance(tx, body.invoiceId, new Prisma.Decimal(body.amount));
        }
        const created = await tx.payment.create({
          data: {
            tenantId,
            invoiceId: body.invoiceId,
            shipmentId: body.shipmentId,
            amount: new Prisma.Decimal(body.amount),
            method: body.method,
            reference: normalizedReference,
          verificationStatus: "aprobado",
            verifiedById: auth.sub,
            verifiedAt: new Date(),
            paidAt: body.paidAt ? new Date(body.paidAt) : undefined,
            recordedById: auth.sub,
          },
          include: { invoice: true, shipment: true },
        });
        if (created.shipmentId) {
          await refreshShipmentPaymentStatus(tx, created.shipmentId);
        }
        return created;
      });

      return res.status(201).json({ success: true, data: row });
    }

    if (auth.role === Role.cliente) {
      if (body.invoiceId && body.shipmentId) {
        throw new ApiError(400, "Indique solo factura o solo envío", "VALIDATION");
      }

      const user = await prisma.user.findUnique({ where: { id: auth.sub } });
      if (!user?.customerId) throw new ApiError(403, "Sin cliente vinculado", "FORBIDDEN");

      if (body.invoiceId) {
        const inv = await prisma.invoice.findFirst({
          where: { id: body.invoiceId, tenantId, customerId: user.customerId },
          include: { payments: true },
        });
        if (!inv) throw new ApiError(404, "Factura no encontrada", "NOT_FOUND");
        if (inv.status === "anulada") throw new ApiError(400, "La factura está anulada", "INVOICE_VOID");
        if (inv.status === "borrador") throw new ApiError(400, "Factura aún en borrador", "INVOICE_DRAFT");

        const paid = inv.payments
          .filter((p) => p.verificationStatus === "aprobado")
          .reduce((s, p) => s.add(p.amount), new Prisma.Decimal(0));
        const balance = inv.total.sub(paid);
        if (balance.lte(0)) {
          throw new ApiError(400, "La factura no tiene saldo pendiente", "INVOICE_PAID");
        }

        if (!hasMockProof && !normalizedReference?.trim()) {
          throw new ApiError(400, "Debe adjuntar comprobante de transferencia", "TRANSFER_PROOF_REQUIRED");
        }
        const transferProof = (hasMockProof ? normalizedReference! : normalizedReference!.trim());
        const amt = new Prisma.Decimal(body.amount);
        if (amt.lte(0)) throw new ApiError(400, "Monto de pago inválido", "VALIDATION");
        if (amt.gt(balance)) {
          throw new ApiError(400, "El monto supera el saldo pendiente de la factura", "PAYMENT_EXCEEDS_BALANCE");
        }

        const row = await prisma.payment.create({
          data: {
            tenantId,
            invoiceId: inv.id,
            amount: amt,
            method: "transferencia",
            reference: transferProof,
            verificationStatus: "pendiente",
            paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
            recordedById: auth.sub,
          },
        });
        const full = await prisma.payment.findUnique({
          where: { id: row.id },
          include: { invoice: true, shipment: true },
        });
        return res.status(201).json({ success: true, data: full ? mapPayment(full) : full });
      }

      if (!body.shipmentId) {
        throw new ApiError(400, "Debe indicar el envío o la factura", "VALIDATION");
      }

      const shipment = await prisma.shipment.findFirst({
        where: { id: body.shipmentId, tenantId, customerId: user.customerId },
      });
      if (!shipment) throw new ApiError(404, "Envío no encontrado", "NOT_FOUND");
      if (shipment.status === "rechazado") {
        throw new ApiError(400, "No puede pagar un envío rechazado", "SHIPMENT_REJECTED");
      }
      if (!normalizedReference?.trim()) {
        throw new ApiError(400, "Debe adjuntar comprobante de transferencia", "TRANSFER_PROOF_REQUIRED");
      }
      const transferProof = normalizedReference.trim();
      const targetAmount = shipment.totalAmount ?? shipment.amount;
      if (!targetAmount || targetAmount.lte(0)) {
        throw new ApiError(
          400,
          "La empresa aún no definió el monto a pagar para este envío",
          "SHIPMENT_AMOUNT_NOT_SET"
        );
      }
      if (shipment.status === "pendiente") {
        if (shipment.paymentTerm === "delivery") {
          throw new ApiError(
            400,
            "Este pedido está en cotización. Con pago contra entrega no debe enviar anticipo; espere la confirmación de la empresa.",
            "PENDING_DELIVERY_TERM"
          );
        }
      } else if (shipment.status !== "confirmado") {
        throw new ApiError(
          400,
          "Solo puede registrar pagos en pedidos con cotización aprobada (anticipo) o ya confirmados por la empresa.",
          "SHIPMENT_PAYMENT_STATE"
        );
      }
      if (shipment.paymentTerm === "delivery") {
        throw new ApiError(
          400,
          "Este envío quedó pactado para pago contra entrega. No requiere anticipo por transferencia.",
          "DELIVERY_PAYMENT_TERM"
        );
      }
      if (new Prisma.Decimal(body.amount).lte(0)) {
        throw new ApiError(400, "Monto de pago inválido", "VALIDATION");
      }
      if (new Prisma.Decimal(body.amount).gt(targetAmount)) {
        throw new ApiError(400, "El pago no puede superar el total acordado del servicio", "PAYMENT_EXCEEDS_TOTAL");
      }

      const row = await prisma.$transaction(async (tx) => {
        const pay = await tx.payment.create({
          data: {
            tenantId,
            shipmentId: shipment.id,
            amount: new Prisma.Decimal(body.amount),
            method: "transferencia",
            reference: transferProof,
            verificationStatus: "pendiente",
            paidAt: body.paidAt ? new Date(body.paidAt) : undefined,
            recordedById: auth.sub,
          },
        });
        return pay;
      });

      const full = await prisma.payment.findUnique({
        where: { id: row.id },
        include: { invoice: true, shipment: true },
      });
      return res.status(201).json({ success: true, data: full ? mapPayment(full) : full });
    }

    throw new ApiError(403, "No autorizado", "FORBIDDEN");
  })
);

paymentsRouter.patch(
  "/:id/verification",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role !== Role.admin) throw new ApiError(403, "No autorizado", "FORBIDDEN");
    const body = verifySchema.parse(req.body);
    const payment = await prisma.payment.findFirst({
      where: { id: req.params.id, tenantId: auth.tenantId },
      include: {
        shipment: { select: { id: true } },
        invoice: { include: { customer: { select: { email: true } } } },
      },
    });
    if (!payment) throw new ApiError(404, "Pago no encontrado", "NOT_FOUND");

    const updated = await prisma.$transaction(async (tx) => {
      if (body.status === "aprobado" && payment.invoiceId) {
        await assertInvoicePaymentWithinBalance(tx, payment.invoiceId, payment.amount, payment.id);
      }
      const row = await tx.payment.update({
        where: { id: payment.id },
        data: {
          verificationStatus: body.status,
          verificationNote: body.note?.trim() || null,
          verifiedById: auth.sub,
          verifiedAt: new Date(),
        },
        include: {
          invoice: { include: { customer: { select: { email: true } } } },
          shipment: {
            include: {
              customer: { select: { email: true } },
            },
          },
          recordedBy: { select: { id: true, email: true } },
          verifiedBy: { select: { id: true, email: true } },
        },
      });
      if (payment.shipment?.id) {
        await refreshShipmentPaymentStatus(tx, payment.shipment.id);
      }
      return row;
    });

    const mapped = mapPayment(updated);
    const to = updated.invoice?.customer.email ?? updated.shipment?.customer.email;
    if (to && (body.status === "aprobado" || body.status === "rechazado")) {
      void notifyPaymentVerificationEmail({
        to,
        status: body.status,
        amount: updated.amount.toString(),
        invoiceNumber: updated.invoice?.number ?? null,
        shipmentRef: updated.shipment ? `${updated.shipment.origin} → ${updated.shipment.destination}` : null,
        note: body.note?.trim() || null,
        portalUrl: config.frontendUrl.replace(/\/$/, ""),
      }).catch((err) => console.warn("[clientNotify]", err));
    }

    res.json({ success: true, data: mapped });
  })
);
