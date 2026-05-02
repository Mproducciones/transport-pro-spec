# Release hoy (MVP)

Checklist operativo para salir a produccion hoy sin perder control.

## 1) Pre-flight local (obligatorio)

Ejecutar:

```powershell
.\scripts\release-local.ps1
```

Criterio de salida:

- `backend` compila.
- `frontend` compila.
- `npm run smoke` termina en `Smoke OK`.

## 2) Variables de entorno productivas

Definir en backend:

- `NODE_ENV=production`
- `PORT` (ej: `4000`)
- `FRONTEND_URL` (URL real del frontend)
- `DATABASE_URL` (base productiva)
- `JWT_SECRET` (largo, unico, minimo 32 caracteres)
- `OWNER_API_KEY` (largo, unico, minimo 32 caracteres)
- `MP_ENABLED` (`true` solo cuando se active MP real)

Regla:

- No usar credenciales demo en produccion.
- La API no debe arrancar en `production` si faltan `DATABASE_URL`, `FRONTEND_URL`, `JWT_SECRET` u `OWNER_API_KEY`.
- No usar `dev-only-change-me` ni `owner-dev-key` en produccion.
- La clave `OWNER_API_KEY` no debe guardarse en `localStorage`; ingresarla solo cuando se use el panel owner.

## 3) Base de datos (antes de deploy)

1. Hacer backup.
2. Ejecutar migraciones:

```powershell
cd backend
npx prisma migrate deploy
```

3. Verificar que existan usuarios iniciales reales (admin principal y operadores).

## 4) Deploy backend

- Build:

```powershell
cd backend
npm run build
```

- Run:

```powershell
npm run start
```

- Health check:

```powershell
Invoke-RestMethod -Uri "http://localhost:4000/health"
```

## 5) Deploy frontend

- Build:

```powershell
cd frontend
npm run build
```

- Publicar `frontend/dist` en el hosting elegido.
- Confirmar que la app apunte al backend correcto.

## 6) Prueba de humo post-deploy (obligatoria)

Desde backend:

```powershell
$env:PROD_API_BASE="https://TU_API_REAL/api/v1"
$env:SMOKE_COMPANY_TAX_ID="RUT_O_NIT_REAL"
$env:SMOKE_ADMIN_EMAIL="admin@tuempresa.com"
$env:SMOKE_ADMIN_PASSWORD="..."
$env:SMOKE_CLIENT_EMAIL="cliente@tuempresa.com"
$env:SMOKE_CLIENT_PASSWORD="..."
$env:SMOKE_DRIVER_EMAIL="conductor@tuempresa.com"
$env:SMOKE_DRIVER_PASSWORD="..."
.\scripts\release-prod.ps1
```

Debe devolver `Smoke OK`.

## 6.1) Prueba tenant isolation (obligatoria antes de servidor)

```powershell
cd backend
npm run seed:clean-accounts
npm run verify:tenant-isolation
```

Debe devolver `"ok": true` y confirmar que Andes Cargo y Patagonia Ruta no comparten datos.

## 7) Cierre de release (hoy mismo)

- Probar 1 flujo por rol:
  - admin: crea envio, confirma, revisa reportes.
  - cliente: ve sus envios y pagos.
  - conductor: actualiza estado permitido.
- Activar monitoreo de errores y logs.
- Congelar features 24h: solo hotfixes criticos.

## 8) Plan de rollback rapido

Si falla algo critico:

1. Restaurar backend anterior.
2. Restaurar backup de DB (si hubo cambio destructivo).
3. Confirmar `/health`.
4. Reabrir acceso cuando `smoke` vuelva a pasar.

