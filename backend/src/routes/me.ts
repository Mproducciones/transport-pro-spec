import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { ApiError } from "../lib/apiError.js";
import { hashPassword, verifyPassword } from "../lib/password.js";

export const meRouter = Router();

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
});

/** Cualquier usuario autenticado (admin, conductor, cliente con portal). */
meRouter.patch(
  "/me/password",
  authenticate,
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

meRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const user = await prisma.user.findUnique({
      where: { id: auth.sub },
      include: { tenant: { select: { id: true, name: true, slug: true } } },
    });
    if (!user) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    }
    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        tenant: user.tenant,
        driverId: user.driverId,
        customerId: user.customerId,
      },
    });
  })
);
