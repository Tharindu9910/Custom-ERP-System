# Monorepo Structure — Plain English Guide

> This guide covers everything in the monorepo **except** `apps/web/src/` and `apps/api/src/` — those are explained in the separate frontend and backend guides. This covers the root config files, the two shared packages, and the scripts folder.

---

## What Is a Monorepo?

Instead of having three separate repositories (one for the frontend, one for the backend, one for shared code), everything lives in one folder. This is called a monorepo.

The benefit is that when you change a shared type, both the frontend and backend see the change immediately — no "publish a package and update the version number" dance.

```
erp/
├── apps/
│   ├── web/             ← the React frontend
│   └── api/             ← the NestJS backend
├── packages/
│   ├── shared/          ← types and code both apps share
│   └── offline-queue/   ← browser queue code
├── scripts/             ← helper scripts
└── [config files]       ← root configuration
```

> Run `pnpm dev` from the root and both the API (port 3000) and the web app (port 5173) start together.

---

## Root Config Files — The Project's Global Settings

### `pnpm-workspace.yaml`

Tells pnpm where all the packages in this monorepo live. pnpm is the package manager for this project (like npm or yarn, but faster and better for monorepos). This file tells pnpm: "everything inside `apps/*` and `packages/*` is a separate package."

Once pnpm knows this, you can run commands from the root that target individual packages — like `pnpm --filter web dev` to start only the frontend. It also makes imports like `import { ERR } from '@erp/shared'` work — pnpm links the shared package into both apps automatically.

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

---

### `turbo.json`

Makes running multiple apps at once fast and smart. Turborepo is a build system for monorepos. Without it, running `pnpm dev` at the root would start things in a random order. Turbo knows the dependency order — it builds the shared package first, then starts the API and web app in parallel.

It also caches build results. If you haven't changed the shared package, Turbo skips rebuilding it. This makes CI pipelines significantly faster.

```
What turbo.json defines:
- "build" task: build shared first, then apps
- "dev" task: start api and web in parallel
- "test" task: run tests across all packages
- Which task outputs to cache
```

---

### `docker-compose.yml`

Starts the database with one command — nothing else. Docker Compose lets you start services locally without installing them manually. This file starts **only PostgreSQL 16** — that's it. No Redis, no message brokers, no extra services.

Why? The project is deliberately designed to avoid extra infrastructure. Background jobs use pg-boss (runs inside Postgres). Real-time updates use SSE (runs in-process). Caching is in-memory. Everything fits in one database.

```bash
docker compose up -d    # starts Postgres in the background
docker compose down     # stops it
```

> New developer joining the team: clone the repo, run `docker compose up -d`, then `pnpm dev`. That's the entire local setup.

---

### `PLAN.md`

The master project plan — the single source of truth for all decisions. This document contains the architecture decisions, business rules, module patterns, state machines, financial ledger design, database rules, and development phases.

When you're unsure why something was built a certain way, the answer is usually in here. The hierarchy is: ER diagram → PRD v4 → this plan.

> Read this before making any architectural change. Many decisions that look odd have a specific reason documented here.

---

## Environment Files — Configuration That Changes Between Environments

### `.env.example` — committed to git ✓

The documented list of every environment variable the project needs. This file lists every environment variable the project uses, with example values and comments explaining what each one does. It's committed to version control so every developer knows exactly what they need to configure.

When you clone the repo for the first time, you copy this file to `.env` and fill in the real values for your local machine:

```bash
cp .env.example .env
# then edit .env with your actual database password, JWT secret, etc.
```

There are three `.env.example` files in total:

| File | Covers |
|---|---|
| `.env.example` (root) | Database, JWT, storage, notifications, pg-boss, rate limiting, PDF, cache |
| `apps/web/.env.example` | `VITE_*` frontend variables — API URL, feature flags, file upload limits |
| `apps/api/.env.example` | CORS origins, cookie domain and security settings |

---

### `.env` — never committed ✗

Your actual secrets — database password, JWT secret, API keys. This file contains your real credentials and is listed in `.gitignore`. It is **never committed to version control** — not even once. If it ever gets committed accidentally, rotate all the secrets immediately.

