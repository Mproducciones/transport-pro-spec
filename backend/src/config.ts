import path from "path";
import "dotenv/config";

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";

const DEV_JWT_SECRET = "dev-only-change-me";
const DEV_OWNER_API_KEY = "owner-dev-key";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readSecret(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  if (!isProduction) return value || fallback;
  return requiredEnv(name);
}

function assertStrongProductionSecret(name: string, value: string, forbiddenValues: string[]) {
  if (!isProduction) return;
  if (value.length < 32) {
    throw new Error(`${name} must be at least 32 characters in production`);
  }
  if (forbiddenValues.includes(value)) {
    throw new Error(`${name} uses a development value and must be changed in production`);
  }
}

const jwtSecret = readSecret("JWT_SECRET", DEV_JWT_SECRET);
const ownerApiKey = readSecret("OWNER_API_KEY", DEV_OWNER_API_KEY);
const jwtIssuer = process.env.JWT_ISSUER?.trim() || "transport-pro-api";
const jwtAudience = process.env.JWT_AUDIENCE?.trim() || "transport-pro-client";
const jwtExpiresIn = process.env.JWT_EXPIRES_IN?.trim() || "15m"; // Access token más corto
const jwtRefreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN?.trim() || "7d";

assertStrongProductionSecret("JWT_SECRET", jwtSecret, [DEV_JWT_SECRET]);
assertStrongProductionSecret("OWNER_API_KEY", ownerApiKey, [DEV_OWNER_API_KEY]);

// Validar refresh secret si está definido
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET?.trim();
if (isProduction && jwtRefreshSecret) {
  assertStrongProductionSecret("JWT_REFRESH_SECRET", jwtRefreshSecret, ["dev-refresh-key"]);
}

if (isProduction) {
  requiredEnv("DATABASE_URL");
  requiredEnv("FRONTEND_URL");
}

function parseOrigins(value: string | undefined, fallback: string): string[] {
  const raw = value?.trim() || fallback;
  const origins = raw
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (isProduction && origins.some((origin) => origin === "*")) {
    throw new Error("CORS_ORIGINS cannot include * in production");
  }
  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("invalid protocol");
      }
    } catch {
      throw new Error(`Invalid CORS origin: ${origin}`);
    }
  }
  return [...new Set(origins)];
}

const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
const corsOrigins = parseOrigins(process.env.CORS_ORIGINS, frontendUrl);

/** Límite global /api/ (cualquier método). Ajustar con API_RATE_LIMIT. */
const apiRateLimitMax = Math.max(1, Math.min(5000, Number(process.env.API_RATE_LIMIT) || 200));
/** Límite extra para POST/PATCH/PUT/DELETE bajo /api/v1 (abuso / floods). */
const mutationRateLimitMax = Math.max(1, Math.min(2000, Number(process.env.MUTATION_RATE_LIMIT) || 80));
/** Límite login/registro. */
const authRateLimitMax = Math.max(1, Math.min(500, Number(process.env.AUTH_RATE_LIMIT) || 50));

/** HSTS: por defecto activo en production si la API va detrás de HTTPS. Desactivar con HSTS=false. */
const hstsEnabled = isProduction && process.env.HSTS !== "false";

/**
 * Frontend en otro dominio que la API (ej. Vercel + Render): cookies de sesión deben ser SameSite=None; Secure.
 * En local con Vite proxy, dejar en false (default Lax).
 */
const crossOriginCookies =
  process.env.CROSS_ORIGIN_COOKIES === "true" || process.env.CROSS_ORIGIN_COOKIES === "1";
const cookieSameSite: "lax" | "none" = isProduction && crossOriginCookies ? "none" : "lax";
const cookieSecure = isProduction;

export const config = {
  port: Number(process.env.PORT) || 4000,
  jwtSecret,
  jwtIssuer,
  jwtAudience,
  jwtExpiresIn,
  jwtRefreshExpiresIn,
  jwtRefreshSecret,
  nodeEnv,
  isProduction,
  frontendUrl,
  corsOrigins,
  mpEnabled: process.env.MP_ENABLED === "true",
  /** Secreto opcional: si está definido, el webhook de MP exige header `X-Transport-Pro-Signature` (hex SHA-256). */
  mercadoPagoWebhookSecret: process.env.MP_WEBHOOK_SECRET?.trim() || "",
  ownerApiKey,
  uploadDir: process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 8,
  apiRateLimitMax,
  mutationRateLimitMax,
  authRateLimitMax,
  hstsEnabled,
  cookieSameSite,
  cookieSecure,
};
