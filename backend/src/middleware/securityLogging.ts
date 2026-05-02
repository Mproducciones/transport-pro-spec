import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../lib/apiError.js";

// Niveles de logging
export enum SecurityLevel {
  LOW = "low",
  MEDIUM = "medium", 
  HIGH = "high",
  CRITICAL = "critical"
}

// Eventos de seguridad para logging
export interface SecurityEvent {
  level: SecurityLevel;
  type: string;
  ip: string;
  userAgent?: string;
  path: string;
  method: string;
  userId?: string;
  tenantId?: string;
  timestamp: Date;
  details?: Record<string, any>;
}

// Logger de seguridad
export class SecurityLogger {
  private static events: SecurityEvent[] = [];
  private static maxEvents = 1000; // Mantener solo los últimos 1000 eventos

  static log(event: Omit<SecurityEvent, "timestamp">): void {
    const securityEvent: SecurityEvent = {
      ...event,
      timestamp: new Date()
    };

    // Agregar al buffer
    this.events.push(securityEvent);

    // Mantener tamaño del buffer
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Logging a consola con formato estructurado
    const logMessage = `[SECURITY] ${event.level.toUpperCase()}: ${event.type}`;
    const logData = {
      ip: event.ip,
      path: event.path,
      method: event.method,
      userId: event.userId,
      tenantId: event.tenantId,
      timestamp: securityEvent.timestamp.toISOString(),
      ...event.details
    };

    switch (event.level) {
      case SecurityLevel.CRITICAL:
        console.error(logMessage, logData);
        break;
      case SecurityLevel.HIGH:
        console.warn(logMessage, logData);
        break;
      case SecurityLevel.MEDIUM:
        console.info(logMessage, logData);
        break;
      default:
        console.log(logMessage, logData);
    }
  }

  static getRecentEvents(limit: number = 100): SecurityEvent[] {
    return this.events.slice(-limit);
  }

  static getEventsByIP(ip: string, limit: number = 50): SecurityEvent[] {
    return this.events
      .filter(event => event.ip === ip)
      .slice(-limit);
  }

  static getCriticalEvents(hours: number = 24): SecurityEvent[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.events
      .filter(event => 
        event.level === SecurityLevel.CRITICAL && 
        event.timestamp > cutoff
      );
  }
}

// Middleware para detectar y loguear actividad sospechosa
export function securityAuditLogger(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip;
  const userAgent = req.get("User-Agent") || "";
  const path = req.path;
  const method = req.method;
  const auth = req.auth;

  // Detectar patrones sospechosos
  const suspiciousPatterns = [
    { pattern: /bot|crawler|spider|scraper/i, type: "SUSPICIOUS_USER_AGENT" },
    { pattern: /curl|wget|python|java|go-http/i, type: "AUTOMATED_CLIENT" },
    { pattern: /\.\./, type: "PATH_TRAVERSAL_ATTEMPT" },
    { pattern: /<script|javascript:|onload=/i, type: "XSS_ATTEMPT" },
    { pattern: /union.*select|drop.*table|insert.*into/i, type: "SQL_INJECTION_ATTEMPT" }
  ];

  let suspiciousActivity = false;
  let securityLevel = SecurityLevel.LOW;

  // Analizar User-Agent
  for (const { pattern, type } of suspiciousPatterns) {
    if (pattern.test(userAgent)) {
      SecurityLogger.log({
        level: SecurityLevel.MEDIUM,
        type,
        ip,
        userAgent,
        path,
        method,
        userId: auth?.sub || undefined,
        tenantId: auth?.tenantId || undefined,
        details: { userAgent: userAgent.substring(0, 100) }
      });
      suspiciousActivity = true;
      securityLevel = SecurityLevel.MEDIUM;
    }
  }

  // Analizar URL y parámetros
  const urlToCheck = req.originalUrl || req.url;
  for (const { pattern, type } of suspiciousPatterns) {
    if (pattern.test(urlToCheck)) {
      SecurityLogger.log({
        level: SecurityLevel.HIGH,
        type,
        ip,
        userAgent,
        path,
        method,
        userId: auth?.sub || undefined,
        tenantId: auth?.tenantId || undefined,
        details: { url: urlToCheck.substring(0, 200) }
      });
      suspiciousActivity = true;
      securityLevel = SecurityLevel.HIGH;
    }
  }

  // Detectar ataques de fuerza bruta
  const authPaths = ["/api/v1/auth/login", "/api/v1/auth/register"];
  if (authPaths.some(p => path.startsWith(p))) {
    SecurityLogger.log({
      level: SecurityLevel.MEDIUM,
      type: "AUTH_ATTEMPT",
      ip,
      userAgent,
      path,
      method,
      userId: auth?.sub,
      tenantId: auth?.tenantId,
      details: { 
        email: req.body?.email ? "provided" : "missing",
        hasPassword: !!req.body?.password
      }
    });
  }

  // Detectar accesos a rutas sensibles
  const sensitivePaths = ["/api/v1/users", "/api/v1/companies", "/api/v1/owner"];
  if (sensitivePaths.some(p => path.startsWith(p))) {
    SecurityLogger.log({
      level: SecurityLevel.MEDIUM,
      type: "SENSITIVE_ACCESS",
      ip,
      userAgent,
      path,
      method,
      userId: auth?.sub,
      tenantId: auth?.tenantId,
      details: { role: auth?.role }
    });
  }

  // Log de errores de autenticación
  if (res.statusCode === 401) {
    SecurityLogger.log({
      level: SecurityLevel.HIGH,
      type: "AUTH_FAILED",
      ip,
      userAgent,
      path,
      method,
      userId: auth?.sub,
      tenantId: auth?.tenantId,
      details: { statusCode: res.statusCode }
    });
  }

  // Log de acceso denegado
  if (res.statusCode === 403) {
    SecurityLogger.log({
      level: SecurityLevel.HIGH,
      type: "ACCESS_DENIED",
      ip,
      userAgent,
      path,
      method,
      userId: auth?.sub,
      tenantId: auth?.tenantId,
      details: { statusCode: res.statusCode, role: auth?.role }
    });
  }

  // Log de errores del servidor
  if (res.statusCode >= 500) {
    SecurityLogger.log({
      level: SecurityLevel.CRITICAL,
      type: "SERVER_ERROR",
      ip,
      userAgent,
      path,
      method,
      userId: auth?.sub,
      tenantId: auth?.tenantId,
      details: { statusCode: res.statusCode }
    });
  }

  next();
}

