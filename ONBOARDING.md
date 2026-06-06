# Saniro ERP — Developer Onboarding

> Read this top to bottom. Every step is required. Skipping any step will cause failures that are hard to diagnose.

---

## 1. Required Tool Versions

These versions are enforced by the project. The wrong version will be rejected automatically.

| Tool | Exact Version | Why it matters |
|---|---|---|
| **Node.js** | **24.13.0** | Pinned in `.nvmrc` and `engines` field. Mismatches break native module builds. |
| **pnpm** | **9.12.0** | Lockfile format is version-bound. Wrong pnpm version corrupts `pnpm-lock.yaml`. |
| **Docker Desktop** | latest stable | Runs Postgres. Any recent version works. |
| **Git** | latest stable | No version constraint. |

> **`.npmrc` has `engine-strict=true`** — if your Node or pnpm version is outside the allowed range, `pnpm install` will refuse to run with a clear error message.

---

## 2. Install Node.js — Exact Version

Use a version manager so you can switch Node versions per project without breaking other projects on your machine.

### Option A — nvm (Mac / Linux / WSL)

```bash
# Install nvm if you don't have it
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Restart your terminal, then:
nvm install 24.13.0
nvm use 24.13.0

# Verify
node --version   # must print v24.13.0
```

> The repo has a `.nvmrc` file. Running `nvm use` inside the project directory will automatically select `24.13.0`.

### Option B — fnm (Windows / Mac / Linux — faster than nvm)

```bash
# Install fnm — follow https://github.com/Schniz/fnm#installation
fnm install 24.13.0
fnm use 24.13.0

# Verify
node --version   # must print v24.13.0
```

### Option C — Direct installer (Windows, no version manager)

Download the **v24.13.0 LTS** installer from https://nodejs.org/dist/v24.13.0/ and install it.
You will need to manually switch Node versions if you work on other projects.

---

## 3. Install pnpm — Exact Version

```bash
npm install -g pnpm@9.12.0

# Verify
pnpm --version   # must print 9.12.0
```

> Do not use `npm install -g pnpm` without the version — it installs latest which may break the lockfile.

---

## 4. Install Docker Desktop

Download and install Docker Desktop from https://www.docker.com/products/docker-desktop.

After install, open Docker Desktop and make sure the Docker engine is running (whale icon in system tray / menu bar).

```bash
# Verify
docker --version        # any recent version is fine
docker compose version  # must show 'Docker Compose version v2.x.x'
```

---

## 5. Clone and Install Dependencies

```bash
git clone <repo-url>
cd saniro-erp

# Install all workspace dependencies using the exact lockfile
pnpm install --frozen-lockfile
```

`--frozen-lockfile` ensures every developer installs exactly the same package versions as recorded in `pnpm-lock.yaml`. Never run bare `pnpm install` on a cloned repo — it may upgrade packages and alter the lockfile.

---

## 6. Set Up Environment Variables

```bash
# Root env — backend reads this
cp .env.example .env
```

Open `.env` and fill in the required values. The minimum needed to start locally:

```bash
DATABASE_URL=postgresql://erp:admin@localhost:5433/erp_db
JWT_SECRET=any-long-random-string-for-dev
JWT_REFRESH_SECRET=another-long-random-string-for-dev
NODE_ENV=development
API_PORT=3000
FRONTEND_URL=http://localhost:5173
```

Everything else in `.env.example` has safe defaults for local development.

> **Never commit `.env`** — it is in `.gitignore`. Only `.env.example` is committed.

---

## 7. Start the Database

```bash
docker compose up -d
```

This starts a PostgreSQL 16 container:
- **Host:** `localhost`
- **Port:** `5433` (not the default 5432 — intentional to avoid conflicts)
- **User:** `erp`
- **Password:** `admin`
- **Database:** `erp_db`

Verify it is running:

```bash
docker compose ps
# postgres container should show status "Up"
```

---

## 8. Run Migrations and Seed Data

```bash
# Apply all database migrations
pnpm db:migrate

# Insert dev seed data (safe to re-run — idempotent)
pnpm db:seed
```

Migrations live in [apps/api/src/database/migrations/](apps/api/src/database/migrations/).  
**Never** set `synchronize: true` in TypeORM config — all schema changes go through migrations only.

