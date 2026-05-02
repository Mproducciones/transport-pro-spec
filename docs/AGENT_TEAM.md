# Transport Pro Agent Team

Este documento define el equipo virtual para mejorar la app por ciclos, siempre en local hasta que cumpla criterios de produccion. No se sube a servidor hasta pasar el checklist de lanzamiento.

## Objetivo

Construir una app intuitiva, estable y lista para operar online con empresas de transporte, clientes y choferes. Cada ciclo combina desarrollo, prueba de usuarios y revision tecnica.

## Agentes De Producto

### 1. Manager Del Proyecto

Responsabilidad: ordenar prioridades, detectar bloqueos y decidir que se trabaja primero.

Debe revisar:
- Que cada cambio tenga impacto real para operacion, cliente o chofer.
- Que no se agreguen features antes de cerrar fricciones basicas.
- Que el backlog este priorizado por riesgo: seguridad, datos, pagos, operacion diaria, usabilidad.
- Que no se despliegue hasta que los flujos criticos esten probados.

Entrega esperada:
- Lista de prioridades P0/P1/P2.
- Riesgos abiertos.
- Decision: seguir desarrollando, probar mas, o preparar despliegue.

### 2. Desarrollador Fullstack Node.js / React

Responsabilidad: implementar soluciones profesionales y mantener calidad tecnica.

Debe revisar:
- API Node/Express, Prisma, PostgreSQL, validaciones y permisos.
- React/Vite, estados, rutas y componentes compartidos.
- Seguridad basica: JWT, roles, tenant isolation, CORS, env vars, uploads.
- Errores silenciosos, duplicacion, queries pesadas y deuda tecnica.
- Tests, builds y migraciones.

Entrega esperada:
- Cambios de codigo acotados y verificables.
- Comandos ejecutados y resultado.
- Riesgos tecnicos pendientes.

### 3. Especialista UI/UX Profesional

Responsabilidad: hacer que la app sea simple, clara y confiable para usuarios de 25 a 60 anos.

Debe revisar:
- Que cada pantalla tenga una accion principal clara.
- Que los estados digan "que pasa" y "que hago ahora".
- Que no aparezca jerga tecnica en pantallas de cliente o chofer.
- Que los textos sean consistentes: envios, facturas, pagos, deuda, en revision.
- Que el diseno mantenga identidad visual, buena legibilidad y botones faciles de tocar en movil.

Entrega esperada:
- Fricciones por rol.
- Copy recomendado.
- Cambios UI concretos por archivo.

## Agentes Usuarios De Prueba

Estos son usuarios/personas para validar la app:

- Empresa de transporte: administra envios, choferes, flota, pagos y facturas.
- Cliente 1: solicita envios y revisa pagos en revision.
- Chofer 1: trabaja viajes en ruta y reporta avances.
- Cliente 2: revisa pedido confirmado, factura y pago aprobado.
- Chofer 2: toma viaje confirmado y prueba retiro/entrega.

Los datos de ruta generados por `seed:test-agents` usan **ciudades y direcciones de Chile** (Santiago, Valparaíso, Concepción, etc.) y teléfonos en formato **+56**.

Credenciales demo:

- `empresa.agente@demo.com` / `Admin123!`
- `cliente.agente1@demo.com` / `Cliente123!`
- `chofer.agente1@demo.com` / `Conductor123!`
- `cliente.agente2@demo.com` / `Cliente123!`
- `chofer.agente2@demo.com` / `Conductor123!`

Para **vaciar solo datos operativos** (envíos, facturas, pagos, etc.) y **mantener cuentas** demo:

```powershell
cd backend
npm run wipe:demo-operational
```

Por defecto actúa en tenants `demo`, `andescargo`, `patagoniaruta`. Otros slugs:  
`$env:DEMO_WIPE_SLUGS="demo"; npm run wipe:demo-operational`

Para regenerar escenarios después del wipe:

```powershell
cd backend
npm run seed:test-agents
```

Simulación **amplia** (pasado / hoy / futuro, Chile, factura y pagos de prueba) para recorrer todo el admin:

```powershell
cd backend
npm run seed:admin-simulation
```

Detalle de pantallas y checklist: `docs/SIMULACION_EQUIPO_ADMIN.md`.

## Ciclo De Trabajo

1. Manager define prioridad del ciclo.
2. UI/UX revisa friccion del flujo seleccionado.
3. Fullstack implementa cambios pequenos y seguros.
4. Usuarios de prueba validan empresa, cliente y chofer.
5. Se ejecutan verificaciones: build, lints, smoke/manual.
6. Manager decide si el ciclo esta cerrado o si se repite.

## Flujos Criticos

- Registro/login por rol.
- Empresa crea o administra clientes, choferes y vehiculos.
- Cliente crea pedido.
- Empresa aprueba/rechaza pedido, asigna chofer y vehiculo.
- Chofer retira, inicia ruta y cierra entrega.
- Cliente revisa estado, factura y pagos.
- Empresa valida pago y revisa reportes.
- Datos no cruzan tenants.

## Verificacion Multiempresa

Para probar que una empresa no pueda ver datos de otra:

```powershell
cd backend
npm run seed:clean-accounts
npm run verify:tenant-isolation
```

La verificacion usa Andes Cargo y Patagonia Ruta, prueba lectura y escritura cruzada por ID, y falla si algun recurso aparece fuera de su tenant.

## Regla De Despliegue

No desplegar a servidor mientras existan P0 abiertos.

P0 incluye:
- Login/roles inseguros.
- Datos cruzados entre empresas.
- Pagos/facturas con saldos incorrectos.
- Chofer no puede completar retiro/ruta/entrega.
- Cliente no entiende deuda, pago o estado del pedido.
- Build o migraciones fallan.

