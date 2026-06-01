# Backend Folder Structure — Plain English Guide

> `apps/api/src/` — NestJS + TypeORM backend
>
> **The golden rule:** controllers route, services decide, repositories query. Nothing escapes that chain.

---

## Entry Point — Where the App Starts

### `main.ts`

The very first file that runs when you start the server. This is where NestJS boots up — think of it as the "on switch." It creates the app, applies global settings (validation, security headers, CORS), and tells the server to start listening on port 3000.

Things registered here apply to *every single request* — so the response format wrapper and the global auth guard live here.

> You almost never edit this file after initial setup.

---

### `app.module.ts`

The root of the whole app — wires every module together. NestJS is built around modules. This file is the "table of contents" that tells the app which features exist. Every module you build (job cards, payments, workers, etc.) gets imported here.

It also registers **pg-boss** (the background job system) globally — so any module can queue a background job without importing anything extra.

```
app.module.ts imports:
  AuthModule, UsersModule, JobCardsModule,
  WorkOrdersModule, PaymentsModule, LedgerModule,
  InventoryModule, NotificationsModule, PgBossModule…
```

---

## `config/` — Environment Variables

### `config/env.config.ts`

Reads and validates all environment variables on startup. Environment variables (like database password, JWT secret, API port) come in as plain strings. This file uses **Zod** to check that every required variable exists and has the right type.

If something is missing — say you forgot to set `DATABASE_URL` — the server *refuses to start* and tells you exactly which variable is missing. This is much better than discovering a crash at runtime.

> Crash-on-startup is intentional. A misconfigured server that starts is harder to debug than one that won't start at all.

---

## `common/` — HTTP Plumbing (Not Business Logic)

Everything in `common/` is infrastructure — it handles how requests travel through the system. It knows nothing about job cards, payments, or workers.

**Rule: `common/` never imports from `modules/`.**

---

### `common/guards/jwt-auth.guard.ts`

Checks that every request has a valid login token. A "guard" in NestJS is a gatekeeper — it runs before your route handler and decides whether the request is allowed through.

This guard checks the `Authorization` header for a valid JWT token. If the token is missing, expired, or tampered with, the request is rejected with a `401` before it ever reaches any controller.

It's registered **globally** — so every route is protected by default. Routes that should be public (like the login endpoint) use the `@Public()` decorator to opt out.

---

### `common/guards/permissions.guard.ts`

Checks that the logged-in user has permission for this specific action.

- JWT guard says: *"you are who you say you are."*
- Permissions guard says: *"and you're allowed to do this specific thing."*

It reads the `@RequirePermissions('create:job_card')` decorator on the route, then checks the in-memory permission cache to see if the user's role has that permission granted.

```
Request flow:
1. jwt-auth.guard    → is the token valid? who is this?
2. permissions.guard → can THIS user do THIS action?
3. Controller        → actually handle the request
```

---

### `common/decorators.ts`

Three small helpers you put on routes — all in one file (~30 lines total).

| Decorator | What it does |
|---|---|
| `@CurrentUser()` | Injects the logged-in user object into your function parameter, pulled from the JWT |
| `@RequirePermissions('create:job_card')` | Tells the permissions guard what permission to check |
| `@Public()` | Tells the JWT guard to skip this route entirely (used on `/auth/login`) |

```typescript
// Example usage in a controller:
@Post()
@RequirePermissions('create:job_card')
create(@CurrentUser() user, @Body() dto) {
  return this.jobCardsService.create(user, dto)
}
```

---

### `common/response.interceptor.ts`

Makes every API response look the same shape. Without this, every controller returns data in whatever shape the developer happened to write. With this interceptor, every response is automatically wrapped:

```
Success: { "data": { ...your result... } }
Error:   { "error": { "code": "JC_001", "message": "Job card not found" } }
```

The frontend always knows exactly where to look. It never has to guess whether the result is at `response.result` or `response.data` or just plain `response`.

---

### `common/exception.filter.ts`

Catches any thrown error and turns it into the right HTTP response. When a service throws an error (like "job card not found"), this filter catches it and converts it into the correct HTTP status code and structured error body.

