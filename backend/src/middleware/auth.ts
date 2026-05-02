import type { Request, Response, NextFunction } from "express";
import { SubscriptionStatus } from "@prisma/client";
import { verifyToken, type JwtPayload } from "../lib/jwt.js";
import { ApiError } from "../lib/apiError.js";
import { prisma } from "../lib/prisma.js";

declare global {
  namespace Express {
    interface Request {
      auth?: JwtPayload;
    }
  }
}

const subscriptionBypassPrefixes = ["/api/v1/subscriptions", "/api/v1/settings"];

function pathMatchesBypass(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const cookieToken = typeof req.cookies?.tp_token === "string" ? req.cookies.tp_token : null;
  const token = bearer ?? cookieToken;
  if (!token) {
    return next(new ApiError(401, "Token requerido", "UNAUTHORIZED"));
  }
  try {
    req.auth = verifyToken(token);
    const pathname = (() => {
      try {
        return new URL(req.originalUrl, "http://localhost").pathname;
      } catch {
        return req.originalUrl.split("?")[0] || "";
      }
    })();
    if (!subscriptionBypassPrefixes.some((p) => pathMatchesBypass(pathname, p))) {
      const sub = await prisma.subscription.findUnique({
        where: { tenantId: req.auth.tenantId },
        select: { status: true, currentPeriodEnd: true },
      });
      const expiredByDate = !!sub?.currentPeriodEnd && sub.currentPeriodEnd.getTime() < Date.now();
      const allowedStatus = sub?.status === SubscriptionStatus.active || sub?.status === SubscriptionStatus.trialing;
      if (!sub || !allowedStatus || expiredByDate) {
        return next(
          new ApiError(
            402,
            "Suscripción inactiva o vencida. Renueve para continuar usando el sistema.",
            "SUBSCRIPTION_INACTIVE"
          )
        );
      }
    }
    next();
  } catch {
    next(new ApiError(401, "Token inválido o expirado", "UNAUTHORIZED"));
  }
}
