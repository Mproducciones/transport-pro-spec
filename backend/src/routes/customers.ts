import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ApiError } from "../lib/apiError.js";
import { hashPassword } from "../lib/password.js";
import { assertValidChileanRut } from "../lib/chileRut.js";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  portalPassword: z.string().min(8),
  taxId: z.string().min(5),
  phone: z.string().optional(),
});

const updateSchema = z
  .object({
    name: z.string().min(1),
    email: z.string().email(),
    taxId: z.string().optional(),
    phone: z.string().optional(),
  })
  .partial();

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8),
});

export const customersRouter = Router();

customersRouter.use(authenticate, requireRole("admin"));

customersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const rows = await prisma.customer.findMany({
      where: { tenantId },
      include: {
        user: { select: { id: true, email: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: rows });
  })
);

customersRouter.get(
  "/:id/profile",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, tenantId },
      include: { user: { select: { id: true, email: true, createdAt: true } } },
    });
    if (!customer) throw new ApiError(404, "Cliente no encontrado", "NOT_FOUND");

    const [shipments, invoices, payments] = await Promise.all([
      prisma.shipment.findMany({
        where: { tenantId, customerId: customer.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          origin: true,
          destination: true,
          status: true,
          paymentStatus: true,
          createdAt: true,
        },
      }),
      prisma.invoice.findMany({
        where: { tenantId, customerId: customer.id },
        orderBy: { issueDate: "desc" },
        take: 10,
        select: {
          id: true,
          number: true,
          issueDate: true,
          dueDate: true,
          total: true,
          status: true,
        },
      }),
      prisma.payment.findMany({
        where: {
          tenantId,
          OR: [{ invoice: { customerId: customer.id } }, { shipment: { customerId: customer.id } }],
        },
        distinct: ["id"],
        orderBy: { paidAt: "desc" },
        take: 10,
        select: {
          id: true,
          amount: true,
          method: true,
          paidAt: true,
          reference: true,
          invoice: { select: { number: true } },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        customer,
        metrics: {
          shipments: shipments.length,
          invoices: invoices.length,
          payments: payments.length,
        },
        shipments,
        invoices,
        payments,
      },
    });
  })
);

customersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const body = createSchema.parse(req.body);
    const normalizedEmail = body.email.trim().toLowerCase();
    const normalizedTaxId = assertValidChileanRut(body.taxId, "RUT cliente");
    const existingUser = await prisma.user.findFirst({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      throw new ApiError(409, "Ya existe un usuario con este correo", "USER_EXISTS");
    }
    const duplicateCustomerTax = await prisma.customer.findFirst({
      where: { tenantId, taxId: normalizedTaxId },
      select: { id: true },
    });
    if (duplicateCustomerTax) {
      throw new ApiError(409, "Ya existe un cliente con este RUT/NIT", "DUPLICATE_TAX_ID");
    }
    const duplicateDriverTax = await prisma.driver.findFirst({
      where: { tenantId, taxId: normalizedTaxId },
      select: { id: true },
    });
    if (duplicateDriverTax) {
      throw new ApiError(409, "Este RUT/NIT ya está registrado en un conductor", "DUPLICATE_TAX_ID");
    }

    const passwordHash = await hashPassword(body.portalPassword);
    const row = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          tenantId,
          name: body.name,
          email: normalizedEmail,
          taxId: normalizedTaxId,
          phone: body.phone,
        },
      });
      await tx.user.create({
        data: {
          tenantId,
          email: normalizedEmail,
          passwordHash,
          role: Role.cliente,
          customerId: customer.id,
        },
      });
      return customer;
    });
    res.status(201).json({ success: true, data: row });
  })
);

customersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const body = updateSchema.parse(req.body);
    const existing = await prisma.customer.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!existing) throw new ApiError(404, "Cliente no encontrado", "NOT_FOUND");

    if (body.email) {
      const normalizedEmail = body.email.trim().toLowerCase();
      const duplicateUser = await prisma.user.findFirst({
        where: {
          email: normalizedEmail,
          NOT: { customerId: existing.id },
        },
      });
      if (duplicateUser) {
        throw new ApiError(409, "Ya existe un usuario con este correo", "USER_EXISTS");
      }
      body.email = normalizedEmail;
    }
    if (body.taxId) {
      const normalizedTaxId = assertValidChileanRut(body.taxId, "RUT cliente");
      const duplicateCustomerTax = await prisma.customer.findFirst({
        where: {
          tenantId,
          taxId: normalizedTaxId,
          NOT: { id: existing.id },
        },
        select: { id: true },
      });
      if (duplicateCustomerTax) {
        throw new ApiError(409, "Ya existe un cliente con este RUT/NIT", "DUPLICATE_TAX_ID");
      }
      const duplicateDriverTax = await prisma.driver.findFirst({
        where: { tenantId, taxId: normalizedTaxId },
        select: { id: true },
      });
      if (duplicateDriverTax) {
        throw new ApiError(409, "Este RUT/NIT ya está registrado en un conductor", "DUPLICATE_TAX_ID");
      }
      body.taxId = normalizedTaxId;
    }

    const row = await prisma.$transaction(async (tx) => {
      const updatedCustomer = await tx.customer.update({
        where: { id: existing.id },
        data: body,
      });

      if (body.email) {
        await tx.user.updateMany({
          where: { tenantId, customerId: existing.id },
          data: { email: body.email },
        });
      }

      return updatedCustomer;
    });
    res.json({ success: true, data: row });
  })
);

customersRouter.patch(
  "/:id/password",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const body = resetPasswordSchema.parse(req.body);
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, tenantId },
      include: { user: true },
    });
    if (!customer) throw new ApiError(404, "Cliente no encontrado", "NOT_FOUND");
    if (!customer.user) throw new ApiError(400, "El cliente no tiene acceso de portal", "CUSTOMER_NO_USER");

    const passwordHash = await hashPassword(body.newPassword);
    await prisma.user.update({
      where: { id: customer.user.id },
      data: { passwordHash },
    });
    res.json({ success: true, data: { ok: true } });
  })
);

customersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const existing = await prisma.customer.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!existing) throw new ApiError(404, "Cliente no encontrado", "NOT_FOUND");
    const linked = await prisma.user.findFirst({ where: { customerId: existing.id } });
    if (linked) {
      throw new ApiError(
        400,
        "El cliente tiene un usuario en el portal; elimine o reasigne ese usuario antes",
        "CUSTOMER_HAS_USER"
      );
    }
    await prisma.customer.delete({ where: { id: existing.id } });
    res.json({ success: true, data: { id: req.params.id } });
  })
);
