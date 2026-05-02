import type { Request, Response, NextFunction } from "express";

// Middleware simple de logging para pruebas
export function simpleSecurityLogger(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || "unknown";
  const path = req.path;
  const method = req.method;
  const userAgent = req.get("User-Agent") || "";
  
  // Log básico de seguridad
  console.log(`[SECURITY] ${method} ${path} from ${ip}`);
  
  // Detectar actividad sospechosa básica
  const suspiciousPatterns = [/bot/i, /crawler/i, /scraper/i];
  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(userAgent));
  
  if (isSuspicious) {
    console.warn(`[SUSPICIOUS] ${method} ${path} from ${ip} - ${userAgent}`);
  }
  
  next();
}

// Middleware simple de detección DoS
export function simpleDoSDetection(req: Request, res: Response, next: NextFunction): void | Response {
  const ip = req.ip || "unknown";
  const now = Date.now();
  
  // Almacenar requests por IP en memoria simple
  const requests = (global as any)._securityRequests || {};
  const ipRequests = requests[ip] || [];
  
  // Filtrar requests del último minuto
  const recentRequests = ipRequests.filter((timestamp: number) => now - timestamp < 60000);
  recentRequests.push(now);
  
  requests[ip] = recentRequests;
  (global as any)._securityRequests = requests;
  
  // Si hay más de 100 requests por minuto, posible DoS
  if (recentRequests.length > 100) {
    console.warn(`[DOS] Too many requests from ${ip}: ${recentRequests.length}/min`);
    return res.status(429).json({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests"
      }
    });
  }
  
  next();
}
