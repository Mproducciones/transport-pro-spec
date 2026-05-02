# Production Readiness Checklist

Transport Pro solo debe subirse a servidor cuando este checklist este completo.

## Estado

Estado actual: desarrollo local y pruebas guiadas con agentes.

Decision actual: no desplegar todavia.

Ultima ronda local:

- Backend unit tests: OK (4/4).
- Smoke critico: OK (cliente crea pedido, admin cotiza/asigna/aprueba, cliente paga, admin valida, chofer retira/ruta/entrega).
- Smoke billing: OK (subtotal, IVA, total, pagos parciales, rechazo, saldo final y bloqueo de sobrepago).
- Comprobantes: OK, cliente puede tomar foto/subir archivo y admin puede ver el comprobante original antes de validar.
- Login por roles: OK para admin, cliente y chofer (`npm run verify:auth-roles`).
- Build frontend: OK, bundle principal reducido con rutas lazy y sin advertencia de chunk grande.
- UX cliente/chofer: primer pase OK, CTA principal mas claro y menos texto inicial.
- Configuracion por ambiente: ejemplos separados para development/production.
- CORS: OK, lista de origenes permitidos y comodin rechazado en production.
- Endpoints dev: `activate-dev` no se registra en production.
- Acciones principales admin: primer pase OK en Envios y Pagos.
- Feedback agentes admin: aplicado primer bloque P0 financiero-operativo.
- Finanzas: ingresos del mes usan pagos aprobados y cartera usa saldo real pendiente.
- Facturas: no se puede anular una factura con pagos aprobados.
- Pagos admin: export CSV, cliente visible, montos CLP y trazabilidad basica.
- Envios admin: rechazo, entrega y asignacion usan modales/formularios en vez de prompts criticos.
- Admin full pass: aplicado skin B2B profesional, menu agrupado y acceso movil "Mas".
- Dashboard admin: KPIs alineados (entregas hoy reales, viajes en curso consistente).
- Soporte choferes: selector por nombre/patente, no ID manual.
- Choferes: historial filtra por ID real y estados en lenguaje humano.
- Facturas: IVA 19% por defecto, vencimientos ordenados por fecha y montos CLP.
- Reportes: export de pagos disponible junto a envios/facturas/egresos.
- Egresos y liquidaciones: montos visibles en CLP.
- Migraciones Prisma: OK (`npx prisma migrate deploy`, sin pendientes).
- Seed demo: OK (`npm run db:seed`).
- Uploads: limite por tamano, tipos permitidos PDF/JPG/PNG/WebP y extensiones controladas por MIME.
- Mensajes tecnicos visibles: primer pase OK en dashboard/admin y errores publicos de schema drift.
- Tenant isolation multiempresa: OK.
- Backend/frontend activos en local: OK.

## Checklist P0

- [x] Build frontend pasa sin errores.
- [x] Build backend pasa sin errores.
- [x] Migraciones Prisma aplican correctamente en entorno local.
- [x] Seed demo funciona en entorno local.
- [x] Login funciona para admin, cliente y conductor.
- [x] Cada rol ve solo sus datos en prueba multiempresa automatizada.
- [x] Tenant isolation probado con mas de una empresa.
- [x] Cliente puede crear pedido y entender el estado en smoke critico.
- [x] Empresa puede aprobar/rechazar pedido y asignar chofer en smoke critico.
- [x] Chofer puede retirar, iniciar ruta y cerrar entrega en smoke critico.
- [x] Facturas calculan subtotal, IVA, total y saldo correctamente en smoke billing.
- [x] Pagos se registran, muestran comprobante y validan correctamente.
- [x] Uploads tienen limite, validacion de tipo y almacenamiento local definido.
- [x] Variables `.env` separadas por ambiente.
- [x] `JWT_SECRET` fuerte requerido en production.
- [x] `OWNER_API_KEY` fuerte, no compartido y no guardado en storage persistente del navegador.
- [x] CORS limitado a origenes configurados y sin comodin en production.
- [ ] Backups de PostgreSQL definidos.
- [ ] Logs y manejo de errores revisados completamente.

## Feedback Admin Aceptado

Primer bloque aplicado:

