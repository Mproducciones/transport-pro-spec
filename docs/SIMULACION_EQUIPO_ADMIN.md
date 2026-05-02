# Simulación equipo admin (Chile)

Guía para **probar la app como si fueran los agentes de prueba**, usando datos pasados, del día y futuros. Los envíos de simulación llevan descripción `sim-chile-*` y la factura demo `SIM-CHILE-FAC-001`.

## Cómo cargar los datos

1. Cuentas agente (una vez o tras un wipe):  
   `cd backend && npm run seed:test-agents`
2. Simulación amplia (idempotente sobre su propio marcador):  
   `cd backend && npm run seed:admin-simulation`

Para dejar solo maestros demo y volver a empezar: `npm run wipe:demo-operational` → `seed:test-agents` → `seed:admin-simulation`.

## Roles y credenciales (agentes)

| Agente | Rol en app | Email | Contraseña | Qué validar |
|--------|------------|-------|------------|-------------|
| Empresa | Admin | `empresa.agente@demo.com` | `Admin123!` | Todo el panel `/admin/*` |
| Cliente 1 | Cliente | `cliente.agente1@demo.com` | `Cliente123!` | Pedidos, pago pendiente saldo, mapa cliente |
| Cliente 2 | Cliente | `cliente.agente2@demo.com` | `Cliente123!` | Factura SIM-CHILE, historial |
| Chofer 1 | Conductor | `chofer.agente1@demo.com` | `Conductor123!` | Viaje en tránsito (Rancagua–Maipú), soporte |
| Chofer 2 | Conductor | `chofer.agente2@demo.com` | `Conductor123!` | Recogido hoy, futuro confirmado |

## Funciones del admin (menú) ↔ datos de la simulación

| Pantalla | Qué deberías ver con la simulación |
|----------|--------------------------------------|
| **Inicio** | KPIs con más envíos activos; mapa con viaje en tránsito; alertas/comprobantes según datos |
| **Envíos** | Mezcla: pasados (entregado/rechazado), hoy (confirmado/recogido/en tránsito), futuro (pendiente/confirmado). Filtrar por texto `sim-chile` en origen/descripción si el listado lo permite |
| **Mapa operativo** | Viaje `sim-chile-hoy-en-transito` con última posición (~Santiago/Maipú) |
| **Flota** | Sin cambios (vehículos AGT-101/102 del seed agente) |
| **Conductores** | Choferes agente con vehículo asignado |
| **Mensajes conductores** | Mensaje del chofer 1 ligado al envío en tránsito |
| **Clientes** | Perfiles con historial más cargado tras simulación |
| **Facturas** | Emitir nuevas si hace falta; existe `SIM-CHILE-FAC-001` vinculada a un envío Temuco–Valdivia |
| **Pagos** | `SIM-CHILE-SALDO-PENDIENTE` en revisión; otros aprobados |
| **Egresos** | Un peaje ~18 500 en envío Santiago–Valparaíso pasado |
| **Liquidaciones** | La simulación **no** crea liquidaciones; la pantalla puede quedar vacía hasta que generes períodos en API/UI |
| **Reportes** | CSV con más filas |
| **Auditoría** | Varios envíos con historial y notas de decisión |
| **Rentabilidad** | Viajes con ingresos/egresos/pagos aprobados |
| **Tarifas** | Independiente del seed; reglas previas se mantienen |
| **Configuración** | Datos fiscales demo Chile |

## Recorrido sugerido (orden ~30–45 min)

1. **Admin** → Inicio: números y mapa.  
2. **Envíos**: abrir uno pasado entregado, uno rechazado, uno hoy en tránsito, uno futuro pendiente.  
3. **Pagos**: validar o rechazar `SIM-CHILE-SALDO-PENDIENTE`.  
4. **Facturas**: localizar `SIM-CHILE-FAC-001`.  
5. **Egresos / Rentabilidad**: comprobar que aparece el peaje del tramo Santiago–Valparaíso.  
6. **Auditoría**: revisar pasos y actores (cliente vs empresa vs chofer).  
7. **Cliente 1** → pedidos y pagos (saldo pendiente del viaje en tránsito).  
8. **Chofer 1** → viaje activo y hilo de soporte.  
9. **Chofer 2** → estado recogido / programado futuro.

## Qué vigilar (calidad / “¿tiene sentido mantener?”)

- **Duplicidad de conceptos** entre Inicio, Envíos y Mapa: si tres lugares muestran lo mismo sin valor añadido, conviene simplificar.  
- **Filtros**: si no podés aislar `sim-chile` rápido, valorar filtro por etiqueta o por rango de fechas más visible.  
- **Liquidaciones**: si casi nunca hay datos sin flujo manual, documentar o enlazar “cómo generar período”.  
- **Pagos pendientes**: el badge en menú debe alinearse con la cola real de validación.  
- **Rutas largas en tablas móviles**: revisar si columnas esenciales quedan ocultas.

Esta lista es **opinión de producto** para iterar; no es un fallo automático de código.

## Limpieza

Solo borrar la simulación: volvé a ejecutar `seed-admin-simulation.ts` (hace wipe de `sim-chile-*` y `SIM-CHILE-*` antes de insertar).  
Para borrar **todo** lo operativo demo: `npm run wipe:demo-operational`.
