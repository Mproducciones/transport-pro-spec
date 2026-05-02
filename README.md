# 🚛 Transport Pro Spec

> **Multi-tenant Transportation Management System** with real-time tracking, role-based access control, and comprehensive fleet management.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![React](https://img.shields.io/badge/react-19.0.0-blue)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.0-blue)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/postgresql-16+-blue)](https://www.postgresql.org/)

A comprehensive transportation management platform built with modern web technologies. Features multi-tenant architecture, real-time shipment tracking, driver management, customer portals, and complete billing systems.

## ✨ Key Features

- 🏢 **Multi-tenant Architecture** - Complete data isolation per company
- 👥 **Role-Based Access Control** - Admin, Customer, Driver roles
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile
- 🚛 **Fleet Management** - Driver and vehicle tracking
- 📦 **Shipment Tracking** - Real-time order monitoring
- 💰 **Billing System** - Invoices, payments, and settlements
- 🗺️ **Route Management** - Optimized delivery routes
- 📊 **Analytics Dashboard** - KPIs and business insights
- 🔐 **JWT Authentication** - Secure user management
- 🌐 **Modern Tech Stack** - React, Node.js, PostgreSQL, Prisma

## 🏗️ Architecture

| Layer      | Technology |
|------------|------------|
| Frontend   | React 19, Vite 6, Tailwind 4, React Router, TanStack Query |
| Backend    | Node 22, Express 4, Zod, JWT, Prisma ORM |
| Database   | PostgreSQL 16 |
| Testing    | Jest 29 + ts-jest (ESM) |
| Deployment | Docker Compose, Vercel, Railway |

## 🚀 Quick Start

### 🎯 Try the Demo

**Live Demo:** [Coming Soon]  
**Admin Panel:** [Coming Soon]  
**Customer Portal:** [Coming Soon]

### 📱 Screenshots

*Add screenshots of your application here*

```bash
# Clone the repository
git clone https://github.com/bryan-dev/transport-pro-spec.git
cd transport-pro-spec

# Install dependencies
npm install

# Setup environment variables
cp backend/.env.example backend/.env

# Start development servers
npm run dev
```

**Access URLs:**
- 🌐 **Frontend:** http://localhost:5173
- 🛠️ **Admin Panel:** http://localhost:5173/admin
- 👥 **Customer Portal:** http://localhost:5173/cliente
- 🚛 **Driver App:** http://localhost:5173/conductor
- 📡 **API:** http://localhost:4000

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

## 🔐 Demo Credentials

After running the database seed, use these credentials to explore the system:

| Role       | Email                 | Password        | Access URL |
|-----------|----------------------|-----------------|-----------|
| 🛠️ **Admin**     | `admin@demo.com`     | `Admin123!`     | `/admin` |
| 👥 **Customer**   | `cliente@demo.com`   | `Cliente123!`   | `/cliente` |
| 🚛 **Driver**     | `conductor@demo.com` | `Conductor123!` | `/conductor` |

### 🎯 Quick Database Setup

```bash
# Reset and populate database with demo data
cd backend
node simple-test-orders.cjs

# Or use the complete orders system
node create-complete-orders.cjs
```

## 📁 Project Structure

```
transport-pro-spec/
├── 📂 backend/                 # Node.js API + Prisma
│   ├── 📂 src/                 # Source code
│   ├── 📂 prisma/              # Database schema & migrations
│   ├── 📂 tests/               # API tests
│   └── 📄 package.json
├── 📂 frontend/                # React + TypeScript
│   ├── 📂 src/                 # React components
│   ├── 📂 public/              # Static assets
│   └── 📄 package.json
├── 📂 scripts/                 # Utility scripts
├── 📄 docker-compose.yml       # Docker configuration
├── 📄 README.md                # This file
└── 📄 SPEC.md                  # Project specifications
```

## 🛠️ Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start API + Frontend in parallel |
| `cd backend && npm test` | Run Jest tests |
| `cd backend && npm run db:migrate` | Run database migrations |
| `cd backend && npm run db:seed` | Populate database with demo data |
| `docker compose up --build` | Start full stack with Docker |

## 🐳 Docker Deployment

Complete stack with PostgreSQL, API, and Nginx:

```bash
docker compose up --build
```

**Services:**
- 🌐 **Web App:** http://localhost:8080
- 📡 **API:** http://localhost:4000
- 🗄️ **PostgreSQL:** localhost:5432

## 🚀 Production Deployment

### Free Stack Options:
- **Database:** [Neon](https://neon.tech/) (PostgreSQL)
- **Backend:** [Railway](https://railway.app/) (Node.js)
- **Frontend:** [Vercel](https://vercel.com/) (React)
- **CI/CD:** GitHub Actions

See [`docs/DEPLOY_FREE_STACK.md`](docs/DEPLOY_FREE_STACK.md) for detailed deployment guide.

## ⚙️ Configuration

**Environment Variables** (backend/.env):

```env
DATABASE_URL="postgresql://user:pass@localhost:5432/transport_pro"
JWT_SECRET="minimum-32-characters-in-production"
OWNER_API_KEY="minimum-32-characters-in-production"
PORT=4000
FRONTEND_URL="http://localhost:5173"
CORS_ORIGINS="http://localhost:5173"
```

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📞 Support

- 📧 **Email:** support@transport-pro.com
- 📖 **Documentation:** Check `SPEC.md` and `docs/` folder
- 🐛 **Issues:** [GitHub Issues](https://github.com/bryan-dev/transport-pro-spec/issues)

---

**Built with ❤️ for the transportation industry** 🚛✨
