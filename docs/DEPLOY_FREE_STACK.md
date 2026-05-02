# Piloto gratis: Neon + Render + Vercel

Stack recomendado para probar Transport Pro online sin VPS: **Postgres en Neon**, **API en Render** (Docker), **frontend en Vercel**.

## Orden de tareas

1. **Neon** — Crear proyecto → copiar `DATABASE_URL` (incluye `?sslmode=require` si aplica).
2. **GitHub** — Subir este repo (si aún no está).
3. **Render** — New → Blueprint → conectar repo → seleccionar `render.yaml`, o crear **Web Service** manual:
   - Docker
   - Dockerfile path: `backend/Dockerfile`
   - Docker context: `backend`
   - Health check path: `/health`
4. En Render, variables de entorno (producción):
   - `DATABASE_URL` — la de Neon
   - `JWT_SECRET` — mínimo 32 caracteres aleatorios
   - `OWNER_API_KEY` — mínimo 32 caracteres (consola owner)
   - `FRONTEND_URL` — URL final del frontend, ej. `https://tu-app.vercel.app`
   - `CORS_ORIGINS` — la misma URL que `FRONTEND_URL` (si hay varias, separadas por coma)
   - `CROSS_ORIGIN_COOKIES` — `true` (frontend y API en dominios distintos)
   - `TRUST_PROXY_HOPS` — `1`
5. Esperar a que la API quede **Live** y anotar la URL pública, ej. `https://transport-pro-api-xxxx.onrender.com`.
6. **Migraciones** — El contenedor ejecuta `prisma migrate deploy` al iniciar. Si falla, revisá `DATABASE_URL` y que Neon acepte conexiones.
7. **Vercel** — New Project → mismo repo → **Root Directory**: `frontend`
8. En Vercel → Settings → Environment Variables (Production):
   - `VITE_API_ORIGIN` — URL de la API **sin** barra final, ej. `https://transport-pro-api-xxxx.onrender.com`
9. Deploy del frontend. La variable `VITE_*` se inyecta en **build**; tras cambiarla, redeploy.
10. Volver a Render y confirmar `FRONTEND_URL` y `CORS_ORIGINS` coinciden con la URL de Vercel.

## GitHub Actions (ya en el repo)

Tras subir el código a GitHub:

| Workflow | Qué hace |
|----------|----------|
| **CI** (`.github/workflows/ci.yml`) | En cada push/PR a `main` o `master`: tests backend, `tsc`, `security:check`, build del frontend. **No usa secretos.** |
| **Deploy frontend (Vercel)** | En push a `main`/`master` que toque `frontend/**`, o manual (**Actions → Deploy frontend → Run workflow**). Necesita secretos abajo. |
| **Trigger Render API deploy** | Solo manual: hace POST al Deploy Hook de Render si configuraste `RENDER_DEPLOY_HOOK_URL`. Útil si la API en Render **no** está en auto-deploy desde GitHub. |

### Secretos en GitHub (Settings → Secrets and variables → Actions)

| Nombre | Dónde obtenerlo |
|--------|------------------|
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens → Create |
| `VERCEL_ORG_ID` | Tras `cd frontend && npx vercel link`, en `.vercel/project.json` → `orgId`, o Project Settings → General |
| `VERCEL_PROJECT_ID` | Mismo `project.json` → `projectId` |
| `VITE_API_ORIGIN` | URL pública de la API en Render, **sin** `/` final, ej. `https://transport-pro-api-xxxx.onrender.com` |
| `RENDER_DEPLOY_HOOK_URL` | (Opcional) Render → Web Service → Deploy Hook → copiar URL |

Si todavía no cargaste los secretos de Vercel, el workflow **Deploy frontend** fallará hasta que los agregues (CI igual corre).

## Seed / datos demo

Solo en entorno controlado, desde tu máquina con `DATABASE_URL` apuntando a Neon:

```bash
cd backend
npx prisma migrate deploy
npm run db:seed
```

En producción piloto, preferible crear empresa y usuarios desde el flujo de registro o consola owner.

## Limitaciones del tier gratis

- **Cold start** en Render tras inactividad.
- **Uploads** (comprobantes) en disco del contenedor pueden perderse al redeploy; para piloto serio conviene storage objeto (S3/R2) después.
- Revisar cuotas de Neon/Vercel/Render.

## Comprobación rápida

- Abrir la URL de Vercel → login.
- Si la sesión no persiste: revisar `CROSS_ORIGIN_COOKIES=true`, HTTPS en ambos lados, y que `CORS_ORIGINS` sea exactamente el origen del navegador (sin `/` final extra en la lista).
