import type { Request, Response, NextFunction } from "express";
import type { Role } from "@prisma/client";
import { ApiError } from "../lib/apiError.js";

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(new ApiError(401, "No autenticado", "UNAUTHORIZED"));
    if (!roles.includes(req.auth.role)) {
      return next(new ApiError(403, "No autorizado para esta acción", "FORBIDDEN"));
    }
    next();
  };
}
