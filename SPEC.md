# Transport Pro — Especificación para reconstruir el SaaS desde cero

**Nombre de producto (provisional):** Transport Pro — SaaS de gestión operativa y comercial para empresas de transporte de carga.

**Versión del documento:** 1.0  
**Audiencia:** ingeniería de software, producto, implementación greenfield.

---

## 1. Contexto y problema

Muchas pymes de transporte operan con **WhatsApp**, llamadas y **anotaciones dispersas**. Eso genera:

- Envíos retrasados o “perdidos”.
- **Incertidumbre sobre cobros** (¿pagaron o no?).
- Poca **trazabilidad de estados**.
- Dependencia de **personas clave**.

El producto debe ser la **fuente de verdad** operativa y financiera: pedidos, asignación, seguimiento, facturación y visibilidad para el equipo interno y para clientes externos. El chat puede seguir como **canal de aviso**, pero **no** como registro oficial.

---

## 2. Visión del producto

Plataforma **multi-tenant** (cada empresa de transporte es un *tenant*) que permite:

- Gestionar **envíos** con estados claros e **historial** de cambios.
- Gestionar **conductores** y **vehículos** con reglas de negocio explícitas.
- Gestionar **clientes** (empresas que contratan el servicio) y **usuarios** con roles.
- **Facturación / cobros** alineados con envíos o clientes.
- **Portales diferenciados:** administrador interno, cliente (pedidos y seguimiento), conductor (sus rutas).
- **Suscripción del tenant** (p. ej. Mercado Pago) para monetizar el software.
- **Reportes** con datos agregados, visualización y **exportación** (CSV u otros) cuando aplique.

---

## 3. Actores y roles (RBAC)

| Rol | Clave | Descripción |
|-----|--------|-------------|
| Administrador | `admin` | Usuario de la empresa de transporte. Acceso al panel completo: configuración, usuarios, flota, envíos, finanzas, reportes, suscripción. |
| Cliente | `cliente` | Usuario de una empresa **cliente** del transportista. Portal: crear pedidos de envío, ver historial y estados; ver **solo sus** facturas (aislamiento por `customer` vinculado al usuario). |
| Conductor | `conductor` | Usuario vinculado a un registro de **conductor**. Portal: ver envíos **asignados**, actualizar estado. No ve el panel administrativo ni datos de otros conductores. |

### Regla de registro público

- El registro abierto crea **solo** usuarios **`cliente`**, asociados a un **tenant existente** (identificado por un **slug** u otro identificador acordado).
- **No** crea nuevos tenants ni usuarios `admin` desde el registro público.
- **Conductores** y **admins** los crea el **administrador** del tenant.

---

## 4. Reglas de negocio clave

### 4.1 Conductores y vehículos

- Un conductor opera **como máximo un vehículo asignado** a la vez (`assigned_vehicle_id`).
- A nivel tenant: **un vehículo no puede estar asignado a dos conductores** (restricción de unicidad en `assigned_vehicle_id` cuando no es nulo).
- Solo vehículos en estado **`disponible`** pueden asignarse a un conductor.
- Estados de vehículo deben incluir explícitamente **`en_taller`** (en taller / reparación): el vehículo **no** está en condiciones de operar ni de asignarse hasta volver a **`disponible`** (u otra política documentada y configurable).

### 4.2 Envíos

- Si un envío tiene **conductor**, el **vehículo del envío** debe **coincidir** con el vehículo asignado a ese conductor, o **derivarse automáticamente** de ese vínculo.
- No permitir conductor A con vehículo B si B es el asignado a otro conductor o no corresponde a A.
- **Estados de envío:** pipeline definido (ej. pendiente → confirmado → recogido → en tránsito → entregado, etc.), con **historial** (quién / cuándo / nota / ubicación opcional).
- **Cobro del envío** (`payment_status` o equivalente): visible en listados para no depender de la memoria.

### 4.3 Facturas

- **Administrador:** emisión y gestión según modelo de negocio acordado.
- **Cliente:** lectura **filtrada** por el cliente vinculado a su cuenta.

### 4.4 Multi-tenancy

- Toda entidad operativa lleva **`tenant_id`**.
- APIs y consultas **siempre** filtran por el tenant derivado del token/sesión autenticada.

---

## 5. Modelo de datos (alto nivel)

Entidades mínimas sugeridas (nombres orientativos):

