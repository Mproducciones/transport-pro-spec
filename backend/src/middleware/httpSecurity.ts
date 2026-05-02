import helmet from "helmet";
import { config } from "../config.js";

/**
 * Encabezados HTTP seguros para API JSON. CSP configurada para APIs.
 * HSTS en producción detrás de HTTPS con configuración completa.
 */
export function securityHelmet() {
  return helmet({
    // Content Security Policy para APIs (restrictivo)
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        childSrc: ["'none'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        upgradeInsecureRequests: config.isProduction ? [] : null,
      },
    },
    // Políticas de recursos cruzados
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
    originAgentCluster: true,
    // Referrer Policy (más restrictivo)
    referrerPolicy: { policy: "no-referrer" },
    // DNS prefetch control (desactivado por seguridad)
    xDnsPrefetchControl: { allow: false },
    // HSTS (HTTP Strict Transport Security)
    strictTransportSecurity: config.hstsEnabled
      ? { 
          maxAge: 31536000, // 1 año
          includeSubDomains: true, 
          preload: true // Para inclusión en preload lists
        }
      : false,
    // Headers adicionales de seguridad
    permittedCrossDomainPolicies: false, // No permitir cross-domain Flash
    noSniff: true, // X-Content-Type-Options: nosniff
    frameguard: { action: 'deny' }, // X-Frame-Options: DENY
    xssFilter: true, // X-XSS-Protection: 1; mode=block
    // Control de características del navegador
    crossOriginOpenerPolicy: { policy: "same-origin" },
    // Protección contra MIME type sniffing
    ieNoOpen: true, // X-Download-Options: noopen
    // Ocultar tecnología del servidor
    hidePoweredBy: true, // Remover X-Powered-By
  });
}
