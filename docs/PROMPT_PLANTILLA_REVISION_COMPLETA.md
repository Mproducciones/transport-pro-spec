# Plantilla de prompt — revisión completa (técnica + UX operativa)

Copiá el bloque de **“Prompt para el asistente”** en Cursor u otra IA cuando quieras un análisis que no se quede solo en backend o esquema.

---

## Prompt para el asistente

Actuá como **arquitecto y desarrollador full stack** (React + Node/Prisma). Mi rol es **Product Owner**.

### Alcance obligatorio (marcá todas las capas; no omitas UX)

1. **Datos y API**  
   Obligatoriedad en BD y validaciones en servidor; coherencia con el frontend; migraciones si aplica; permisos por rol y tenant.

2. **UX operativa**  
   Cada acción que persista datos debe dejar claro **dónde queda** (ej.: “en este envío”, “en el pago”, no solo “guardado”).  
   Botones de guardar: evitar **guardados repetidos sin cambios** respecto al servidor; si no hay nada nuevo que persistir, el botón debe deshabilitarse o explicar por qué (tooltip / texto).  
   Si un paso del flujo está incompleto (ej.: falta equipo después de cotizar), debe haber **aviso visible** del siguiente paso obligatorio.

3. **Recorrido por rol**  
   Simulá o revisá en código **al menos** estos flujos, en orden:

   - **Admin:** bandeja de solicitudes → cotización → asignación conductor/vehículo → confirmación → pagos si aplica.  
   - **Cliente:** nueva solicitud (fechas obligatorias) → seguimiento → pagos / facturas.  
   - **Conductor:** viajes asignados → estados → ubicación / evidencias si aplica.

4. **Redundancia y superficie de API**  
   Rutas duplicadas o alias innecesarios; código muerto; una sola convención de paths documentada.

### Criterios de aceptación (observables)

- Ningún **“Guardar”** permite enviar al servidor **el mismo estado** una y otra vez sin feedback; debe haber estado “ya guardado” o botón deshabilitado cuando no hay delta.  
- Toda persistencia relevante tiene **mensaje o copy** que indique el **objeto de negocio** afectado (pedido, envío, pago, etc.).  
- Los flujos críticos no dejan al usuario sin saber **qué falta** para el siguiente paso legal/operativo (según reglas ya definidas en backend).

### Entregables

1. **Lista de fricciones** encontradas (UX + técnico), con prioridad P0 / P1 / P2.  
2. **Cambios de código** acotados a lo necesario para cerrar P0/P1 que pidas en esta misma tarea.  
3. Si hay riesgo de migración o breaking API, **advertilo** antes de aplicar.

### Formato de respuesta

- Breve resumen ejecutivo.  
- Tabla o lista de hallazgos priorizados.  
- Diffs / archivos tocados.  
- Sugerencias de extensión (solo si aportan al producto).

### Contexto del producto

- SaaS multi-empresa (tenant): administrador de transporte, clientes y choferes con datos y estados alineados.  
- Objetivo: **presentable a una empresa de carga** y base para **arriendo mensual** por empresa; no expandir features fuera de alcance si hay P0 de claridad operativa o datos.

### Reglas de implementación que quiero que respetes

- Campos **fecha y hora** obligatorios en flujos de retiro/entrega donde el negocio lo exija.  
- **Pills / estados** coherentes y legibles para operación.  
- Código modular; tests unitarios básicos cuando toques lógica de negocio compartida.  
- Documentación breve solo donde agregue valor (comentario en módulo o nota en PR), sin volúmenes innecesarios.

---

## Cómo usar esta plantilla

- **Solo análisis:** añadí al final: *“En esta iteración solo informe y checklist; no modifiques código.”*  
- **Análisis + arreglos:** *“Implementá P0 y P1 en el mismo turno.”*  
- **Una pantalla:** *“Limitá el recorrido UX a `/admin/envíos` (o la ruta que indique).”*

---

## Referencia rápida — lecciones ya vividas en este repo

- “Análisis completo” sin **recorrido UI por rol** suele quedarse en BD/API y deja pasar fricciones de botones y copy.  
- Los usuarios necesitan saber **en qué registro** se guarda cada cosa (envío vs archivo suelto).  
- Duplicar rutas REST en varios idiomas/paths aumenta superficie sin beneficio si el front no las usa.
