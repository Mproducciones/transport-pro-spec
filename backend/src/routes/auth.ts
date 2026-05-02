import { Router, type Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signToken, signRefreshToken, verifyRefreshToken } from "../lib/jwtRS256.js";
import { validatePassword } from "../lib/passwordPolicy.js";
import { ApiError } from "../lib/apiError.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { Role } from "@prisma/client";
import { assertValidChileanRut } from "../lib/chileRut.js";
import { config } from "../config.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = z.object({
  companyTaxId: z.string().min(1).optional(),
  tenantSlug: z.string().min(1).optional(),
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(12).refine((password) => validatePassword(password).valid, {
    message: "La contraseña debe tener al menos 12 caracteres, incluir mayúsculas, minúsculas, números y caracteres especiales"
  }),
  taxId: z.string().min(5).max(40),
  phone: z.string().max(40).optional(),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
});

export const authRouter = Router();

function setAuthCookie(res: Response, token: string) {
  res.cookie("tp_token", token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: "/",
    maxAge: 15 * 60 * 1000, // 15 minutos para access token
  });
}

function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie("tp_refresh", refreshToken, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días para refresh token
  });
}

authRouter.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const normalizedEmail = body.email.trim().toLowerCase();
    const candidates = await prisma.user.findMany({
      where: { email: normalizedEmail },
      include: { tenant: { select: { slug: true } } },
      take: 2,
    });
    if (candidates.length === 0) throw new ApiError(401, "Credenciales inválidas", "INVALID_CREDENTIALS");
    if (candidates.length > 1) {
      throw new ApiError(
        401,
        "Credenciales inválidas",
        "INVALID_CREDENTIALS"
      );
    }
    const user = candidates[0];
    if (!(await verifyPassword(body.password, user.passwordHash))) {
      throw new ApiError(401, "Credenciales inválidas", "INVALID_CREDENTIALS");
    }

    const tenantSlug = user.tenant.slug;
    if (!tenantSlug) {
      throw new ApiError(500, "No se pudo resolver la empresa del usuario", "TENANT_RESOLUTION_FAILED");
    }
    const token = signToken({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    });
    
    const refreshToken = signRefreshToken({
      sub: user.id,
      tenantId: user.tenantId,
      type: "refresh",
    });
    
    setAuthCookie(res, token);
    setRefreshCookie(res, refreshToken);

    res.json({
      success: true,
      data: {
        token,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          tenantSlug,
        },
      },
    });
  })
);

authRouter.post(
  "/register",
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const companyTaxId = body.companyTaxId?.trim();
    const tenantSlug = body.tenantSlug?.trim();
    if (!companyTaxId && !tenantSlug) {
      throw new ApiError(400, "Ingrese RUT/NIT de empresa", "COMPANY_IDENTIFIER_REQUIRED");
    }

    let tenant: { id: string; slug: string } | null = null;
    if (companyTaxId) {
      const company = await prisma.company.findFirst({
        where: { taxId: companyTaxId },
        include: { tenant: { select: { id: true, slug: true } } },
      });
      if (company) tenant = company.tenant;
    }
    if (!tenant && tenantSlug) {
      tenant = await prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true, slug: true },
      });
    }
    if (!tenant) throw new ApiError(404, "No fue posible completar el registro", "REGISTRATION_NOT_ALLOWED");

    const normalizedEmail = body.email.trim().toLowerCase();
    const normalizedTaxId = assertValidChileanRut(body.taxId, "RUT cliente");
    const userExists = await prisma.user.findFirst({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (userExists) throw new ApiError(409, "No fue posible completar el registro", "REGISTRATION_NOT_ALLOWED");

    const customerExists = await prisma.customer.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: normalizedEmail } },
      select: { id: true },
    });
    if (customerExists) throw new ApiError(409, "No fue posible completar el registro", "REGISTRATION_NOT_ALLOWED");
    const customerTaxExists = await prisma.customer.findFirst({
      where: { tenantId: tenant.id, taxId: normalizedTaxId },
      select: { id: true },
    });
    if (customerTaxExists) {
      throw new ApiError(409, "No fue posible completar el registro", "REGISTRATION_NOT_ALLOWED");
    }
    const driverTaxExists = await prisma.driver.findFirst({
      where: { tenantId: tenant.id, taxId: normalizedTaxId },
      select: { id: true },
    });
    if (driverTaxExists) {
      throw new ApiError(409, "No fue posible completar el registro", "REGISTRATION_NOT_ALLOWED");
    }

    const passwordHash = await hashPassword(body.password);
    const created = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          tenantId: tenant.id,
          name: body.name.trim(),
          email: normalizedEmail,
          taxId: normalizedTaxId,
          phone: body.phone?.trim() || null,
        },
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: normalizedEmail,
          passwordHash,
          role: Role.cliente,
          customerId: customer.id,
        },
      });
      return { customer, user };
    });

    res.status(201).json({
      success: true,
      data: {
        customerId: created.customer.id,
        tenantSlug: tenant.slug,
        message: "Registro de cliente completado. Ya puede iniciar sesión.",
      },
    });
  })
);

authRouter.post("/logout", (_req, res) => {
  res.clearCookie("tp_token", {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: "/",
  });
  res.clearCookie("tp_refresh", {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: "/",
  });
  res.json({ success: true, data: { ok: true } });
});

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.tp_refresh;
    if (!refreshToken) {
      throw new ApiError(401, "Refresh token requerido", "REFRESH_TOKEN_REQUIRED");
    }

    try {
      const payload = verifyRefreshToken(refreshToken);
      
      // Obtener datos actualizados del usuario
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        include: { tenant: { select: { slug: true } } },
      });
      
      if (!user || user.tenantId !== payload.tenantId) {
        throw new ApiError(401, "Usuario no válido", "INVALID_USER");
      }

      // Generar nuevos tokens
      const newToken = signToken({
        sub: user.id,
        tenantId: user.tenantId,
        role: user.role,
        email: user.email,
      });
      
      const newRefreshToken = signRefreshToken({
        sub: user.id,
        tenantId: user.tenantId,
        type: "refresh",
      });
      
      setAuthCookie(res, newToken);
      setRefreshCookie(res, newRefreshToken);
      
      res.json({
        success: true,
        data: {
          token: newToken,
          refreshToken: newRefreshToken,
        },
      });
    } catch (error) {
      // Limpiar cookies si el refresh token es inválido
      res.clearCookie("tp_token");
      res.clearCookie("tp_refresh");
      throw new ApiError(401, "Refresh token inválido", "INVALID_REFRESH_TOKEN");
    }
  })
);