- Dashboard financiero no mezcla pagos pendientes/rechazados con ingresos aprobados.
- Cartera por cobrar muestra saldo real pendiente, no monto bruto del envio.
- Facturas con pagos aprobados quedan protegidas contra anulacion directa.
- Pagos agrega export para conciliacion bancaria (`pagos.csv`).
- En Envios se reemplazaron prompts criticos por formularios/modales para rechazo, entrega y asignacion.

Siguiente bloque recomendado:

- Agrupar menu admin por Operacion, Cobranza, Analisis y Ajustes.
- Reemplazar confirmaciones restantes de alto impacto por modales con resumen.
- Revisar Facturas: saldo por factura y aviso visual antes de anular.
- Revisar Ajustes: separar datos de empresa, usuarios y plan.

## Checklist UI/UX

- [ ] Cada pantalla tiene una accion principal clara.
- [ ] Estados tecnicos estan traducidos a lenguaje humano.
- [x] Cliente entiende: deuda, pago enviado, pago en revision, pago rechazado.
- [x] Chofer puede operar en movil sin leer instrucciones largas en flujo principal.
- [ ] No hay jerga tecnica visible para usuarios finales.
- [ ] Botones tactiles tienen tamano adecuado en movil.
- [ ] Los nombres son consistentes: Envios, Facturas, Pagos, Choferes.
- [ ] Mensajes de error dicen que hacer, no solo el error tecnico.

## Checklist Seguridad

- [x] Modelo documentado: [SECURITY.md](SECURITY.md) (capas, RLS opcional, agente de revisión).
- [x] Validación con Zod en varios routers; revisar nuevos endpoints en PR.
- [x] Autorización por rol en backend (`requireRole` + comprobaciones por recurso).
- [x] `tenantId` en consultas de negocio + `npm run verify:tenant-isolation`.
- [x] Password hashing (bcrypt).
- [x] Rate limit global `/api/`, mutaciones `/api/v1`, y auth configurable.
- [x] Webhook: token opcional `X-TP-Webhook-Token` si `MP_WEBHOOK_SECRET`.
- [ ] RLS PostgreSQL (defensa adicional; requiere diseño de conexión/transacción).
- [ ] No hay secretos en repo (revisión periódica).
- [ ] La API no arranca en `production` si faltan `DATABASE_URL`, `FRONTEND_URL`, `JWT_SECRET` u `OWNER_API_KEY`.
- [x] La consola owner no persiste `OWNER_API_KEY` en `localStorage`.
- [x] La comparacion de `OWNER_API_KEY` en backend usa comparacion de tiempo constante.
- [x] Uploads no permiten ejecucion de archivos en validacion local: solo PDF/JPG/PNG/WebP y nombres generados por servidor.
- [x] Endpoints de desarrollo deshabilitados en produccion.

## Checklist Operacion Online

- [ ] Proveedor elegido para backend/base/frontend.
- [ ] Dominio definido.
- [ ] Base PostgreSQL gestionada.
- [ ] Storage para comprobantes y evidencias definido.
- [ ] SSL activo.
- [ ] Variables de produccion cargadas.
- [ ] Healthcheck real configurado.
- [ ] Plan de rollback definido.

## Comandos Locales De Verificacion

```powershell
cd backend
npm run build
npm run test:unit
npm run smoke:critical
npm run smoke:billing
npm run verify:auth-roles
npm run seed:clean-accounts
npm run verify:tenant-isolation
```

```powershell
cd frontend
npm run build
```

## Variables Obligatorias En Produccion

En `NODE_ENV=production`, la API debe fallar al arrancar si falta alguna de estas variables:

- `DATABASE_URL`
- `FRONTEND_URL`
- `JWT_SECRET` con minimo 32 caracteres
- `OWNER_API_KEY` con minimo 32 caracteres

Los valores de desarrollo (`dev-only-change-me`, `owner-dev-key`) no pueden usarse en produccion.

## Criterio Para Subir A Servidor

Se puede preparar despliegue solo cuando:

- No quedan P0 abiertos.
- Los cinco agentes usuarios completan sus flujos.
- Manager aprueba la version.
- Fullstack confirma seguridad y migraciones.
- UI/UX confirma claridad de uso para usuarios de 25 a 60 anos.