> In production, secrets go into the platform's secret manager (e.g. AWS Secrets Manager, Doppler, Railway variables) — never in a file on a server.

---

## `scripts/` — Helper Scripts for the Database and CI

### `scripts/seed.ts`

Fills the database with realistic test data for local development. When you start working locally, the database is empty. This script creates branches, users for every role, sample customers, workers, a price list, and a few job cards in various states — so you have something real to look at and test against.

It's **idempotent** — running it twice doesn't create duplicates. It checks if data already exists before inserting.

```bash
pnpm db:seed    # run from the root
```

> After pulling a big database migration, re-run the seed to make sure your local data reflects the new schema.

---

### `scripts/migrate-legacy.ts`

A one-time script to import old manual job cards into the new system. Before this ERP existed, job cards were tracked manually (paper or spreadsheets). This script reads a CSV export of those old records and imports them into the database as legacy job cards.

It only runs **once** during the initial go-live, not on an ongoing basis. Legacy job cards are flagged with `is_legacy = true` so they can be distinguished from new ones.

```
Input CSV columns:
  customer_phone, customer_name, job_type,
  material, quantity, status, outstanding_balance

Commands:
  pnpm migrate:legacy --dry-run    ← preview without writing anything
  pnpm migrate:legacy --confirm    ← actually write to the database
```

> Always run `--dry-run` first. Any row that fails validation is written to `migration-errors.csv` — nothing is silently skipped.

---

### `scripts/check-env.ts` — runs in CI

Makes sure `.env.example` is always up to date with every variable the code uses. Without this, a developer could add a new environment variable to the code but forget to document it in `.env.example`. The next developer who clones the repo has no idea the variable exists.

This script scans all the code for environment variable references and checks every one is documented in `.env.example`. If any are missing, it **fails the CI pipeline**.

```
✓ DATABASE_URL        documented
✓ JWT_SECRET          documented
✗ NEW_API_KEY         MISSING from .env.example ← build fails
```

> You never run this manually. It runs automatically on every pull request.

---

## `packages/shared/` — The Contract Between Frontend and Backend

Both `apps/api` and `apps/web` import from `@erp/shared`. If something needs to be the same on both sides — an enum, a validation rule, an error message — it lives here and nowhere else.

---

### `packages/shared/src/enums/`

Named constants used on both the frontend and backend — statuses, roles, types. An enum is a set of named values. Instead of writing the string `"DRAFT"` and hoping you don't typo it, you write `JobCardStatus.DRAFT` and TypeScript catches any mistakes at compile time.

Because these enums live in shared, the database, the API, and the React components all use the exact same values.

| File | What it defines |
|---|---|
| `role.enum.ts` | SUPER_ADMIN, ADMIN, AUDITOR, SUPERVISOR, CHIEF, CASHIER, MANAGER |
| `job-card-status.enum.ts` | DRAFT, IN_QUEUE, IN_PROGRESS, CANCELLATION_PENDING, CLOSED, VOIDED |
| `work-order-status.enum.ts` | PENDING, ASSIGNED, IN_PROGRESS, COMPLETED, CANCELLED |
| `work-order-type.enum.ts` | CUT, BEND, PIPE_BEND, BOX_BAR_BEND, FLAT_IRON, L_ANGLE, SHEET_ROLL, COIL_CUT |
| `pricing-model.enum.ts` | UNIT_BASED, WEIGHT_BASED |
| `customer-type.enum.ts` | INDIVIDUAL, BUSINESS |
| `account-type.enum.ts` | ASSET, LIABILITY, REVENUE, EXPENSE |
| `entry-type.enum.ts` | DEBIT, CREDIT |
| `payment-mode.enum.ts` | CASH, CARD, TRANSFER |
| `payment-type.enum.ts` | ADVANCE, FINAL, PARTIAL |
| `goods-issue-status.enum.ts` | PENDING, ISSUED, CONFIRMED, CANCELLED |
| `conflict-status.enum.ts` | PENDING, RESOLVED, DISMISSED |
| `index.ts` | Barrel export — import all enums from one place |

---

### `packages/shared/src/schemas/`

