# Transport Pro — Stack local completo

Monorepo: **PostgreSQL** + **Node.js (Express, Prisma)** + **React (Vite, Tailwind CSS)**. Incluye RBAC por rol, consola de plataforma (SuperAdmin / Owner), multi-tenant y módulos operativos (envíos, flota, facturación, pagos, etc.) según `SPEC.md`.

## Arquitectura

| Capa        | Tecnología |
|------------|------------|
| Frontend   | React 19, Vite 6, Tailwind 4, React Router, TanStack Query |
| Backend    | Node 22, Express 4, Zod, JWT, Prisma ORM |
| Base datos | PostgreSQL 16 |
| Tests API  | Jest 29 + ts-jest (ESM) |
| Contenedores | Docker Compose (Postgres + API + Nginx) |

## Roles de usuario

| Rol en UI / negocio | Implementación | Acceso |
|---------------------|----------------|--------|
| **Admin** | `Role.admin` en JWT | Panel `/admin/*`, gestión de la empresa (tenant) |
| **Cliente** | `Role.cliente` | Portal `/cliente/*` |
| **Chofer** | `Role.conductor` | App conductor `/conductor` |
| **SuperAdmin** (plataforma) | Consola **Owner** con clave `OWNER_API_KEY` (no es un `Role` en BD) | Ruta `/owner` + header `x-owner-key`; API `/api/owner/*` |

Los valores `admin | cliente | conductor` están definidos en `backend/prisma/schema.prisma` (`enum Role`).

## Requisitos (desarrollo sin Docker)

- Node.js **20+** (recomendado 22)
- PostgreSQL **16+**
- npm

## Opción A — Desarrollo en tu máquina

### 1. Base de datos

```sql
CREATE DATABASE transport_pro;
```

O levantá solo Postgres con Docker:

```bash
docker compose up -d postgres
```

### 2. Variables de entorno (API)

Copiá `backend/.env.example` a `backend/.env` y ajustá al menos:

```env
DATABASE_URL="postgresql://usuario:clave@localhost:5432/transport_pro?schema=public"
JWT_SECRET="mínimo-32-caracteres-en-producción"
OWNER_API_KEY="mínimo-32-caracteres-en-producción"
PORT=4000
FRONTEND_URL="http://localhost:5173"
CORS_ORIGINS="http://localhost:5173"
```

### 3. Migraciones y seed

```bash
cd backend
npm install
npx prisma migrate deploy
npm run db:seed
```

### 4. Ejecutar API y web

Desde la raíz del repo:

```bash
npm install
npm run dev
```

- **Web:** http://localhost:5173  
- **API:** http://localhost:4000  
- Prefijo REST: **`/api/v1`** (el proxy de Vite reenvía `/api` al backend)

### 5. Pruebas unitarias (Jest)

```bash
cd backend
npm test
```

## Opción B — Todo con Docker Compose

Levanta **PostgreSQL + API + frontend (Nginx con proxy a la API)**.

```bash
docker compose up --build
```

| Servicio | URL |
|----------|-----|
| Aplicación web | http://localhost:8080 |
| API (directo, opcional) | http://localhost:4000 |
| Postgres | `localhost:5432` (usuario `transport`, clave `transport`, BD `transport_pro`) |

Variables útiles en compose (ya definidas en `docker-compose.yml`): `DATABASE_URL`, `JWT_SECRET`, `OWNER_API_KEY`, `FRONTEND_URL`, `CORS_ORIGINS`.

**Primera vez — datos demo:**

```bash
docker compose exec api npx prisma db seed
```

La API ejecuta `prisma migrate deploy` al iniciar el contenedor.

**SuperAdmin local (Docker):** abrí http://localhost:8080/owner e ingresá la clave configurada en `OWNER_API_KEY` del servicio `api` (por defecto en compose: `docker-local-owner-api-key-32-chars-min`).

## Credenciales demo (tras `db:seed`)

| Rol       | Email                 | Contraseña      |
|-----------|----------------------|-----------------|
| Admin     | `admin@demo.com`     | `Admin123!`     |
| Cliente   | `cliente@demo.com`   | `Cliente123!`   |
| Conductor | `conductor@demo.com` | `Conductor123!` |

También podés registrar una empresa nueva en `/registro`.

## Estructura del repositorio

```
backend/          # Express + Prisma + Jest
  prisma/         # schema, migraciones, seed
  src/            # rutas, servicios, middleware
  tests/          # *.test.ts (Jest)
  Dockerfile
frontend/         # Vite + React + Tailwind
  Dockerfile
  nginx.conf      # proxy /api → API (solo imagen Docker)
docker-compose.yml
```

## Scripts útiles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` (raíz) | API + Vite en paralelo |
| `cd backend && npm test` | Jest |
| `cd backend && npm run db:migrate` | Migraciones desarrollo |
| `cd backend && npm run db:seed` | Seed Prisma |
| `docker compose up --build` | Stack completo |

Piloto online (Neon + Render + Vercel) y **GitHub Actions** (CI + deploy frontend): [`docs/DEPLOY_FREE_STACK.md`](docs/DEPLOY_FREE_STACK.md).

## Notas

- En producción, `JWT_SECRET` y `OWNER_API_KEY` deben tener al menos **32 caracteres** y no usar valores de demo (`backend/src/config.ts`).
- Mercado Pago y correo (Resend) son opcionales; ver `backend/.env.example`.
- Documentación de producto y revisiones: `SPEC.md`, `docs/`.