It reads the `ERR.*` constant (from shared) to get the stable error code and human-readable message, then formats it as `{ error: { code, message } }`.

> The frontend switches on `error.code` (stable), never on `error.message` (can change for UX copy).

---

### `common/zod-validation.pipe.ts`

Checks that incoming request data matches the expected shape before it reaches the service. This pipe takes the request body and runs it through the Zod schema defined in the DTO.

If someone sends `{ quantity: "hello" }` when a number is expected, the pipe rejects it with a `422` error before the service ever sees it. Bad data never reaches business logic.

---

### `common/errors.ts`

One-line re-export — all real error codes live in `packages/shared`.

This file is literally one line:
```typescript
export { ERR } from '@erp/shared/errors'
```

All error codes and messages are defined in `packages/shared` so both the API and the frontend import the same constants. If you want to change an error message the user sees, you change it once in shared and both sides update.

```typescript
// In any service file:
import { ERR } from 'src/common/errors'

throw new NotFoundException(ERR.JOB_CARD_NOT_FOUND)
// → { code: 'JC_001', message: 'Job card not found' }
```

---

### `common/types.ts`

TypeScript types shared across all HTTP files. Defines the `RequestUser` type — the shape of the user object that gets attached to every request after the JWT guard runs. Controllers and services use this type when they accept `@CurrentUser() user`.

---

## `database/` — The Database Layer

### `database/migrations/`

Every change to the database structure, stored as timestamped files. Migrations are like a version history for your database schema. Instead of making manual changes to the database, you write a migration file that describes the change (add a column, create a table, add an index). The migration runs once and is never re-run.

The project has `synchronize: false` in TypeORM config — TypeORM will *never* auto-change your database to match your code. All changes go through explicit migrations only.

> This rule exists because auto-sync in production can silently drop columns that contain real data.

---

### `database/entities/`

TypeScript classes that map to database tables — data shapes only, no logic. Each entity file (e.g. `job-card.entity.ts`) is a TypeScript class decorated with TypeORM decorators that describe the database table — column names, types, relationships, constraints.

**The rule is strict: entities have zero methods and zero business logic.** They are pure data holders. If you need to compute something from an entity's data, do it in the service and return it in the DTO.

```typescript
// ✓ Correct — just data
@Entity()
export class JobCard {
  @PrimaryGeneratedColumn('uuid')
  job_card_id: string

  @Column({ type: 'enum', enum: JobCardStatus })
  status: JobCardStatus
}

// ✗ Wrong — no methods on entities
isReadyToClose() { return this.balance_due === 0 }
```

---

## `modules/` — The Business Features

Every feature (job cards, payments, workers, etc.) is its own module folder. Each folder follows the same four-file pattern:

| File | Responsibility |
|---|---|
| `module.ts` | NestJS wiring — registers the controller, service, and repository so they can talk to each other |
| `controller.ts` | HTTP routing only — receives the request, calls the service, returns the result. No logic. |
| `service.ts` | Business logic — all the rules, validations, and decisions live here |
| `repository.ts` | Database queries only — talks to the DB, returns data. No decisions. |

Each folder also has a `dto/` subfolder with the input/output data shapes, and some have a `handlers/` folder for background job processors.

---

### `auth/`