- **`tenants`**, **`users`** (`role`, `tenant_id`, email único por tenant).
- **`companies`** / datos fiscales del tenant si aplica.
- **`customers`** (clientes comerciales del transportista; vínculo con usuario `cliente` — ver §7).
- **`drivers`**, **`vehicles`**, relación **1 conductor ↔ 0..1 vehículo** con unicidad en vehículo asignado.
- **`shipments`** (cliente, conductor opcional, vehículo, montos, estados, fechas, trazabilidad).
- **`shipment_status_history`** (o eventos de estado equivalentes).
- **`invoices`**, **`payments`** (y líneas si aplica).
- **`subscriptions`** (plan, estado, integración con pasarela, IDs externos).

---

## 6. Requisitos no funcionales

- **Seguridad:** autenticación (JWT u OAuth2), contraseñas hasheadas, HTTPS en producción, CORS acotado, rate limiting, headers seguros (p. ej. Helmet), validación de entrada, **webhooks firmados** si hay pagos.
- **Autorización:** middleware por ruta según rol; **nunca** confiar solo en el frontend.
- **Observabilidad:** logs estructurados; correlación `request_id` deseable.
- **Datos:** migraciones versionadas (SQL u herramienta equivalente); seeds solo para desarrollo.
- **UX:** paneles distintos por rol; **alertas operativas** (envíos estancados, cobros pendientes, facturas por vencer) con umbrales **configurables** en fase posterior.

---

## 7. Supuestos y vínculos explícitos (ingeniería)

### 7.1 Supuestos de negocio / mercado

- **Idioma UI:** español.
- **Moneda y fiscalidad:** definir por despliegue (ej. Ecuador, IVA 12% en facturación si aplica al producto).
- **Zona horaria:** definir por tenant o global (documentar en despliegue).

### 7.2 Identificador del tenant en registro público

- **`tenant_slug`** (o equivalente): formato, **unicidad global**, visibilidad en panel admin (“copiar enlace / slug para que se registren tus clientes”).

### 7.3 Vinculación usuario ↔ conductor / cliente

Elegir **una** estrategia y documentarla en implementación:

- **Opción A (simple):** mismo **email** en `users`, `drivers.email` y `customers.email` respectivamente.
- **Opción B (robusta):** columnas `user_id` en `drivers` y/o `customers`, o tablas de enlace.

Sin esta regla, los portales quedan ambiguos.

### 7.4 API

- Prefijo versionado recomendado: **`/api/v1/...`**.
- Errores JSON consistentes: `success`, `message`, `code` (opcional), `details` (validación).
- Paginación: `page`, `limit`, totales y `pages`.

### 7.5 Máquina de estados (envío)

- Documentar **transiciones permitidas** y si el conductor puede “retroceder” estados.
- Eventos de dominio: quién puede disparar cada transición (`admin` vs `conductor`).

---

## 8. Integraciones

- **Suscripción:** Mercado Pago (preapproval / webhooks).
- **Modo test:** sin llamadas reales cuando variable tipo **`MP_ENABLED=false`** (o equivalente).
- **Opcional futuro:** email transaccional, almacenamiento de POD/fotos, mapas.

---

## 9. Stack sugerido (referencia; ajustable)

- **Backend:** Node.js + framework HTTP (Express/Fastify), ORM (Sequelize/Prisma), **PostgreSQL**.
- **Frontend:** SPA (**React**) con enrutador, **React Query** (u otra capa de datos), estado local mínimo (**Zustand** u otro).
- **Infra:** variables de entorno por entorno, **`.env.example`** sin secretos, CI con lint + tests.

---

## 10. Entregables por fases

1. **MVP operativo:** tenants, auth, admin, CRUD conductores/vehículos con reglas 1:1 y `en_taller`, envíos con estados e historial, portal cliente básico, portal conductor básico.
2. **Finanzas:** facturas, pagos, vistas cliente filtradas, reportes y export CSV.
3. **Monetización:** suscripción + webhooks + estado del tenant.
4. **Endurecimiento:** alertas configurables, auditoría, backups, hardening, performance.

---

## 11. Criterios de aceptación globales

- Un **cliente** nunca ve envíos ni facturas de otro cliente del mismo tenant.
- Un **conductor** nunca modifica envíos que no le pertenecen.
- Un **admin** tiene visibilidad total **de su tenant**.
- Es **imposible** asignar el mismo vehículo activo a dos conductores.
- Vehículo en **taller** no se asigna ni cuenta como operativo hasta cambio de estado explícito a **`disponible`** (o regla documentada).

---

## 12. Privacidad y retención (mínimo)

- Definir qué roles ven **PII** (email, teléfono, direcciones).
- Política mínima de **borrado / anonimización** ante baja de cliente (alcance por fase).

---

*Fin del documento. Úsalo como entrada única para implementación greenfield, PRD adjunto a ingeniería, o prompt maestro para agentes de código.*
