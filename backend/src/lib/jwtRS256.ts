import jwt from "jsonwebtoken";
import fs from "fs/promises";
import path from "path";
import type { Role } from "@prisma/client";
import { config } from "../config.js";
import type { StringValue } from "ms";

export type JwtPayload = {
  sub: string;
  tenantId: string;
  role: Role;
  email: string;
  iat?: number;
  exp?: number;
};

export type RefreshPayload = {
  sub: string;
  tenantId: string;
  type: "refresh";
  iat?: number;
  exp?: number;
};

// Claves RSA para JWT (generar con: openssl genrsa -out private.pem 2048 && openssl rsa -in private.pem -pubout -out public.pem)
let privateKey: string;
let publicKey: string;

async function loadKeys(): Promise<void> {
  try {
    const privateKeyPath = process.env.JWT_PRIVATE_KEY_PATH || path.join(process.cwd(), "keys", "private.pem");
    const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH || path.join(process.cwd(), "keys", "public.pem");
    
    privateKey = await fs.readFile(privateKeyPath, "utf8");
    publicKey = await fs.readFile(publicKeyPath, "utf8");
  } catch (error) {
    console.error("Error loading RSA keys:", error);
    // Fallback a HS256 si no hay claves RSA
    throw new Error("RSA keys not found. Please generate RSA keys for JWT.");
  }
}

export async function initializeJWT(): Promise<void> {
  await loadKeys();
}

export function signToken(payload: JwtPayload): string {
  try {
    return jwt.sign(payload, privateKey, {
      expiresIn: config.jwtExpiresIn as StringValue,
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
      algorithm: "RS256",
    });
  } catch (error) {
    console.error("Error signing JWT:", error);
    // Fallback a HS256 para compatibilidad
    return jwt.sign(payload, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn as StringValue,
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
      algorithm: "HS256",
    });
  }
}

export function signRefreshToken(payload: RefreshPayload): string {
  const refreshSecret = process.env.JWT_REFRESH_SECRET || config.jwtSecret;
  const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || "7d";
  
  return jwt.sign(payload, refreshSecret, {
    expiresIn,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    algorithm: "HS256", // Refresh token puede ser HS256
  } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  try {
    // Intentar primero con RS256
    return jwt.verify(token, publicKey, {
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
      algorithms: ["RS256"],
    }) as JwtPayload;
  } catch (error) {
    // Fallback a HS256
    return jwt.verify(token, config.jwtSecret, {
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
      algorithms: ["HS256"],
    }) as JwtPayload;
  }
}

export function verifyRefreshToken(token: string): RefreshPayload {
  const refreshSecret = process.env.JWT_REFRESH_SECRET || config.jwtSecret;
  
  return jwt.verify(token, refreshSecret, {
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    algorithms: ["HS256"],
  }) as RefreshPayload;
}

// Función para generar claves RSA (ejecutar una vez)
export async function generateRSAKeys(): Promise<void> {
  const { execSync } = await import("child_process");
  const keysDir = path.join(process.cwd(), "keys");
  
  try {
    await fs.mkdir(keysDir, { recursive: true });
    
    // Generar clave privada
    execSync("openssl genrsa -out private.pem 2048", { cwd: keysDir });
    // Generar clave pública
    execSync("openssl rsa -in private.pem -pubout -out public.pem", { cwd: keysDir });
    
    console.log("RSA keys generated successfully in:", keysDir);
  } catch (error) {
    console.error("Error generating RSA keys:", error);
    throw error;
  }
}