Handles everything around proving who you are. The controller exposes three routes: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`.

The `strategies/` subfolder holds the Passport strategies — these are the functions that validate a JWT token or a refresh token. They run automatically when a guarded route is hit.

Access tokens expire in 15 minutes. Refresh tokens expire in 7 days. The refresh endpoint swaps an old refresh token for a new access token without requiring the user to log in again.

---

### `users/`

Manages the accounts that log into the system — Supervisors, Cashiers, Branch Managers, etc. These are *not* the same as shop-floor workers (those are in `workers/`). Standard CRUD. The repository has a phone lookup and branch-scoped queries.

---

### `permissions/`

Instead of hardcoding "Supervisors can create job cards" in code, the permission rules are stored in the database and managed through this module. Super Admin can change them from the UI without a code deploy.

The `service.ts` maintains an in-memory cache (5 minute TTL). When a permission changes, the cache entry for that role is deleted immediately. The next request repopulates from the database.

---

### `branches/`

Manages branch offices. Each branch has a 1:1 config record (`BRANCH_CONFIG`) that stores settings like the minimum advance percentage. Instead of a separate `branch-config/` module, config is a sub-resource here — `GET /branches/:id/config`.

The service exposes a `getConfig(branchId)` method that other modules call to read branch settings.

---

### `workers/`

Workers are the people who physically cut, bend, and roll steel. They are *not* system users — they don't log in. They're just a roster that Supervisors assign to work orders.

Workers are branch-scoped — a worker at Branch A cannot be assigned to a work order at Branch B. The service has an `isInBranch(workerId, branchId)` helper that the work-orders module calls to enforce this.

---

### `customers/`

Customers can be individuals or businesses. The phone number is globally unique across the entire system (enforced by a DB UNIQUE constraint) — this is how customers are looked up at the counter.

Supervisors create a basic customer record (just phone + name) when taking an order. Cashiers complete the profile later.

---

### `price-list/`

Stores the rates for each type of work (e.g. "Cut + 6mm steel = LKR 120 per piece"). The key function is `lookup(workType, materialType, branchId)` which follows this chain:

```
1. Check branch-specific price list entry
2. If none → check master template (null branch_id)
3. If none → return null → work order auto-marked as Customized
```

Results are cached in memory (10 min TTL). Price calculations always happen server-side — never on the frontend.

---

### `job-cards/` ⭐ Core module

The most important module. A Job Card is the parent record for a customer's visit — it tracks status, balance, and contains all the work orders.

`service.ts` is about 250 lines with clear private methods to keep it readable:

```
private validateCustomer()       — checks customer exists at this branch
private computeBalance()         — recalculates balance_due from ledger
private checkCancellationRules() — enforces BR14, BR15, BR15A
```

Cancellation is handled as a sub-route here (`POST /:id/cancel`) rather than a separate module, because it's fundamentally a job card operation.

`job-cards.state-machine.ts` is a thin wrapper that imports `canTransition(from, to, role)` from `@erp/shared`. It's the single gatekeeper for all status changes — no scattered if-checks in the service.

```
Status flow:
DRAFT → IN_QUEUE → IN_PROGRESS → CLOSED
                ↘ CANCELLATION_PENDING → VOIDED
