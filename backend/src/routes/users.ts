import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ApiError } from "../lib/apiError.js";
import { hashPassword, verifyPassword } from "../lib/password.js";

const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
});

export const usersRouter = Router();

usersRouter.use(authenticate, requireRole("admin"));

usersRouter.get(
  "/admins",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const admins = await prisma.user.findMany({
      where: { tenantId, role: Role.admin },
      select: { id: true, email: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    res.json({ success: true, data: admins });
  })
);

usersRouter.post(
  "/admins",
  asyncHandler(async (req, res) => {
    const tenantId = req.auth!.tenantId;
    const body = createAdminSchema.parse(req.body);
    const normalizedEmail = body.email.trim().toLowerCase();
    const existing = await prisma.user.findFirst({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existing) {
      throw new ApiError(409, "El correo ya está registrado en otra cuenta", "DUPLICATE");
    }

    const passwordHash = await hashPassword(body.password);
    try {
      const user = await prisma.user.create({
        data: {
          tenantId,
          email: normalizedEmail,
          passwordHash,
          role: Role.admin,
        },
      });
      res.status(201).json({
        success: true,
        data: { id: user.id, email: user.email, role: user.role },
      });
    } catch {
      throw new ApiError(409, "El correo ya está en uso en esta empresa", "DUPLICATE");
    }
  })
);

usersRouter.patch(
  "/me/password",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const body = changePasswordSchema.parse(req.body);
    const me = await prisma.user.findUnique({ where: { id: auth.sub } });
    if (!me || me.tenantId !== auth.tenantId) {
      throw new ApiError(404, "Usuario no encontrado", "NOT_FOUND");
    }
    const ok = await verifyPassword(body.currentPassword, me.passwordHash);
    if (!ok) throw new ApiError(400, "La contraseña actual no es correcta", "INVALID_CURRENT_PASSWORD");
    const nextHash = await hashPassword(body.newPassword);
    await prisma.user.update({
      where: { id: me.id },
      data: { passwordHash: nextHash },
    });
    res.json({ success: true, data: { ok: true } });
  })
);
