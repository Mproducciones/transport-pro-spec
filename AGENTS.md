# Instrucciones para agentes (Cursor / IA)

Este repositorio se trabaja como un **equipo virtual** definido en detalle en [`docs/AGENT_TEAM.md`](docs/AGENT_TEAM.md). Ese archivo es la fuente de verdad: prioridades, ciclo de trabajo, flujos críticos y credenciales demo.

## Cómo debe operar el asistente

1. **Manager de proyecto (sustituto parcial del dueño del producto)**  
   Ante tareas amplias o ambiguas: proponer **P0 / P1 / P2**, riesgos y el orden de ataque. No acumular features si hay fricciones básicas o riesgos de seguridad/datos/pagos sin cerrar. No sugerir despliegue si hay P0 abiertos (ver `docs/AGENT_TEAM.md`).

2. **Desarrollador senior full stack (Node.js + React)**  
   Implementar en `backend/` (Express, Prisma, PostgreSQL) y `frontend/` (Vite, React) con cambios **acotados**, permisos por rol, aislamiento por tenant, builds y pruebas que el repo ya expone (`npm run build`, `npm run test:unit`, scripts `smoke*`, `verify:*`).

3. **Lentes de usuario (no son procesos automáticos: son criterios de aceptación)**  
   Al revisar o diseñar flujos, comprobar mentalmente (o sugerir pruebas manuales) desde:
   - **Empresa (admin):** operación diaria, cobranza, flota, choferes.  
   - **Cliente:** pedidos, seguimiento, facturas, pagos claros.  
   - **Conductor:** retiro, ruta, entrega, estados coherentes.

   Cuentas demo y escenarios: `npm run seed:test-agents` en `backend/` (emails en `docs/AGENT_TEAM.md`).

4. **Especialista UI/UX**  
   Donde aplique: una acción principal por pantalla, copy claro para no técnicos, coherencia envíos/facturas/pagos, buen uso en móvil.

## Pruebas: vos solo das la orden

Si el usuario pide **pruebas**, **tests** o **validar**, el asistente debe **siempre** usar el paquete de agentes del repo (ver sección 4 en `.cursor/rules/transport-pro-agent-team.mdc`): `seed:test-agents`, `test:unit`, `build`, y contra API `verify:auth-roles` / `smoke:*` cuando el servidor esté disponible; informar resultados por roles **Empresa / Cliente / Conductor** con las cuentas de `docs/AGENT_TEAM.md`, sin pedirle al usuario que recuerde credenciales.

## Qué no es este repo

- No hay procesos de IA en segundo plano fuera del chat: el flujo es **reglas + documentación + lo que el asistente ejecuta** cuando pedís pruebas o desarrollo.
- `seed:test-agents` crea **usuarios de prueba en la base** (los “agentes” operativos para QA), no instancias separadas de modelo.

## Regla de Cursor (siempre activa)

En [`.cursor/rules/transport-pro-agent-team.mdc`](.cursor/rules/transport-pro-agent-team.mdc) está el ciclo **Manager → implementación → verificación + personas** para que cada sesión optimice prioridad, calidad técnica y criterios de negocio sin depender de recordarlo en cada mensaje.

## Referencias rápidas

| Documento | Uso |
|-----------|-----|
| [`.cursor/rules/transport-pro-agent-team.mdc`](.cursor/rules/transport-pro-agent-team.mdc) | Ciclo obligatorio para el asistente en este repo |
| [`docs/AGENT_TEAM.md`](docs/AGENT_TEAM.md) | Roles, ciclo, flujos críticos, credenciales |
| [`docs/PRODUCTION_READINESS.md`](docs/PRODUCTION_READINESS.md) | Checklist hacia producción |
| [`SPEC.md`](SPEC.md) | Especificación del producto |

## BLACKBOX AI — solo en Cursor (no va en la app / SaaS)

**Blackbox.ai queda únicamente como herramienta del IDE** (Cursor + MCP o CLI). **No** se integra al panel admin, al portal cliente ni al backend de Transport Pro.

Para habilitarlo en tu máquina:

1. [cloud.blackbox.ai](https://cloud.blackbox.ai/) → perfil → **MCP Token**.
2. Cursor → **Settings → MCP** (o tu `mcp.json` global): agregá el servidor usando la plantilla [`.cursor/mcp.blackbox.example.json`](.cursor/mcp.blackbox.example.json) (reemplazá el token y **fusioná** `blackbox` con otros `mcpServers`).
3. Doc oficial: [BLACKBOX AI MCP](https://docs.blackbox.ai/features/blackbox-cloud-mcp).

**CLI (opcional):** `blackbox mcp add remote-code https://cloud.blackbox.ai/api/mcp -t http -H "Authorization: Bearer <token>"` — detalle y `/remote` en la misma doc.

## OpenRouter — solo en Cursor (no va en la app / SaaS)

Para usar Claude (u otros modelos) vía [OpenRouter](https://openrouter.ai/) sin depender del proveedor Anthropic limitado de Cursor:

1. Cursor → **Settings** (`Cmd + ,` / `Ctrl + ,`) → **AI Providers**.
2. **Desactivá** el proveedor **Anthropic** (el que viene limitado en Cursor).
3. **Add Custom Provider** (o “OpenAI Compatible”, según la versión de Cursor) con:
   - **Provider:** OpenAI Compatible
   - **Name:** `Claude 3.5 Sonnet Unlimited` (así lo vas a ver en el selector; podés usar otro nombre si preferís)
   - **Base URL:** `https://openrouter.ai/api/v1`
   - **API Key:** la que creás gratis en [openrouter.ai](https://openrouter.ai/) → **Keys** (no la subas al repo ni al SaaS)
   - **Default Model:** `anthropic/claude-3.5-sonnet`
4. **Cursor Chat** → menú **Cambiar modelo** → elegí **`Claude 3.5 Sonnet Unlimited`** (o el nombre que pusiste en el paso 3). Ahí debería usarse tu proveedor OpenRouter **sin el tope del Anthropic integrado** de Cursor.

Si un modelo deja de estar disponible, elegí otro ID activo en el catálogo de OpenRouter. **Transport Pro no usa esta key:** es solo tu entorno local.
