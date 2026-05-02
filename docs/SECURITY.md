# Ciberseguridad y defensa en profundidad

Este documento define el **modelo de amenazas** básico, las **capas** ya implementadas y el rol del **agente de ciberseguridad** (humano o IA) en el ciclo de vida del repositorio. No reemplaza un pentest anual, auditoría formal ni un SOC.

## 1. Objetivo

- La API **no** es un prototipo expuesto: autenticación, autorización por rol, **aislamiento multiempresa (tenant)** y rate limiting forman el mínimo aceptable.
- **Producción** exige `JWT_SECRET` y `OWNER_API_KEY` robustos, CORS acotado, HTTPS y criterios de backup/log (ver [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md)).

## 2. Capas implementadas (backend)

| Capa | Descripción |
|------|-------------|
| **Transporte** | TLS en el borde (proxy, no en Node directamente en muchos despliegues). |
| **Cabeceras HTTP** | `helmet` vía [httpSecurity.ts](../backend/src/middleware/httpSecurity.ts): HSTS en producción (deshabilitable con `HSTS=false`), sin CSP para cuerpo JSON. |
| **CORS** | Orígenes explícitos; `*` prohibido en producción ([config.ts](../backend/src/config.ts)). |
| **Límites de frecuencia** | Límite global `/api/`, límite adicional a mutaciones bajo `/api/v1` (POST/PATCH/PUT/DELETE), límite de auth (login/registro) configurable. |
| **Autenticación** | JWT con `Authorization: Bearer`; comprobación de suscripción activa (excepto rutas puntuales) en [auth.ts](../backend/src/middleware/auth.ts). |
| **Autorización** | `requireRole` en rutas sensibles; cada handler valida además **acceso de datos** (p. ej. chofer solo su envío). |
| **Tenant (aplicación)** | Casi todas las consultas Prisma filtran `tenantId` del token; comprobado por script `verify:tenant-isolation`. |
| **Consola owner** | `/api/owner` exige clave de API, comparación resistente a timing ([ownerAuth.ts](../backend/src/middleware/ownerAuth.ts)). |
| **Webhooks** | Si `MP_WEBHOOK_SECRET` está definida, exige cabecera `X-TP-Webhook-Token` (comparación en tiempo constante) antes de procesar. |
| **Contraseñas** | `bcrypt` en registro y login. |
| **Subidas** | Tamaño y tipos restringidos en adjuntos. |

## 3. Row Level Security (PostgreSQL)

- **Estado hoy:** el aislamiento de filas se cumple en **aplicación** (Prisma + `where: { tenantId }` + pruebas).
- **RLS en base de datos** es posible (ver [rls_tenant_isolation_postgresql.sql](sql/rls_tenant_isolation_postgresql.sql)) pero **choca con el pool de conexiones de Prisma** si se usa `SET` de sesión sin transacción aislada. Actívalo solo con un diseño concreto (transacción por request, o rol/pool separado) y prueba de regresión.
- **Recomendación P1:** seguir reforzando pruebas automáticas de aislamiento; RLS como capa adicional tras diseño con DBA.

## 4. Endpoints y superficie pública (resumen)

- **Público (sin JWT):** `POST /api/v1/auth/login`, `POST /api/v1/auth/register` (y variantes de registro en el router), `GET /health`.
- **Webhooks:** `POST /api/v1/webhooks/mercadopago` — protegido con token opcional y lógica MP en evolución.
- **Resto de `/api/v1`:** requiere `authenticate` (y a menudo `requireRole`) según el router; revisar el archivo bajo [backend/src/routes/](../backend/src/routes/).
- **Owner:** `/api/owner` con clave; no mezclar con sesiones de empresa.

## 5. Comprobaciones en CI / local

```bash
cd backend
npm run test:unit
npm run verify:auth-roles
npm run verify:tenant-isolation
npm run build
npm run security:check
```

`security:check` hace un barrido estático mínimo de la superficie (ver script).

## 6. Agente de ciberseguridad (rol)

Cualquiera (humano o asistente con la regla **cybersecurity-agent** en Cursor) puede:

1. Revisar nuevos endpoints: ¿`authenticate`? ¿`tenantId` en queries? ¿validación con Zod u otro?
2. Revisar cambios de CORS, límites, cabeceras y variables de entorno.
3. Exigir pruebas `verify:tenant-isolation` y `verify:auth-roles` cuando toque autenticación o datos multicliente.
4. No aprobar almacenamiento de secretos en el repositorio ni claves de demo en **producción**.

## 7. Recomendaciones P1 / P2

- Backups y retención de PostgreSQL; rotación de `JWT_SECRET` con plan de sesiones.
- Firma criptográfica de webhooks (p. ej. HMAC del cuerpo crudo) cuando MP esté en uso real.
- Logging estructurado y alerta por 401/403 masivos; WAF o reglas en el proveedor (Cloudflare, etc.).
