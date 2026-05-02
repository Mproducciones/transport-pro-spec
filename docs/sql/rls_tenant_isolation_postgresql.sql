-- =============================================================================
-- Row Level Security (RLS) opcional — Transport Pro
-- =============================================================================
-- NO se aplica sola: el cliente Prisma reutiliza conexiones y `SET` por sesión
-- puede mezclar inquilinos. Antes de activar RLS en producción:
--   1) Usar conexión por request, o
--   2) `SET LOCAL` dentro de la MISMA transacción que las consultas, o
--   3) PgBouncer en modo transacción + SET LOCAL al abrir,
--   4) O mantener el aislamiento en aplicación (Prisma + tenantId) como capa
--      principal (estado actual) y RLS como defensa adicional vía rol dedicado.
--
-- Este script es una base para revisión con DBA. Probar en copia, no en prod ciega.
-- =============================================================================

-- Ejemplo: variable de sesión (requiere SET en cada transacción o conexión limpia)
-- select set_config('app.tenant_id', '<uuid tenant>', true);

-- ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
-- CREATE POLICY user_tenant ON "User" FOR ALL
--   USING ( "tenantId" = current_setting('app.tenant_id', true) );

-- Repetir patrón para: Customer, Driver, Vehicle, Shipment, Invoice, Payment, Expense,
-- Alert, TariffRule, ShipmentAttachment, SupportMessage, DriverSettlement, Subscription
-- (tablas con columna tenantId; Company enlaza vía tenant único; Tenant es catálogo).

-- Política de fallo seguro: si `app.tenant_id` no está definida, no devolver filas.
--   USING ( "tenantId" = nullif(current_setting('app.tenant_id', true), '')::text );
-- (ajustar tipos si usás uuid nativo; aquí es TEXT / cuid)

-- Para migraciones y seeds, usar rol con BYPASSRLS o desactivar temporalmente
-- (solo operaciones controladas, nunca en la app pública).
