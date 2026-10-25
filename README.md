# Saniro ERP

A production-grade ERP system for a fabrication workshop. Built as a pnpm monorepo with a NestJS API and a React 19 frontend.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Repository Structure](#repository-structure)
4. [Step 1 — Clone and Install](#step-1--clone-and-install)
5. [Step 2 — Environment Variables](#step-2--environment-variables)
6. [Step 3 — Start the Database](#step-3--start-the-database)
7. [Step 4 — Run Migrations and Seed](#step-4--run-migrations-and-seed)
8. [Step 5 — Start Development Servers](#step-5--start-development-servers)
9. [Project Documentation](#project-documentation)
10. [Useful Commands](#useful-commands)
11. [Key Decisions](#key-decisions)
12. [Technology Reference](#technology-reference)
13. [Development Rules](#development-rules)
14. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Backend | NestJS + TypeORM + PostgreSQL 16 |
| Frontend | React 19 + Vite 8 + TanStack Query + TanStack Router + TailwindCSS |
| Auth | JWT Bearer tokens only (no cookies) |
| Real-time | SSE (Server-Sent Events, in-process) |
| Background jobs | pg-boss (runs inside Postgres — no Redis) |
| Offline support | IndexedDB + `packages/offline-queue` |
| Shared contracts | `packages/shared` — enums, Zod schemas, state machines, error codes |

---

## Prerequisites

Install these before anything else. Node and pnpm versions are **enforced** — `.npmrc` sets `engine-strict=true`, so `pnpm install` refuses to run on a mismatched version.

| Tool | Version | Why it matters | Install |
|---|---|---|---|
| Node.js | **24.13.0** (pinned in `.nvmrc`; `engines` allows `>=24 <25`) | Mismatches break native module builds | https://nodejs.org/dist/v24.13.0/ |
| pnpm | **9.12.0** (`packageManager` field) | Lockfile format is version-bound | `npm install -g pnpm@9.12.0` |
| Docker Desktop | latest stable | Runs the PostgreSQL 16 container | https://www.docker.com/products/docker-desktop |

> Using a Node version manager (nvm / fnm)? Run `nvm use` (or `fnm use`) inside the repo — the `.nvmrc` file selects `24.13.0` automatically.

Confirm your setup:

```bash
node -v    # must be v24.x (v24.13.0 recommended)
pnpm -v    # must be 9.12.0
docker -v
docker compose version   # must show v2.x.x
```

---

## Repository Structure

```
saniro-erp/
├── apps/
│   ├── api/          # NestJS backend (port 3000)
│   └── web/          # React 19 + Vite frontend (port 5173)
├── packages/
│   ├── shared/       # Enums, Zod schemas, state machines, error codes, types
│   └── offline-queue/# Browser offline queue backed by IndexedDB
├── scripts/          # DB seed, migration helpers, env-check scripts
├── Docs/             # Architecture and design documentation (see below)
├── Instructions/     # Step-by-step build instructions for each feature phase
├── docker-compose.yml# PostgreSQL 16 only
├── .env.example      # All environment variables with descriptions — committed
├── .env              # Your local secrets — NOT committed (create from .env.example)
├── SEED_CREDENTIALS.md # Dev test-user login credentials
├── turbo.json        # Turborepo pipeline config
└── pnpm-workspace.yaml
```

---

## Step 1 — Clone and Install

```bash
git clone <repo-url>
cd saniro-erp
pnpm install --frozen-lockfile
```

This installs dependencies for all workspaces (`apps/api`, `apps/web`, `packages/shared`, `packages/offline-queue`) in one command. `--frozen-lockfile` guarantees you get exactly the versions recorded in `pnpm-lock.yaml` and never mutates it — always use it on a fresh clone. If you ever run a bare `pnpm install` and it alters the lockfile, run `git checkout pnpm-lock.yaml` then reinstall with `--frozen-lockfile`.

> **Docs:** See [Docs/monorepo-structure.md](Docs/monorepo-structure.md) for how workspaces, Turborepo, and the root scripts are wired together.

---

## Step 2 — Environment Variables

The `.env` file is **gitignored** — you must create it yourself before running anything.

```bash
# Windows PowerShell
Copy-Item .env.example .env

# Mac / Linux
cp .env.example .env
```

Open `.env` and update the values. The defaults in `.env.example` match the Docker Compose database exactly, so the only values you **must** change for local development are the JWT secrets:

```env
JWT_SECRET=any-long-random-string-here
JWT_REFRESH_SECRET=a-different-long-random-string
```

Everything else works out of the box with the Docker database.

**Full variable reference is in `.env.example`** — every variable is documented there. Key groups:

| Group | Variables | Note |
|---|---|---|
| Database | `DATABASE_URL`, pool settings | Defaults match Docker Compose |
| JWT | `JWT_SECRET`, `JWT_REFRESH_SECRET`, expiry | Must set before first run |
| App | `NODE_ENV`, `API_PORT`, `FRONTEND_URL` | Defaults work locally |
| Storage | `STORAGE_PROVIDER`, `STORAGE_BUCKET` | Use `local` for development |
| Notifications | `NOTIFICATION_CHANNEL` | Set to `log` for development |
| PDF | `PDF_CHROMIUM_PATH` | Leave blank unless generating PDFs locally |

---

## Step 3 — Start the Database

The project uses **PostgreSQL 16** running in Docker on port **5433** (not the default 5432, to avoid conflicts with any local Postgres install).

```bash
docker compose up -d
```

Verify it is running:

```bash
docker compose ps
```

You should see `erp-postgres` in state `Up`.

To stop the database without losing data:

```bash
docker compose down
```

To wipe the database volume and start fresh:

```bash
docker compose down -v
```

> **Connection details** (matches `.env.example` defaults):
> - Host: `localhost`
> - Port: `5433`
> - Database: `erp_db`
> - User: `erp`
> - Password: `admin`

---

## Step 4 — Run Migrations and Seed

`apps/api` imports enums/schemas/types from `@erp/shared`, a compiled workspace package. It must be built once before migrations (or anything else in `apps/api`) can resolve it — otherwise you'll hit `Cannot find module '@erp/shared'`.

```bash
# Build the shared package first (only needed once, or after pulling changes to packages/shared)
pnpm --filter @erp/shared build
```

Run pending database migrations:

```bash
pnpm db:migrate
```

Seed the database with test users and reference data:

```bash
pnpm db:seed
```

The seed is idempotent — you can run it multiple times without creating duplicates.

Seeded branches: **Naiwala** (Roofing, ★ main branch), **Veyangoda** (Workshop), **Thangalla** (Roofing + Workshop).

| Username | Password | Role |
|---|---|---|
| `superadmin` | `Super@123` | SUPER_ADMIN (head office, all branches) |
| `admin` | `Admin@123` | ADMIN (head office, all branches; view-only on branch work) |
| `auditor1` | `Auditor@123` | AUDITOR (head office, read-only) |
| `<role>_<branch>` | `Dev@1234` | One MANAGER, SUPERVISOR, CHIEF and CASHIER per branch, e.g. `manager_naiwala`, `supervisor_naiwala`, `cashier_thangalla` |

Head office vs branch rules: `Docs/decisions/0002-global-scope-and-main-branch.md`.

In dev, the login page has a **Quick login** box: pick a branch and a role and sign in.

> **Note:** TypeORM `synchronize` is **disabled**. The database schema never auto-updates. Always generate and run an explicit migration when you change an entity.

---

## Step 5 — Start Development Servers

Start both the API and the frontend together using Turborepo:

```bash
pnpm dev
```

| Service | URL |
|---|---|
| API | http://localhost:3000 |
| API health check | http://localhost:3000/health |
| Frontend | http://localhost:5173 |

Or run them individually:

```bash
# API only
pnpm --filter api dev

# Frontend only
pnpm --filter web dev
```

---

## Project Documentation

All architecture docs live in [Docs/](Docs/). Read them in this order:

| Document | When to read |
|---|---|
| [Docs/monorepo-structure.md](Docs/monorepo-structure.md) | After cloning — explains root configs, pnpm workspaces, turbo pipeline, docker-compose, scripts folder, and packages/shared layout |
| [Docs/backend-structure.md](Docs/backend-structure.md) | Before touching `apps/api` — NestJS entry point, global guards/filters/interceptors, module pattern (controller → service → repository), database migrations |
| [Docs/frontend-structure.md](Docs/frontend-structure.md) | Before touching `apps/web` — React entry point, global providers, router, module pattern (api.ts + query-keys.ts + components/ + hooks/), SSE real-time, offline sync |
| [Docs/Saniro-workshop-PRD.md](Docs/Saniro-workshop-PRD.md) | For domain context — product requirements, role permissions matrix, business rules (BR01–BR26), work order types, pricing models |

**Build instructions** for each feature phase are in [Instructions/](Instructions/):

| File | Phase |
|---|---|
| [Instructions/instructions1.md](Instructions/instructions1.md) | Step 1 — Monorepo scaffold, health endpoints, TypeORM setup, env validation |
| [Instructions/instructions2.md](Instructions/instructions2.md) | Step 2 — Auth module (JWT Bearer, login/refresh/logout/getMe, guards, decorators, seeding) |

---

## Useful Commands

```bash
# Install all workspace dependencies
pnpm install

# Start all dev servers (API + frontend)
pnpm dev

# Build all workspaces
pnpm build

# Run all tests
pnpm test

# Database
pnpm db:migrate          # Apply pending migrations
pnpm db:seed             # Seed test data

# Database (Docker)
docker compose up -d     # Start Postgres
docker compose down      # Stop Postgres
docker compose down -v   # Stop and delete all data

# Generate a new migration (run from apps/api)
pnpm --filter api migration:generate -- src/database/migrations/MigrationName

# Run migrations (alias for pnpm db:migrate)
pnpm --filter api migration:run

# Revert last migration
pnpm --filter api migration:revert
```

---

## Key Decisions

These are load-bearing decisions that affect the whole codebase — understand them before making architectural changes.

**No cookies.** Both access and refresh tokens travel in the `Authorization: Bearer <token>` header. There are no HTTP-only cookies anywhere.

**One database.** PostgreSQL 16 only. Background jobs run inside Postgres via pg-boss. Real-time is SSE in-process. There is no Redis or separate message broker.

**No TypeORM synchronize.** `synchronize: false` is enforced. All schema changes require an explicit migration file.

**Shared package is the contract.** `packages/shared` owns all enums, Zod schemas, state machines, and error codes. Frontend and backend both import from it — never duplicate definitions.

**Error codes are stable.** Frontend code switches on `error.code` (the string constant). Backend can change `error.message` for UX without breaking anything. Never rename an error code once published.

**Branch isolation.** Data from Branch A is invisible to Branch B unless the user is MANAGER or SUPER_ADMIN. This is enforced at the service layer, not just the controller.

**Financial atomicity.** Payment recording and ledger writes happen in a single database transaction. Stock deductions are also atomic. Never write financial data outside a transaction.

---

## Technology Reference

### Backend (`apps/api`)

| Library | Version | Role |
|---|---|---|
| NestJS | ^11.0.1 | HTTP framework |
| TypeORM | ^1.0.0 | ORM — migrations only |
| PostgreSQL driver (`pg`) | ^8.21.0 | DB connection |
| `@nestjs/jwt` | ^11.0.2 | JWT token generation |
| `@nestjs/passport` + `passport-jwt` | ^11.0.5 / ^4.0.1 | Auth strategies |
| `@nestjs/throttler` | ^6.5.0 | Rate limiting |
| `@nestjs/config` | ^4.0.4 | Env config |
| Zod | ^4.4.3 | Runtime validation at API boundary |
| bcrypt | ^6.0.0 | Password hashing |
| rxjs | ^7.8.1 | Observables / SSE |
| TypeScript | ^5.7.3 | Language |
| Jest | ^30.0.0 | Tests |

### Frontend (`apps/web`)

| Library | Version | Role |
|---|---|---|
| React | ^19.2.6 | UI framework |
| Vite | ^8.0.12 | Dev server + bundler |
| TanStack Query / Router / Table / Virtual | ^5 / ^1 / ^8 / ^3 | Data fetching, routing, tables, virtualization |
| Zustand | ^5.0.14 | Client state |
| React Hook Form + Zod | ^7.79.0 / ^4.4.3 | Forms + validation |
| `@casl/ability` + `@casl/react` | ^7.0.0 | Client-side permissions |
| TailwindCSS | ^4.3.1 | Styling |
| axios | ^1.17.0 | HTTP client |
| TypeScript | ~6.0.2 | Language |

### Planned backend additions (not yet installed)

Added as development progresses (see `plan.md §9.4`):

| Library | Role |
|---|---|
| `@nestjs/event-emitter` | Audit log async events |
| `@nestjs/schedule` | Cron jobs (stock alerts) |
| `@nestjs/cache-manager` | In-memory permission + price list cache |
| `pg-boss` | Postgres-backed background job queue |
| `pino` | Structured JSON logging |
| `puppeteer` | Server-side PDF generation |

---

## Development Rules

The most critical rules — read the full list in `plan.md §14`.

1. **No `synchronize: true`** in TypeORM — schema changes go through migrations only.
2. **Never throw raw strings** — always use `ERR.*` from [apps/api/src/common/errors.ts](apps/api/src/common/errors.ts).
3. **All money is stored as integers (cents)** — `4500` = LKR 45.00. Divide by 100 only in `format.ts`.
4. **No Redis** — pg-boss runs in Postgres; caching is in-memory.
5. **Branch scope is enforced server-side** — never trust `branchId` from a request body.
6. **`common/` never imports from `modules/`.**
7. **`LedgerService` is the only writer to `LEDGER_ENTRY`** — entries are append-only.
8. **Offline payments are always blocked** — client-side and server-side.
9. **Every mutating request must send the current `version`** — optimistic locking is mandatory.
10. **No `console.log` in the API** — use Pino (once installed).

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `pnpm install` fails with engine error | Wrong Node or pnpm version | Match the pinned versions in [Prerequisites](#prerequisites) |
| `pnpm install` alters `pnpm-lock.yaml` | Ran without `--frozen-lockfile` | `git checkout pnpm-lock.yaml` then `pnpm install --frozen-lockfile` |
| DB connection refused | Docker not running or wrong port | Run `docker compose up -d`; use port **5433** |
| Migration fails | DB not started or wrong `DATABASE_URL` | Check `.env` and that Docker is up |
| `Cannot find module '@erp/shared'` | `packages/shared` was never built | Run `pnpm --filter @erp/shared build` (see [Step 4](#step-4--run-migrations-and-seed)) |
| `nest start` fails on missing env vars | Zod rejects config at boot | Fill all required keys in `.env` (see [Step 2](#step-2--environment-variables)) |
| Port 3000 or 5173 already in use | Another process running | `lsof -i :3000` (Mac/Linux) or Task Manager (Windows) to kill it |