Validation rules written once, used in two places. A Zod schema describes the shape of a piece of data and the rules it must follow.

The same schema file does two jobs. In the backend, it runs at the API boundary — if a request doesn't match the schema, it's rejected before touching any business logic. In the frontend, React Hook Form uses it to validate the form before the user can submit.

Writing the validation once and sharing it means the frontend and backend can never get out of sync about what's valid.

| File | What it validates |
|---|---|
| `job-card.schema.ts` | Creating and updating a job card |
| `work-order.schema.ts` | Work order creation — includes the spec discriminated union (different required fields per work order type) |
| `customer.schema.ts` | Customer creation and profile completion |
| `payment.schema.ts` | Payment recording — amount, mode, type |
| `material-order.schema.ts` | Material order and its line items |
| `goods-issue.schema.ts` | Inter-branch stock transfer |
| `price-list.schema.ts` | Price list entry creation and updates |
| `worker.schema.ts` | Worker creation and update |
| `offline-event.schema.ts` | The shape of an event in the offline queue |
| `index.ts` | Barrel export |

---

### `packages/shared/src/state-machines/` ⭐

The rules for what status changes are allowed — shared so both sides agree. A state machine defines what transitions are valid. For a job card: you can go from DRAFT to IN_QUEUE, but you can't jump from DRAFT straight to CLOSED.

The backend uses `canTransition()` to validate a status change before saving it. The frontend uses the same function to decide which buttons to show — if a transition isn't allowed, the button simply doesn't appear.

```typescript
import { canTransition } from '@erp/shared/state-machines'

// Backend — before saving the new status:
if (!canTransition(current, next, actorRole)) {
  throw new BadRequestException(ERR.INVALID_STATUS_TRANSITION)
}

// Frontend — before rendering the button:
{canTransition(status, 'IN_PROGRESS', userRole) && (
  <StartWorkButton />
)}
```

Without this being shared, you'd maintain the same logic in two places and they would inevitably drift apart.

| File | What it controls |
|---|---|
| `job-card.transitions.ts` | DRAFT → IN_QUEUE → IN_PROGRESS → CLOSED / VOIDED |
| `work-order.transitions.ts` | PENDING → ASSIGNED → IN_PROGRESS → COMPLETED / CANCELLED |
| `index.ts` | Barrel export |

---

### `packages/shared/src/errors.ts` ⭐

Every error code and message in the whole system — one file, used by both apps. This is the single source of truth for all errors. It defines a stable code (like `JC_001`) and a human-readable message (like `"Job card not found"`) for every possible error in the system.

```typescript
// packages/shared/src/errors.ts
export const ERR = {
  JOB_CARD_NOT_FOUND: {
    code: 'JC_001',
    message: 'Job card not found',
  },
  WORK_ORDER_NO_WORKER: {
    code: 'WO_003',
    message: 'At least one worker must be assigned',
  },
  PAYMENT_ADVANCE_TOO_LOW: {
    code: 'PAY_002',
    message: 'Advance payment is below the required minimum',
  },
  // ... every error in the system
}

// Backend — throw with the constant:
throw new NotFoundException(ERR.JOB_CARD_NOT_FOUND)

// Frontend — handle with the stable code:
if (error.code === ERR.JOB_CARD_NOT_FOUND.code) {
  showToast('Job card not found')
}
```

> The frontend always switches on the `code` (stable, never changes), never on the `message` (can be rewritten for UX without breaking anything). Change a message in one place — both sides update.

---

### `packages/shared/src/constants/`

Fixed lists of allowed values — the dropdown options that appear in forms. These are the predefined values that both the backend validation and the frontend dropdowns use. If a value isn't in this list, the backend rejects it and the frontend doesn't show it as an option.

