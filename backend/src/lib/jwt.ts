import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { config } from "../config.js";
import type { StringValue } from "ms";

export type JwtPayload = {
  sub: string;
  tenantId: string;
  role: Role;
  email: string;
};

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as StringValue,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    algorithm: "HS256",
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret, {
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    algorithms: ["HS256"],
  }) as JwtPayload;
}
