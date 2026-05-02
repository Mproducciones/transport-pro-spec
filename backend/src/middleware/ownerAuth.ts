import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";
import { ApiError } from "../lib/apiError.js";

function secureCompare(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function requireOwnerApiKey(req: Request, _res: Response, next: NextFunction) {
  const key = req.headers["x-owner-key"];
  if (!key || typeof key !== "string" || !secureCompare(key, config.ownerApiKey)) {
    return next(new ApiError(401, "No autorizado (owner)", "OWNER_UNAUTHORIZED"));
  }
  return next();
}

