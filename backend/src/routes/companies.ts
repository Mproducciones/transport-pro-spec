import { Router } from "express";
import { CompanyAccountStatus, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ApiError } from "../lib/apiError.js";

const createSchema = z.object({
  legalName: z.string().min(2),
  taxId: z.string().min(6).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
});

const updateSchema = z.object({
  legalName: z.string().min(2).optional(),
  taxId: z.string().min(6).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  accountStatus: z.nativeEnum(CompanyAccountStatus).optional(),
});

export const companiesRouter = Router();

companiesRouter.use(authenticate);

companiesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role !== Role.admin) throw new ApiError(403, "No autorizado", "FORBIDDEN");
    const row = await prisma.company.findUnique({ where: { tenantId: auth.tenantId } });
    res.json({ success: true, data: row ? [row] : [] });
  })
);

companiesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role !== Role.admin) throw new ApiError(403, "No autorizado", "FORBIDDEN");
    const body = createSchema.parse(req.body);
    const existing = await prisma.company.findUnique({ where: { tenantId: auth.tenantId } });
    if (existing) throw new ApiError(400, "La empresa ya existe para este tenant", "DUPLICATE");
    const row = await prisma.company.create({
      data: {
        tenantId: auth.tenantId,
        legalName: body.legalName.trim(),
        taxId: body.taxId?.trim(),
        address: body.address?.trim(),
        phone: body.phone?.trim(),
      },
    });
    res.status(201).json({ success: true, data: row });
  })
);

companiesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role !== Role.admin) throw new ApiError(403, "No autorizado", "FORBIDDEN");
    const body = updateSchema.parse(req.body);
    const row = await prisma.company.findFirst({
      where: { id: req.params.id, tenantId: auth.tenantId },
    });
    if (!row) throw new ApiError(404, "Empresa no encontrada", "NOT_FOUND");
    const updated = await prisma.company.update({
      where: { id: row.id },
      data: {
        ...(body.legalName !== undefined ? { legalName: body.legalName.trim() } : {}),
        ...(body.taxId !== undefined ? { taxId: body.taxId.trim() } : {}),
        ...(body.address !== undefined ? { address: body.address.trim() } : {}),
        ...(body.phone !== undefined ? { phone: body.phone.trim() } : {}),
        ...(body.accountStatus !== undefined ? { accountStatus: body.accountStatus } : {}),
      },
    });
    res.json({ success: true, data: updated });
  })
);

companiesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.role !== Role.admin) throw new ApiError(403, "No autorizado", "FORBIDDEN");
    const row = await prisma.company.findFirst({
      where: { id: req.params.id, tenantId: auth.tenantId },
      select: { id: true },
    });
    if (!row) throw new ApiError(404, "Empresa no encontrada", "NOT_FOUND");
    await prisma.company.delete({ where: { id: row.id } });
    res.json({ success: true });
  })
);

