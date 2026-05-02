import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";
import { ApiError } from "../lib/apiError.js";

// Redis imports opcionales para evitar errores si no está instalado
let RedisStore: any = null;
let Redis: any = null;

try {
  RedisStore = require("rate-limit-redis");
  Redis = require("ioredis");
} catch (error) {
  console.warn("Redis modules not found, using memory store for rate limiting");
}

// Configuración de Redis para rate limiting distribuido
let redis: any = null;

function initializeRedis(): any {
  if (redis) return redis;
  
  try {
    redis = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      password: process.env.REDIS_PASSWORD,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redis.on("error", (err: any) => {
      console.error("Redis connection error:", err);
      redis = null;
    });

    redis.on("connect", () => {
      console.log("Connected to Redis for rate limiting");
    });

    return redis;
  } catch (error) {
    console.error("Failed to initialize Redis:", error);
    return null as any;
  }
}

// Rate limiting general para API
export const apiRateLimit = rateLimit({
  store: redis ? new RedisStore({
    sendCommand: (...args: string[]) => redis!.call(...args),
  }) : undefined,
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: config.apiRateLimitMax, // Límite configurable
  message: {
    error: "Too many requests",
    code: "RATE_LIMIT_EXCEEDED",
    retryAfter: "15 minutes"
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // Usar IP + User-Agent para más precisión
    const userAgent = req.get("User-Agent") || "";
    return `${req.ip}:${userAgent.substring(0, 50)}`;
  },
  skip: (req: Request) => {
    // Omitir rate limiting para requests internos
    return req.ip === "127.0.0.1" || req.ip === "::1";
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Please try again later.",
        retryAfter: 900 // 15 minutos en segundos
      }
    });
  }
});

// Rate limiting estricto para operaciones de escritura
export const mutationRateLimit = rateLimit({
  store: redis ? new RedisStore({
    sendCommand: (...args: string[]) => redis!.call(...args),
  }) : undefined,
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: config.mutationRateLimitMax, // Más restrictivo
  message: {
    error: "Too many mutations",
    code: "MUTATION_RATE_LIMIT_EXCEEDED"
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const auth = req.auth;
    if (auth) {
      // Si está autenticado, usar user ID
      return `user:${auth.sub}`;
    }
    // Si no, usar IP
    return `ip:${req.ip}`;
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: "MUTATION_RATE_LIMIT_EXCEEDED",
        message: "Too many write operations. Please wait before trying again.",
        retryAfter: 900
      }
    });
  }
});

// Rate limiting muy estricto para autenticación
export const authRateLimit = rateLimit({
  store: redis ? new RedisStore({
    sendCommand: (...args: string[]) => redis!.call(...args),
  }) : undefined,
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: config.authRateLimitMax, // Muy restrictivo
  message: {
    error: "Too many auth attempts",
    code: "AUTH_RATE_LIMIT_EXCEEDED"
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const email = req.body?.email || "";
    const ip = req.ip;
    return `auth:${ip}:${email}`;
  },
  skipSuccessfulRequests: true, // No contar requests exitosos
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: "AUTH_RATE_LIMIT_EXCEEDED",
        message: "Too many authentication attempts. Please wait before trying again.",
        retryAfter: 900
      }
    });
  }
});

// Rate limiting específico para uploads
export const uploadRateLimit = rateLimit({
  store: redis ? new RedisStore({
    sendCommand: (...args: string[]) => redis!.call(...args),
  }) : undefined,
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 20, // Máximo 20 uploads por hora
  message: {
    error: "Upload limit exceeded",
    code: "UPLOAD_RATE_LIMIT_EXCEEDED"
  },
  keyGenerator: (req: Request) => {
    const auth = req.auth;
    return auth ? `upload:user:${auth.sub}` : `upload:ip:${req.ip}`;
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: "UPLOAD_RATE_LIMIT_EXCEEDED",
        message: "Upload limit exceeded. Please try again later.",
        retryAfter: 3600
      }
    });
  }
});

// Middleware para detectar patrones sospechosos
export function detectSuspiciousActivity(req: Request): boolean {
  const userAgent = req.get("User-Agent") || "";
  const suspiciousPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i,
    /java/i,
    /go-http/i
  ];

  // Detectar User-Agents sospechosos
  if (suspiciousPatterns.some(pattern => pattern.test(userAgent))) {
    return true;
  }

  // Detectar requests sin headers comunes
  const hasCommonHeaders = req.get("Accept") && req.get("Accept-Language");
  if (!hasCommonHeaders && req.path.startsWith("/api/")) {
    return true;
  }

  // Detectar secuencias rápidas de requests
  const now = Date.now();
  const lastRequest = (req as any).lastRequestTime;
  if (lastRequest && (now - lastRequest) < 100) { // Menos de 100ms entre requests
    return true;
  }
  (req as any).lastRequestTime = now;

  return false;
}

// Middleware de seguridad con logging
export function securityLogger(req: Request, res: Response, next: NextFunction) {
  const suspicious = detectSuspiciousActivity(req);
  
  if (suspicious) {
    console.warn("Suspicious activity detected", {
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString(),
      body: req.method !== "GET" ? JSON.stringify(req.body).substring(0, 200) : undefined
    });

    // Aplicar rate limiting más estricto
    return authRateLimit(req, res, next);
  }

  next();
}

// Inicializar Redis al importar el módulo
initializeRedis();