---

## 9. Start the Project

```bash
pnpm dev
```

This starts both apps in parallel via Turborepo:

| App | URL |
|---|---|
| API (NestJS) | http://localhost:3000 |
| Web (React + Vite) | http://localhost:5173 |
| API health check | http://localhost:3000/health |

To start one app individually:

```bash
pnpm --filter api dev   # backend only
pnpm --filter web dev   # frontend only
```

---

## 10. Verify Everything Works

```bash
# 1. Health check
curl http://localhost:3000/health
# expected: { "data": { "status": "ok" } }

# 2. Try login (seed creates a default SUPER_ADMIN user)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
# expected: { "data": { "accessToken": "...", "refreshToken": "..." } }
```

---

## 11. Project Structure at a Glance

```
erp/
├── apps/
│   ├── api/          # NestJS — TypeORM, JWT, Passport, Zod
│   └── web/          # React 19 + Vite
├── packages/
│   ├── shared/       # Enums, Zod schemas, TS types — imported by both apps
│   └── offline-queue/# IndexedDB browser queue for offline events
├── .nvmrc            # Node version pin (24.13.0)
├── .npmrc            # engine-strict=true — enforces engine versions
├── plan.md           # Architecture source of truth — read this
└── ONBOARDING.md     # This file
```

---

## 12. Technology Reference

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
| Prettier | ^3.4.2 | Formatting |
| ESLint | ^9.18.0 | Linting |

### Frontend (`apps/web`)

| Library | Version | Role |
|---|---|---|
| React | ^19.2.6 | UI framework |
| Vite | ^8.0.12 | Dev server + bundler |
| TypeScript | ~6.0.2 | Language |

> The frontend is in early scaffolding. Libraries from `plan.md §13` (TanStack Suite, Zustand, shadcn/ui, Tailwind, etc.) are planned and will be added per module. Check `apps/web/package.json` before assuming a library is installed.

### Planned backend additions (not yet installed)

Per `plan.md §9.4` — these will be added as development progresses:

| Library | Role |
|---|---|
| `@nestjs/event-emitter` | Audit log async events |
| `@nestjs/schedule` | Cron jobs (stock alerts) |
| `@nestjs/cache-manager` | In-memory permission + price list cache |
| `pg-boss` | Postgres-backed background job queue |
| `pino` | Structured JSON logging |
| `puppeteer` | Server-side PDF generation |

---

## 13. Rules Every Developer Must Know

Read the full list in `plan.md §14`. The most critical ones:

1. **No `synchronize: true`** in TypeORM — schema changes through migrations only.
2. **Never throw raw strings** — always use `ERR.*` from [apps/api/src/common/errors.ts](apps/api/src/common/errors.ts).
3. **All money is stored as integers (cents)** — `4500` = LKR 45.00. Divide by 100 only in `format.ts`.
4. **No Redis** — pg-boss runs in Postgres; caching is in-memory.
5. **Branch scope is enforced server-side** — never trust `branchId` from a request body.
6. **`common/` never imports from `modules/`**.
7. **`LedgerService` is the only writer to `LEDGER_ENTRY`** — entries are append-only.
8. **Offline payments are always blocked** — client-side and server-side.
9. **Every mutating request must send the current `version`** — optimistic locking is mandatory.
10. **No `console.log` in the API** — use Pino (once installed).

---

## 14. Common Issues

| Problem | Cause | Fix |
|---|---|---|
| `pnpm install` fails with engine error | Wrong Node or pnpm version | Re-read §2 and §3 |
| `pnpm install` alters `pnpm-lock.yaml` | Ran without `--frozen-lockfile` | `git checkout pnpm-lock.yaml` then `pnpm install --frozen-lockfile` |
| DB connection refused | Docker not running or wrong port | Run `docker compose up -d`, use port **5433** |
| Migration fails | DB not started or wrong `DATABASE_URL` | Check `.env` and that Docker is up |
| `nest start` fails on missing env vars | Zod validation rejects config at boot | Fill all required keys in `.env` (see §6) |
| Port 3000 or 5173 already in use | Another process running | `lsof -i :3000` (Mac/Linux) or Task Manager (Windows) to kill it |