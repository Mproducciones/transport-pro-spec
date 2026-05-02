import { Router } from "express";
import { z } from "zod";
import { InvoiceStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ApiError } from "../lib/apiError.js";
import { computeTotals, nextInvoiceNumber } from "../services/invoiceService.js";
import { invoiceToXml, streamInvoicePdf } from "../services/invoiceExport.js";
import { config } from "../config.js";
import { notifyInvoiceStatusEmail } from "../lib/clientNotify.js";

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  shipmentId: z.string().optional(),
});

const createSchema = z.object({
  customerId: z.string(),
  number: z.string().optional(),
  taxRate: z.number().nonnegative().default(12),
  dueDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(InvoiceStatus).optional(),
  lines: z.array(lineSchema).min(1),
});

const updateSchema = z.object({
  status: z.nativeEnum(InvoiceStatus).optional(),
  notes: z.string().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

export const invoicesRouter = Router();

invoicesRouter.use(authenticate);

invoicesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const tenantId = auth.tenantId;

    const where: Prisma.InvoiceWhereInput = { tenantId };
    if (auth.role === Role.cliente) {
      const user = await prisma.user.findUnique({ where: { id: auth.sub } });
      if (!user?.customerId) throw new ApiError(403, "Sin cliente vinculado", "FORBIDDEN");
      where.customerId = user.customerId;
    } else if (auth.role === Role.conductor) {
      throw new ApiError(403, "No autorizado", "FORBIDDEN");
    }

    const rows = await prisma.invoice.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, email: true } },
        lines: true,
        payments: {
          select: {
            id: true,
            amount: true,
            paidAt: true,
            method: true,
            verificationStatus: true,
          },
        },
      },
      orderBy: { issueDate: "desc" },
    });
    res.json({ success: true, data: rows });
  })
);

async function loadInvoiceForExport(id: string, tenantId: string, authSub: string, role: Role) {
  const row = await prisma.invoice.findFirst({
    where: { id, tenantId },
    include: { customer: { select: { name: true, email: true } }, lines: true },
  });
  if (!row) throw new ApiError(404, "Factura no encontrada", "NOT_FOUND");
  if (role === Role.cliente) {
    const user = await prisma.user.findUnique({ where: { id: authSub } });
    if (row.customerId !== user?.customerId) throw new ApiError(403, "No autorizado", "FORBIDDEN");
  }
  if (role === Role.conductor) throw new ApiError(403, "No autorizado", "FORBIDDEN");
  return row;
}

invoicesRouter.get(
  "/:id/export.xml",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const row = await loadInvoiceForExport(req.params.id, auth.tenantId, auth.sub, auth.role);
    const xml = invoiceToXml(row);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="factura-${row.number.replace(/[^\w.-]+/g, "_")}.xml"`);
    res.send(xml);
  })
);

invoicesRouter.get(
  "/:id/export.pdf",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const row = await loadInvoiceForExport(req.params.id, auth.tenantId, auth.sub, auth.role);
    streamInvoicePdf(row, res);
  })
);

invoicesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const row = await prisma.invoice.findFirst({
      where: { id: req.params.id, tenantId: auth.tenantId },
      include: {
        customer: true,
        lines: { include: { shipment: { select: { id: true, origin: true, destination: true } } } },
        payments: true,
      },
    });
    if (!row) throw new ApiError(404, "Factura no encontrada", "NOT_FOUND");

    if (auth.role === Role.cliente) {
      const user = await prisma.user.findUnique({ where: { id: auth.sub } });
      if (row.customerId !== user?.customerId) throw new ApiError(403, "No autorizado", "FORBIDDEN");
    }
    if (auth.role === Role.conductor) throw new ApiError(403, "No autorizado", "FORBIDDEN");

    res.json({ success: true, data: row });
  })
);

invoicesRouter.post(
  "/",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const tenantId = auth.tenantId;
    const body = createSchema.parse(req.body);

    const customer = await prisma.customer.findFirst({
      where: { id: body.customerId, tenantId },
    });
    if (!customer) throw new ApiError(404, "Cliente no encontrado", "NOT_FOUND");

    const lineInputs = body.lines.map((l) => ({
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      description: l.description,
      shipmentId: l.shipmentId,
    }));

    for (const l of lineInputs) {
      if (l.shipmentId) {
        const s = await prisma.shipment.findFirst({
          where: { id: l.shipmentId, tenantId, customerId: body.customerId },
        });
        if (!s) throw new ApiError(400, "Envío no válido para este cliente", "INVALID_SHIPMENT");
      }
    }

    const { subtotal, taxAmount, total } = computeTotals(
      lineInputs.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice })),
      body.taxRate
    );

    const number = body.number ?? (await nextInvoiceNumber(tenantId));

    const invoice = await prisma.$transaction(async (tx) => {
      return tx.invoice.create({
        data: {
          tenantId,
          customerId: body.customerId,
          number,
          dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
          notes: body.notes,
          status: body.status ?? InvoiceStatus.emitida,
          taxRate: new Prisma.Decimal(body.taxRate),
          subtotal,
          taxAmount,
          total,
          lines: {
            create: lineInputs.map((l) => ({
              description: l.description,
              quantity: new Prisma.Decimal(l.quantity),
              unitPrice: new Prisma.Decimal(l.unitPrice),
              lineTotal: new Prisma.Decimal(l.quantity * l.unitPrice),
              shipmentId: l.shipmentId,
            })),
          },
        },
        include: { lines: true, customer: true },
      });
    });

    res.status(201).json({ success: true, data: invoice });
  })
);

invoicesRouter.patch(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = updateSchema.parse(req.body);
    const existing = await prisma.invoice.findFirst({
      where: { id: req.params.id, tenantId: auth.tenantId },
      include: { payments: { select: { amount: true, verificationStatus: true } } },
    });
    if (!existing) throw new ApiError(404, "Factura no encontrada", "NOT_FOUND");
    if (body.status === "anulada") {
      const approved = existing.payments
        .filter((p) => p.verificationStatus === "aprobado")
        .reduce((sum, p) => sum.add(p.amount), new Prisma.Decimal(0));
      if (approved.gt(0)) {
        throw new ApiError(
          400,
          "No se puede anular una factura con pagos aprobados. Primero regulariza el pago o emite el documento de reversa correspondiente.",
          "INVOICE_HAS_APPROVED_PAYMENTS"
        );
      }
    }

    const row = await prisma.invoice.update({
      where: { id: existing.id },
      data: {
        status: body.status,
        notes: body.notes,
        dueDate: body.dueDate === undefined ? undefined : body.dueDate ? new Date(body.dueDate) : null,
      },
      include: { customer: true, lines: true, payments: true },
    });

    if (body.status !== undefined && body.status !== existing.status && row.customer.email) {
      void notifyInvoiceStatusEmail({
        to: row.customer.email,
        invoiceNumber: row.number,
        previousStatus: existing.status,
        newStatus: body.status,
        portalUrl: config.frontendUrl.replace(/\/$/, ""),
      }).catch((err) => console.warn("[clientNotify] factura", err));
    }

    res.json({ success: true, data: row });
  })
);