```

---

### `work-orders/` ⭐ Core module

Each work order is one specific operation on one material. A single job card can contain many work orders.

`service.ts` (~300 lines) handles three different spec types through private methods:

```
private resolvePrice()    — Amano rule, price lookup, auto-customized flag
private validateSpec()    — different validation per work order type (CutBend / Rolling / CoilCut)
private assignWorkers()   — checks workers belong to the same branch (BR03, BR04, BR19)
```

Status notes (the append-only comment log on each work order) are a sub-resource here: `POST /work-orders/:id/notes`. They can never be edited or deleted — only added.

---

### `payments/`

Handles advance payments and final payments. The most critical rule here: **the payment record and the ledger entries must be created in a single database transaction.**

If the ledger write fails, the payment is rolled back. If the payment write fails, no ledger entry is created. They always succeed or fail together — implemented using a TypeORM `QueryRunner`.

> Payments require server connectivity. They are never queued for offline — blocked client-side and rejected server-side.

---

### `invoices/`

When a Cashier processes payment, the service creates the invoice record in the database, then immediately *enqueues* a background job to generate the PDF.

PDF generation is slow (Puppeteer renders HTML and prints it). Doing it synchronously would make the HTTP response hang. Instead it's handed off to `handlers/invoice-pdf.handler.ts` which pg-boss processes in the background.

> Background job handlers always live in the module that owns the work — not in a shared `jobs/` folder.

---

### `ledger/` — No controller

There is no HTTP controller here — this module has no public API. It only exists to be called by other services (payments, cancellations, stock deductions).

**LedgerService is the only writer to the `LEDGER_ENTRY` table.** No other service inserts ledger entries directly. This centralises all financial recording in one place.

The service accepts an optional `EntityManager` parameter. When payments call it, they pass their own QueryRunner's manager — so the ledger write happens inside the same transaction as the payment.

---

### `inventory/`

Tracks how many of each item is in stock at each branch. When a work order moves to IN_PROGRESS, stock is deducted.

Stock deduction uses an atomic SQL pattern to prevent going negative:
```sql
UPDATE hardware_store_item
SET stock_quantity = stock_quantity - :amount
WHERE item_id = :id AND stock_quantity >= :amount
```

If zero rows are affected, there wasn't enough stock and the transition is blocked. The `handlers/stock-alert.handler.ts` runs on a cron schedule (every hour via pg-boss) to check for low stock.

---

### `goods-issue/`

When Branch A needs items from the main warehouse or Branch B, this module handles the transfer with an approval workflow. Stock is deducted from the source branch when the goods issue is created. The target branch's stock only increases after they confirm receipt.

---

### `material-orders/`

When a job needs specific hardware items from the branch stock, a material order is created and linked to the job card. Standard CRUD module — no special patterns beyond the base template.

---

### `offline-sync/`

When a tablet goes offline, job card creation events queue up in the browser (IndexedDB). When connectivity returns, the frontend sends all queued events to `POST /offline-sync/flush`.

The server processes each event in order. If an event conflicts with a change made while the tablet was offline (optimistic lock mismatch), the conflict is saved to the `CONFLICT_QUEUE` table. Branch Managers can view and resolve these through `GET /offline-sync/conflicts`.

---

### `audit-logs/`

Every time something significant happens (job card created, payment processed, permission changed), other services emit an `AuditableEvent`. The `audit-log.listener.ts` catches these events and writes to the `AUDIT_LOG` table.

The listener is `async: true` — it runs after the main operation completes and *never* causes a business operation to fail or roll back if the audit write fails.

Audit records also store the user's role at the time of the action (from JWT) — not just their user ID. Even if a user's role changes later, the audit log still shows what role they had when they performed the action.

---

### `notifications/`

When a work order is completed or a job is ready for collection, this module sends a notification. The `service.ts` has a `send()` method that routes to different channels based on the `NOTIFICATION_CHANNEL` environment variable:

| Value | Used in |
|---|---|
| `log` | Development — just prints to the console |
| `smtp` | Production — sends email |
| `whatsapp` | Production — sends WhatsApp message |

Notification sending is handled asynchronously by a pg-boss handler — the HTTP response doesn't wait for the message to be delivered.

---

## Thin Modules — Simple Features, No Repository Needed

These three modules are simple enough that they don't need a repository file. The service uses `EntityManager` directly for the few database operations they need.

---

### `gate-passes/`

When a customer brings their own materials, a gate pass is issued listing what they brought. The controller has one public route (no auth required) for customers to look up their pass by number — used for the QR code on printed passes.

---

### `petty-cash/`

Records small ad-hoc cash expenses (e.g. buying supplies, paying for a minor repair). Requires Branch Manager approval above a threshold. Simple create/approve/list flow.

---

### `deliveries/`

When a finished job is handed over or delivered, this creates a delivery record linked to the job card. Records who issued it, the recipient name, the method (pickup or delivery), and any notes.

---

## Quick Reference

### The module pattern at a glance

```
modules/<name>/
  <name>.module.ts      — NestJS wiring
  <name>.controller.ts  — HTTP routing, no logic
  <name>.service.ts     — business logic
  <name>.repository.ts  — DB queries (omit for thin modules)
  dto/                  — input/output shapes
  handlers/             — pg-boss job handlers (if this module has background jobs)
```

### Which modules have special patterns

| Module | What makes it different |
|---|---|
| `auth/` | Has a `strategies/` subfolder for Passport JWT strategies |
| `job-cards/` | Includes cancellation as a sub-route; has a state machine file |
| `work-orders/` | Has a `specs/` worth of private methods; includes notes sub-resource |
| `payments/` | Uses QueryRunner for atomic payment + ledger writes |
| `invoices/` | Enqueues PDF generation to pg-boss; has a `handlers/` subfolder |
| `ledger/` | No controller — internal service only |
| `inventory/` | Atomic SQL for stock deduction; cron handler for stock alerts |
| `audit-logs/` | Has an event listener file; async writes only |
| `gate-passes/` | Has one public (unauthenticated) route |
| `gate-passes/`, `petty-cash/`, `deliveries/` | Thin — no repository file |