// Middleware para detectar ataques DoS/DDoS
export function dosDetection(req: Request, res: Response, next: NextFunction): void | Response {
  const ip = req.ip;
  const now = Date.now();
  
  // Obtener requests recientes de esta IP
  const recentEvents = SecurityLogger.getEventsByIP(ip, 100);
  const recentRequests = recentEvents.filter(
    event => now - event.timestamp.getTime() < 60000 // Último minuto
  );

  // Si hay más de 100 requests en 1 minuto, posible DoS
  if (recentRequests.length > 100) {
    SecurityLogger.log({
      level: SecurityLevel.CRITICAL,
      type: "POSSIBLE_DOS_ATTACK",
      ip,
      userAgent: req.get("User-Agent"),
      path: req.path,
      method: req.method,
      userId: req.auth?.sub || undefined,
      tenantId: req.auth?.tenantId || undefined,
      details: { 
        requestsPerMinute: recentRequests.length,
        paths: recentRequests.slice(-10).map(e => e.path)
      }
    });

    // Podríamos bloquear la IP aquí, pero por ahora solo logueamos
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

// Función para generar reporte de seguridad
export function generateSecurityReport(hours: number = 24): {
  summary: Record<string, number>;
  criticalEvents: SecurityEvent[];
  topOffenders: Array<{ ip: string; count: number }>;
  recommendations: string[];
} {
  const events = SecurityLogger.getRecentEvents(1000);
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const recentEvents = events.filter(event => event.timestamp > cutoff);

  // Resumen por tipo
  const summary: Record<string, number> = {};
  recentEvents.forEach(event => {
    summary[event.type] = (summary[event.type] || 0) + 1;
  });

  // Eventos críticos
  const criticalEvents = recentEvents.filter(
    event => event.level === SecurityLevel.CRITICAL
  );

  // Top ofensores por IP
  const ipCounts: Record<string, number> = {};
  recentEvents.forEach(event => {
    ipCounts[event.ip] = (ipCounts[event.ip] || 0) + 1;
  });
  const topOffenders = Object.entries(ipCounts)
    .map(([ip, count]) => ({ ip, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Recomendaciones
  const recommendations: string[] = [];
  if (criticalEvents.length > 0) {
    recommendations.push("Investigar eventos críticos inmediatamente");
  }
  if (topOffenders.length > 0 && topOffenders[0].count > 50) {
    recommendations.push("Considerar bloquear IPs con actividad sospechosa");
  }
  if (summary["AUTH_FAILED"] > 10) {
    recommendations.push("Implementar bloqueo temporal después de múltiples fallos de autenticación");
  }

  return {
    summary,
    criticalEvents,
    topOffenders,
    recommendations
  };
}