| File | What it contains |
|---|---|
| `work-order-materials.ts` | The full list of allowed material names (MS Plate, GI Pipe, Amano, etc.). A work order using a material not on this list is automatically flagged as Customized. |
| `thickness-options.ts` | The allowed thickness dropdown values: 6mm, 5mm, 4.5mm, 4mm, 3mm, 2.5mm, 2mm, and gauges 16, 18, 19, 20, 22, 23, 24. |
| `rolling-work-types.ts` | The allowed work type values for Rolling jobs: GI Pipe, L Bending, Rolling, Full Length, Circle Bend, Gate Bend Two Side, Gate Bend One Side, For Lottery. |
| `system-accounts.ts` | The chart of accounts codes used by the financial ledger (1100 Accounts Receivable, 1200 Cash on Hand, 4000 Service Revenue, 5200 Cancelled Job Loss, etc.). |
| `index.ts` | Barrel export |

---

### `packages/shared/src/types/`

TypeScript type definitions used by both apps.

**`api.types.ts`** — defines the standard shapes every API response takes:
- `ApiResponse<T>` — a successful response: `{ data: T }`
- `PaginatedResponse<T>` — adds `total`, `page`, `limit` to a list response
- `ApiError` — an error response: `{ error: { code, message } }`

Both apps import these so they always agree on what a response looks like.

**`spec.types.ts`** — the three work order spec types as a TypeScript discriminated union. Each spec has a `model` field that tells TypeScript which type it is, with different fields available depending on that model:

```typescript
type CutBendSpec = {
  model: 'CUT_BEND'
  thickness_mm?: number   // standard jobs
  gauge_size?: string     // standard jobs
  length_m?: number       // Amano material only
  sheet_cuts?: number
  sheet_pieces?: number
}

type RollingSpec = {
  model: 'ROLLING'
  material_type: string
  work_type: string
  size: string
}

type CoilCutSpec = {
  model: 'COIL_CUT'
  weight_kg: number
}

type WorkOrderSpec = CutBendSpec | RollingSpec | CoilCutSpec
```

Adding a new work order type in a future version means adding a new type here. No database schema changes needed.

---

## `packages/offline-queue/` — Handling No Internet Connection

A browser-only package that saves actions locally when the tablet has no internet, then replays them when it reconnects. Uses **IndexedDB** — a database built into every browser that persists even if you close the tab.

**The flow:**

```
1. Tablet goes offline
2. Supervisor creates a job card
3. offline-queue saves the event to IndexedDB
4. Tablet reconnects
5. offline-queue sends all queued events to POST /offline-sync/flush
6. Server processes them in order
7. If any conflict → saved to CONFLICT_QUEUE for Branch Manager to resolve
```

**Two things are never queued, no matter what:**
- Payment recording — always requires a live connection (BR18)
- Stock deductions — depend on live stock levels

> This package is **browser only**. Never import it in the NestJS backend — it uses browser APIs that don't exist in Node.js.

---

## Root Commands — What You Type at the Terminal

| Command | What it does |
|---|---|
| `pnpm dev` | Start everything — API on :3000, web app on :5173. Turborepo handles the order. |
| `pnpm db:migrate` | Apply any pending database schema changes. Run after pulling new migrations. |
| `pnpm db:seed` | Fill the database with test data. Safe to re-run — idempotent. |
| `pnpm build` | Build all packages and apps for production. |
| `pnpm test` | Run tests across all packages. |
| `docker compose up -d` | Start Postgres in the background. |
| `docker compose down` | Stop Postgres. |

---

## Quick Reference — Where Does Each Concern Live?

| Concern | Location |
|---|---|
| Enum definitions (statuses, roles, types) | `packages/shared/src/enums/` |
| Validation rules (API + form) | `packages/shared/src/schemas/` |
| Status transition logic | `packages/shared/src/state-machines/` |
| All error codes and messages | `packages/shared/src/errors.ts` |
| Predefined dropdown values | `packages/shared/src/constants/` |
| API response shapes | `packages/shared/src/types/api.types.ts` |
| Work order spec types | `packages/shared/src/types/spec.types.ts` |
| Offline event queue | `packages/offline-queue/` |
| Dev seed data | `scripts/seed.ts` |
| Legacy data import | `scripts/migrate-legacy.ts` |
| CI env variable guard | `scripts/check-env.ts` |
| Database (local dev) | `docker-compose.yml` |
| Project-wide decisions | `PLAN.md` |
| Documented env variables | `.env.example` |
| Real secrets | `.env` (never committed) |
