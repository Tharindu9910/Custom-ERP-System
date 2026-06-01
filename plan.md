# Saniro ERP — Project Plan v6

> **Frontend:** React 19 + TypeScript + Vite 6 + Zustand v5 + TanStack Suite + shadcn/ui + tailwindcss
> **Backend:** NestJS + TypeORM + PostgreSQL 16+
> **Tooling:** pnpm workspaces + Turborepo + Claude Code
> **Team:** 2 developers, equal level, splitting work by module
> **Source of truth:** ER diagram > PRD v4 > this plan

---

## What Changed from v5

| Change | Reason |
|---|---|
| `common/` flattened | 6 single-file folders collapsed into flat files. Guards stay separate — they have real logic. Less navigation, same clarity. |
| `errors.ts` added to `common/` | Every error code and message in one file. Services throw `ERR.*` constants. Frontend switches on stable codes. Debuggable for the life of the project. |

---

## 1. Monorepo Structure

```
erp/
├── apps/
│   ├── web/                    # React frontend — web only
│   └── api/                    # NestJS backend
├── packages/
│   ├── shared/                 # Enums, Zod schemas, TS types, constants — shared contract
│   └── offline-queue/          # IndexedDB offline event queue — browser only
├── scripts/
│   ├── seed.ts                 # Dev seed — idempotent, safe to re-run
│   ├── migrate-legacy.ts       # One-shot legacy import (NFR08)
│   └── check-env.ts            # CI: fails if .env.example has undocumented keys
├── .env.example                # Committed — documents every variable
├── .env                        # Never committed
├── pnpm-workspace.yaml
├── turbo.json
├── docker-compose.yml          # Postgres 16 only — no Redis, no extra services
└── PLAN.md
```

```bash
pnpm dev         # api :3000 + web :5173
pnpm db:migrate  # run pending TypeORM migrations
pnpm db:seed     # insert dev data
```

---

## 2. Environment Variables

### Root `.env.example`
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/erp_db
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
DATABASE_SSL=false                    # true in production

# JWT
JWT_SECRET=change_this_before_production
JWT_REFRESH_SECRET=change_this_before_production_refresh
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# Storage (S3-compatible or local)
STORAGE_PROVIDER=local                # s3 | r2 | minio | local
STORAGE_BUCKET=erp-uploads
STORAGE_REGION=ap-southeast-1
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
STORAGE_ENDPOINT=
STORAGE_BASE_URL=

# App
NODE_ENV=development
API_PORT=3000
FRONTEND_URL=http://localhost:5173

# Real-time
SSE_HEARTBEAT_MS=30000

# Background Jobs — pg-boss runs inside Postgres, no Redis
PG_BOSS_SCHEMA=pgboss
PG_BOSS_MAX_ATTEMPTS=3
PG_BOSS_RETRY_DELAY_SECONDS=60

# Notifications
NOTIFICATION_CHANNEL=log              # log | smtp | whatsapp
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@erp.local
WHATSAPP_API_URL=
WHATSAPP_API_TOKEN=

# Rate Limiting
THROTTLE_TTL_SECONDS=60
THROTTLE_LIMIT=100
THROTTLE_AUTH_LIMIT=10

# Offline Sync
OFFLINE_SYNC_MAX_AGE_HOURS=24

# PDF
PDF_CHROMIUM_PATH=                    # blank = puppeteer bundled chromium

# Cache — in-memory, no Redis
PERMISSION_CACHE_TTL_MS=300000        # 5 min
PRICE_LIST_CACHE_TTL_MS=600000        # 10 min
```

### `apps/web/.env.example`
```bash
VITE_API_BASE_URL=http://localhost:3000
VITE_APP_NAME=Saniro ERP
VITE_APP_VERSION=1.0.0

# Feature flags
VITE_FEATURE_NOTIFICATIONS=true
VITE_FEATURE_AUDIT_LOG=true
VITE_FEATURE_REPORTS=false            # off until Phase 4
VITE_FEATURE_OFFLINE=true

VITE_MAX_UPLOAD_SIZE_MB=10
VITE_ALLOWED_FILE_TYPES=image/jpeg,image/png,application/pdf
VITE_GATE_PASS_BASE_URL=http://localhost:5173/gate-pass
```

### `apps/api/.env.example`
```bash
ALLOWED_ORIGINS=http://localhost:5173
COOKIE_DOMAIN=localhost
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
```

**Rules:**
- `.env.example` committed. `.env` never committed.
- `scripts/check-env.ts` runs in CI — fails if any key is undocumented.
- Backend validates all vars at startup with Zod. Frontend with `validateEnv()`. Hard crash on missing required vars.
- Production secrets go in platform secret manager only.

---

## 3. Database — New Tables Required by PRD

These are missing from the original ER. Add to ER and write migrations before Phase 1.

### WORKER
Shop-floor workers are not system users. Work order assignments point here, not to USER.
```sql
WORKER { uuid worker_id PK, uuid branch_id FK, string full_name, string phone,
         boolean is_active DEFAULT true, uuid created_by FK, timestamp created_at }
```

### WORK_ORDER_WORKER
Junction — one work order assigned to multiple workers (BR04).
```sql
WORK_ORDER_WORKER { uuid work_order_id FK, uuid worker_id FK,
                    uuid assigned_by FK, timestamp assigned_at,
                    PRIMARY KEY (work_order_id, worker_id) }
```

### WORK_ORDER_STATUS_NOTE
Append-only note log per work order (FR10). No UPDATE/DELETE ever exposed.
```sql
WORK_ORDER_STATUS_NOTE { uuid note_id PK, uuid work_order_id FK,
                          uuid written_by FK, enum actor_role, text note, timestamp written_at }
```

### PRICE_LIST_ENTRY
Configurable price list per branch. NULL branch_id = master template.
```sql
PRICE_LIST_ENTRY { uuid entry_id PK, uuid branch_id FK NULLABLE,
                   string work_order_type, string material_type,
                   string thickness_or_size NULLABLE, integer rate,
                   boolean is_active DEFAULT true, uuid created_by FK,
                   timestamp created_at, timestamp updated_at }
```
Lookup order: branch entry → master template → nothing → auto-Customized (FR22).

### BRANCH_CONFIG
Per-branch operational settings. 1:1 with BRANCH. Managed inside `branches/` module.
```sql
BRANCH_CONFIG { uuid config_id PK, uuid branch_id FK UNIQUE,
                integer min_advance_pct_customized DEFAULT 30,
                integer min_advance_pct_standard DEFAULT 0,
                boolean stock_override_enabled DEFAULT false,
                string stock_override_password_hash NULLABLE,
                timestamp updated_at, uuid updated_by FK }
```

### CANCELLATION_REQUEST
Approval workflow for job card cancellations (BR14/BR15). No refund fields — BR16 is absolute.
```sql
CANCELLATION_REQUEST { uuid request_id PK, uuid job_card_id FK, uuid requested_by FK,
                        string reason_code, text reason_detail NULLABLE,
                        enum status, uuid approved_by FK NULLABLE, text approval_note NULLABLE,
                        boolean materials_consumed NULLABLE, uuid attested_by FK NULLABLE,
                        timestamp created_at, timestamp resolved_at NULLABLE }
```

### CONFLICT_QUEUE
Offline sync conflicts for Admin to resolve (FR23/NFR10).
```sql
CONFLICT_QUEUE { uuid conflict_id PK, uuid branch_id FK, string entity_type, uuid entity_id,
                 uuid reported_by FK, jsonb client_snapshot, jsonb server_snapshot,
                 enum status, uuid resolved_by FK NULLABLE, text resolution_note NULLABLE,
                 timestamp created_at, timestamp resolved_at NULLABLE }
```

### PERMISSION + ROLE_PERMISSION
Dynamic RBAC — Super Admin configures per-role permissions at runtime.
```sql
PERMISSION { uuid permission_id PK, string action, string description,
             string module, boolean is_system DEFAULT false }

ROLE_PERMISSION { uuid role_permission_id PK, enum role, uuid permission_id FK,
                  boolean granted DEFAULT true, uuid set_by FK, timestamp set_at,
                  UNIQUE (role, permission_id) }
```
`SUPER_ADMIN` bypasses `PermissionsGuard` in code — never stored here, prevents lockout.

### CUSTOMER — additions
```sql
enum   customer_type                  -- INDIVIDUAL | BUSINESS
string company_name    NULLABLE       -- required for BUSINESS
string contact_person  NULLABLE
UNIQUE (phone)                        -- globally unique
```

### FINANCIAL_ACCOUNT + LEDGER_ENTRY
See Section 5 — Financial Ledger.

### LEGACY_IMPORT
```sql
LEGACY_IMPORT { uuid import_id PK, uuid job_card_id FK,
                string legacy_reference UNIQUE, jsonb raw_import_data,
                uuid imported_by FK, timestamp imported_at }
```

### Additions to existing tables
```sql
-- WORK_ORDER
jsonb   spec                          -- model-specific measurements (validated by Zod)
integer version DEFAULT 1             -- optimistic lock
boolean customer_supplied DEFAULT false
enum    pricing_model                 -- UNIT_BASED | WEIGHT_BASED
boolean is_customized DEFAULT false
string  customized_reason_code NULLABLE
enum    actor_role_at_creation
uuid    gate_pass_id FK NULLABLE

-- JOB_CARD
enum    section_type                  -- WORKSHOP | HARDWARE
enum    service_type                  -- FABRICATION | BUY_MATERIALS
integer version DEFAULT 1
boolean is_legacy DEFAULT false
integer balance_due                   -- cached cents, recomputed after every payment
enum    actor_role_at_creation

-- AUDIT_LOG
enum    actor_role                    -- role at action time, from JWT (BR22)
integer entity_version
```

---

## 4. WORK_ORDER — JSONB Spec Decision

Three pricing models have different measurement fields. Flat columns = 8+ nullables per row. Pure JSONB = can't `SUM(quantity)` or `SUM(weight_kg)`.

**Rule:** Queryable/aggregatable fields stay as scalar columns. Model-specific measurements go in `spec` JSONB.

| Field | Type | Why |
|---|---|---|
| `quantity` | `integer` column | Stock deduction, reports |
| `weight_kg` | `decimal` column | Coil Cutting billing |
| `price` | `integer` column (cents) | Financial calculations |
| `spec` | `JSONB` | Model-specific — never queried directly |

```typescript
// packages/shared/src/types/spec.types.ts

type CutBendSpec = {
  model: 'CUT_BEND'
  material_label: string    // 'Amano' triggers FR04 — shows length, hides thickness
  thickness_mm?: number     // standard only
  gauge_size?: string       // standard only
  length_m?: number         // Amano only
  sheet_cuts?: number       // FR08
  sheet_pieces?: number     // FR08
}

type RollingSpec = {
  model: 'ROLLING'
  material_type: string     // predefined list
  work_type: string         // predefined dropdown (FR09)
  size: string              // dropdown if standard; free text if customized
}

type CoilCutSpec = {
  model: 'COIL_CUT'
  weight_kg: number
}

type WorkOrderSpec = CutBendSpec | RollingSpec | CoilCutSpec
```

Zod validates the discriminated union at the API boundary. A bad spec never reaches the DB.
Adding a new model in v2 = new type in this union. No DB changes.

---

## 5. Financial Ledger Architecture

The `PAYMENT` table is the operational intake. The ledger is the financial truth. Reports draw from the ledger, never from PAYMENT alone.

### Chart of Accounts (seeded, never deleted)

| Code | Name | Type | Normal Balance |
|---|---|---|---|
| 1100 | Accounts Receivable | ASSET | DEBIT |
| 1200 | Cash on Hand | ASSET | DEBIT |
| 2100 | Advance Payments Received | LIABILITY | CREDIT |
| 4000 | Service Revenue | REVENUE | CREDIT |
| 4100 | Material Revenue | REVENUE | CREDIT |
| 5100 | Material Cost | EXPENSE | DEBIT |
| 5200 | Cancelled Job Loss | EXPENSE | DEBIT |

### LEDGER_ENTRY Table
```sql
LEDGER_ENTRY {
  uuid      entry_id PK
  uuid      branch_id FK
  uuid      job_card_id FK NULLABLE
  uuid      account_id FK → FINANCIAL_ACCOUNT
  enum      entry_type                  -- DEBIT | CREDIT
  integer   amount                      -- cents, always positive
  string    reference_type              -- PAYMENT | CANCELLATION | STOCK_DEDUCTION
  uuid      reference_id
  text      description
  uuid      created_by FK
  enum      actor_role                  -- role at entry time (BR22)
  timestamp created_at                  -- immutable
  boolean   is_reversal DEFAULT false
  uuid      reverses_entry_id FK NULLABLE
}
```

### Ledger Rules
1. `REVOKE UPDATE, DELETE ON ledger_entry FROM erp_app_user` — DB-level enforcement
2. Every payment creates two entries (DEBIT + CREDIT). Ledger always balances.
3. Corrections create new reversal entries — existing entries never modified.
4. `balance_due` on JOB_CARD is cached. Recomputed from ledger after every payment.
5. No cash refund on cancellation (BR16) — write loss entry to account 5200. Advance stands.

### Payment Flow Example
```
Customer pays LKR 1,350 advance on LKR 4,500 job:
  DEBIT  1200 (Cash)              135000
  CREDIT 2100 (Advance Payments)  135000
  → balance_due = 315000

Customer pays final LKR 3,150:
  DEBIT  1200 (Cash)              315000
  DEBIT  2100 (Advance Payments)  135000   ← clears advance
  CREDIT 4000 (Service Revenue)   450000   ← full revenue recognised
  → balance_due = 0 → CLOSED eligible (BR25)

Job cancelled after advance paid (no refund — BR16):
  DEBIT  5200 (Cancelled Job Loss) 135000  ← business absorbs loss
  → Advance stands. No cash moves.
```

### Atomic Transaction Rule
Payment + Ledger must be in the same `QueryRunner` transaction. If ledger write fails, payment rolls back. `LedgerService` methods accept an optional `EntityManager` — uses caller's transaction if provided, creates its own if not.

```typescript
// payments.service.ts
const qr = this.dataSource.createQueryRunner()
await qr.connect()
await qr.startTransaction()
try {
  const payment = await qr.manager.save(PaymentEntity, dto)
  await this.ledgerService.recordPayment(payment, actor, qr.manager) // same transaction
  await qr.commitTransaction()
  this.eventEmitter.emit('audit', new AuditableEvent(...))  // after commit — fire and forget
} catch (e) {
  await qr.rollbackTransaction()
  throw e
} finally {
  await qr.release()
}
```

Same pattern applies to: Work Order → IN_PROGRESS + stock deduction, Job Card VOID + loss entry.

---

## 6. Queue Architecture

Three distinct concepts all called "queue". Named precisely.

### Queue 1 — Cashier Queue (business concept, SSE)
Live list of DRAFT job cards awaiting payment. Cashier's primary screen.

- Transport: Server-Sent Events, in-process via EventEmitter2. No Redis needed.
- When Supervisor creates a job card → SSE pushes to all Cashier sessions at that branch.
- When Cashier processes payment → disappears from queue.

```typescript
@Sse('events')
cashierQueueEvents(@Query('branchId') branchId: string): Observable<MessageEvent> {
  return fromEvent(this.eventEmitter, `cashier_queue.${branchId}`)
    .pipe(map(data => ({ data })))
}
```

### Queue 2 — Background Job Queue (pg-boss, Postgres-backed)
Async work that must not block HTTP responses. Runs inside Postgres — no extra infrastructure.

| Job | Trigger | Handler lives in |
|---|---|---|
| `generate-invoice-pdf` | Invoice created | `invoices/` |
| `send-notification` | Status change, payment | `notifications/` |
| `check-stock-alerts` | Cron: every hour | `inventory/` |

pg-boss provider registered in `app.module.ts`. Handlers live in their owning modules, not a separate `jobs/` module.

### Queue 3 — Offline Event Queue (IndexedDB, client-side)
Browser queue for job card and work order creation when offline (FR13). Syncs on reconnect.

- Payment events **never** queued — blocked at client boundary and server (BR18)
- Stock deduction events **never** queued
- Events older than `OFFLINE_SYNC_MAX_AGE_HOURS` rejected by server
- Server returns `{ accepted: [], conflicts: [] }` — conflicts saved to CONFLICT_QUEUE

---

## 7. Role System

### Hierarchy
```
SUPER_ADMIN  — full system, all branches, configures permissions
ADMIN        — full control within their branch
AUDITOR      — read-only: audit log, financial reports, all branches
SUPERVISOR   — creates job cards, work orders, inspects
CHIEF        — same as Supervisor
CASHIER      — processes payments, verifies prices, completes customer profiles
MANAGER      — read-only view across all branches
```

All roles except SUPER_ADMIN and MANAGER are branch-scoped.

### Default Permissions (Super Admin configures via UI, stored in ROLE_PERMISSION)

| Permission | SA | Admin | Auditor | Supervisor | Chief | Cashier | Manager |
|---|---|---|---|---|---|---|---|
| `create:job_card` | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |
| `update:job_card_status` | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ |
| `cancel:job_card_draft` | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ |
| `cancel:job_card_any` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `create:work_order` | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |
| `complete:work_order` | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |
| `assign:worker` | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |
| `enter_price:customized` | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |
| `enter_price:standard` | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |
| `verify_price:standard` | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| `process:payment` | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ |
| `generate:invoice` | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| `complete:customer_profile` | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| `manage:workers` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `configure:price_list` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `configure:branch` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `override:stock` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `view:audit_log` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ |
| `view:financial_report` | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ |
| `view:all_branches` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| `resolve:conflict_queue` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `configure:permissions` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `manage:users` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

---

## 8. State Machines

Plain classes. `canTransition(from, to, actorRole)` is the only gate for status changes — never scattered `if` checks in services.

### Job Card
```
DRAFT
  ├──[payment recorded + invoice generated]──► IN_QUEUE
  └──[void by Supervisor/Chief/Admin]────────► VOIDED ■

IN_QUEUE
  ├──[first WO → IN_PROGRESS]────────────────► IN_PROGRESS
  └──[Admin requests cancel]─────────────────► CANCELLATION_PENDING

IN_PROGRESS
  ├──[all WOs COMPLETED + balance_due = 0]───► CLOSED ■
  └──[Admin requests cancel]─────────────────► CANCELLATION_PENDING

CANCELLATION_PENDING
  ├──[Admin approves]────────────────────────► VOIDED ■
  └──[Admin rejects]─────────────────────────► previous status restored
```

### Work Order
```
PENDING
  └──[worker assigned]──────────────────────► ASSIGNED
ASSIGNED
  └──[stock check passes / Admin override]──► IN_PROGRESS
IN_PROGRESS
  └──[Supervisor or Chief marks complete]───► COMPLETED ■
Any non-terminal
  └──[Admin cancels]────────────────────────► CANCELLED ■
```

---

## 9. Backend — NestJS (`apps/api`)

### 9.1 Structure

```
apps/api/src/
│
├── main.ts
├── app.module.ts                        # Registers pg-boss provider globally here
│
├── config/
│   └── env.config.ts                    # Zod-validated env — hard crash if invalid
│
├── common/                              # HTTP infrastructure only.
│   │                                    # Rule: zero imports from modules/.
│   ├── guards/
│   │   ├── jwt-auth.guard.ts            # Global — extends AuthGuard('jwt')
│   │   └── permissions.guard.ts         # Reads permission cache, checks metadata
│   │                                    # Guards stay separate — they have real logic
│   ├── decorators.ts                    # @CurrentUser(), @RequirePermissions(), @Public()
│   │                                    # All 3 decorators in one file — ~30 lines total
│   ├── response.interceptor.ts          # Uniform { data } / { error } response shape
│   ├── exception.filter.ts              # Exception → HTTP status + reads ERR code/message
│   ├── zod-validation.pipe.ts           # Validates request body at boundary
│   ├── types.ts                         # RequestUser type + any shared HTTP types
│   └── errors.ts                        # Every error code + message in the system
│                                        # Services throw using ERR.* constants
│                                        # Frontend switches on stable error codes
│
├── database/
│   ├── migrations/                      # All schema changes. synchronize: false everywhere.
│   └── entities/                        # TypeORM decorators only. Zero methods. Zero logic.
│       ├── branch.entity.ts
│       ├── branch-section.entity.ts
│       ├── branch-config.entity.ts
│       ├── user.entity.ts
│       ├── user-role.entity.ts
│       ├── permission.entity.ts
│       ├── role-permission.entity.ts
│       ├── worker.entity.ts
│       ├── customer.entity.ts
│       ├── job-card.entity.ts
│       ├── job-status-log.entity.ts
│       ├── work-order.entity.ts
│       ├── work-order-worker.entity.ts
│       ├── work-order-status-note.entity.ts
│       ├── work-order-inspection.entity.ts
│       ├── work-order-attachment.entity.ts
│       ├── price-list-entry.entity.ts
│       ├── material-order.entity.ts
│       ├── material-order-line.entity.ts
│       ├── hardware-store-item.entity.ts
│       ├── stock-movement.entity.ts
│       ├── stock-alert.entity.ts
│       ├── goods-issue.entity.ts
│       ├── goods-issue-line.entity.ts
│       ├── payment.entity.ts
│       ├── invoice.entity.ts
│       ├── financial-account.entity.ts
│       ├── ledger-entry.entity.ts
│       ├── delivery.entity.ts
│       ├── cancellation-request.entity.ts
│       ├── conflict-queue.entity.ts
│       ├── gate-pass.entity.ts
│       ├── gate-pass-item.entity.ts
│       ├── petty-cash.entity.ts
│       ├── notification.entity.ts
│       ├── audit-log.entity.ts
│       └── legacy-import.entity.ts
│
└── modules/
    │
    ├── auth/
    │   ├── auth.module.ts
    │   ├── auth.controller.ts           # /auth/login, /auth/refresh, /auth/logout
    │   ├── auth.service.ts              # Token generation, refresh rotation
    │   ├── strategies/
    │   │   ├── jwt.strategy.ts          # Passport JWT strategy
    │   │   └── refresh-token.strategy.ts
    │   └── dto/
    │       ├── login.dto.ts
    │       └── refresh.dto.ts
    │
    ├── users/
    │   ├── users.module.ts
    │   ├── users.controller.ts
    │   ├── users.service.ts
    │   ├── users.repository.ts
    │   └── dto/
    │
    ├── permissions/
    │   ├── permissions.module.ts
    │   ├── permissions.controller.ts    # Super Admin CRUD on role permissions
    │   ├── permissions.service.ts       # Cache read/write. Invalidates cache on change.
    │   ├── permissions.repository.ts
    │   └── dto/
    │
    ├── branches/                        # Includes branch-config — 1:1, sub-resource
    │   ├── branches.module.ts
    │   ├── branches.controller.ts       # /branches + /branches/:id/config
    │   ├── branches.service.ts          # getConfig(branchId) used by other modules
    │   ├── branches.repository.ts       # Queries for BRANCH + BRANCH_CONFIG
    │   └── dto/
    │       ├── create-branch.dto.ts
    │       └── update-branch-config.dto.ts
    │
    ├── workers/
    │   ├── workers.module.ts
    │   ├── workers.controller.ts
    │   ├── workers.service.ts           # isInBranch() — used by work-orders
    │   ├── workers.repository.ts        # Active roster by branch
    │   └── dto/
    │
    ├── customers/
    │   ├── customers.module.ts
    │   ├── customers.controller.ts
    │   ├── customers.service.ts
    │   ├── customers.repository.ts      # Phone lookup (UNIQUE), type filter
    │   └── dto/
    │
    ├── price-list/
    │   ├── price-list.module.ts
    │   ├── price-list.controller.ts     # Admin CRUD
    │   ├── price-list.service.ts        # lookup() — cached, returns price or null
    │   ├── price-list.repository.ts     # Branch → master template chain
    │   └── dto/
    │
    ├── job-cards/                       # Includes cancellation workflow
    │   ├── job-cards.module.ts
    │   ├── job-cards.controller.ts      # Routes + POST /:id/cancel sub-route
    │   ├── job-cards.service.ts         # ~250 lines with clear private methods:
    │   │                                #   private validateCustomer()
    │   │                                #   private computeBalance()
    │   │                                #   private checkCancellationRules()
    │   │                                # Cancellation absorbed here — it IS a job card op
    │   ├── job-cards.repository.ts      # All queries including cancellation-request queries
    │   ├── job-cards.state-machine.ts   # canTransition(from, to, role) — only status gate
    │   └── dto/
    │       ├── create-job-card.dto.ts
    │       ├── update-job-card-status.dto.ts
    │       ├── request-cancellation.dto.ts
    │       └── filter-job-card.dto.ts
    │
    ├── work-orders/                     # Includes notes — sub-resource, not a domain
    │   ├── work-orders.module.ts
    │   ├── work-orders.controller.ts    # Routes + POST /:id/notes sub-route
    │   ├── work-orders.service.ts       # ~300 lines with clear private methods:
    │   │                                #   private resolvePrice()    — Amano rule, lookup, auto-customized
    │   │                                #   private validateSpec()    — Zod discriminated union per model
    │   │                                #   private assignWorkers()   — BR03, BR04, BR19
    │   ├── work-orders.repository.ts    # All queries including note queries
    │   ├── work-orders.state-machine.ts # canTransition(from, to, role)
    │   └── dto/
    │       ├── create-work-order.dto.ts
    │       ├── update-work-order-status.dto.ts
    │       ├── add-note.dto.ts
    │       └── filter-work-order.dto.ts
    │
    ├── payments/
    │   ├── payments.module.ts
    │   ├── payments.controller.ts
    │   ├── payments.service.ts          # Atomic: payment + ledger in one QueryRunner
    │   ├── payments.repository.ts
    │   └── dto/
    │
    ├── invoices/
    │   ├── invoices.module.ts
    │   ├── invoices.controller.ts
    │   ├── invoices.service.ts          # Creates invoice. Enqueues PDF via pg-boss.
    │   ├── invoices.repository.ts
    │   ├── handlers/
    │   │   └── invoice-pdf.handler.ts   # pg-boss handler — lives here, not jobs/
    │   └── dto/
    │
    ├── ledger/                          # No controller — internal only
    │   ├── ledger.module.ts
    │   ├── ledger.service.ts            # Only writer to LEDGER_ENTRY
    │   │                                # Accepts optional EntityManager for atomic calls
    │   ├── ledger.repository.ts         # Balance queries, branch financial summary
    │   └── dto/
    │       └── ledger-entry.dto.ts
    │
    ├── inventory/
    │   ├── inventory.module.ts
    │   ├── inventory.controller.ts
    │   ├── inventory.service.ts         # Atomic: stock deduction + WO status in QueryRunner
    │   ├── inventory.repository.ts      # Atomic SQL, stock movement history
    │   ├── handlers/
    │   │   └── stock-alert.handler.ts   # pg-boss cron handler
    │   └── dto/
    │
    ├── goods-issue/
    │   ├── goods-issue.module.ts
    │   ├── goods-issue.controller.ts
    │   ├── goods-issue.service.ts
    │   ├── goods-issue.repository.ts
    │   └── dto/
    │
    ├── material-orders/
    │   ├── material-orders.module.ts
    │   ├── material-orders.controller.ts
    │   ├── material-orders.service.ts
    │   ├── material-orders.repository.ts
    │   └── dto/
    │
    ├── offline-sync/                    # Includes conflict-queue — same lifecycle
    │   ├── offline-sync.module.ts
    │   ├── offline-sync.controller.ts   # POST /offline-sync/flush
    │   │                                # GET  /offline-sync/conflicts
    │   │                                # PATCH /offline-sync/conflicts/:id
    │   ├── offline-sync.service.ts
    │   ├── offline-sync.repository.ts
    │   └── dto/
    │       ├── flush-events.dto.ts
    │       └── resolve-conflict.dto.ts
    │
    ├── audit-logs/
    │   ├── audit-logs.module.ts
    │   ├── audit-logs.controller.ts     # GET — Auditor/Admin read-only
    │   ├── audit-logs.service.ts
    │   ├── audit-logs.repository.ts
    │   ├── audit-log.listener.ts        # @OnEvent('audit', { async: true })
    │   ├── auditable.event.ts           # Event class — lives here, not in common/
    │   └── dto/
    │       └── filter-audit-log.dto.ts
    │
    ├── notifications/
    │   ├── notifications.module.ts
    │   ├── notifications.controller.ts  # GET — read only
    │   ├── notifications.service.ts     # send() — routes to log/smtp/whatsapp by env
    │   ├── handlers/
    │   │   └── notification.handler.ts  # pg-boss handler
    │   └── dto/
    │
    ├── gate-passes/                     # Thin — EntityManager direct, no repository
    │   ├── gate-passes.module.ts
    │   ├── gate-passes.controller.ts    # Public lookup (no auth) + create + close
    │   ├── gate-passes.service.ts
    │   └── dto/
    │
    ├── petty-cash/                      # Thin — EntityManager direct, no repository
    │   ├── petty-cash.module.ts
    │   ├── petty-cash.controller.ts
    │   ├── petty-cash.service.ts
    │   └── dto/
    │
    └── deliveries/                      # Thin — EntityManager direct, no repository
        ├── deliveries.module.ts
        ├── deliveries.controller.ts
        ├── deliveries.service.ts
        └── dto/
```

### 9.2 Module Pattern

One consistent pattern across all modules. No tiers to remember.

```
module.ts       — NestJS module wiring
controller.ts   — HTTP routing only, no logic
service.ts      — Business logic. Private methods for internal complexity.
repository.ts   — DB queries. Omit only for thin modules (≤3 simple ops).
dto/            — Input/output shapes
handlers/       — pg-boss job handlers, if this module owns async jobs
```

**When to omit the repository:** module has ≤3 simple queries all called from one place. Use `EntityManager` injected directly in the service. (`gate-passes`, `petty-cash`, `deliveries`)

### 9.3 Service Design — Private Methods over Separate Files

For complex services, use named private methods instead of separate files:

```typescript
// work-orders.service.ts
@Injectable()
export class WorkOrdersService {

  async create(dto: CreateWorkOrderDto, actor: RequestUser) {
    const spec = this.validateSpec(dto)          // private
    const price = await this.resolvePrice(dto)   // private, calls PriceListService
    await this.assignWorkers(dto, price, actor)  // private, calls WorkersService
    // ... save and return
  }

  private validateSpec(dto: CreateWorkOrderDto): WorkOrderSpec { ... }
  private async resolvePrice(dto: CreateWorkOrderDto): Promise<number> { ... }
  private async assignWorkers(...) { ... }
}
```

Readable, debuggable, no file-hopping. If this file reaches 400+ lines revisit — that's the signal to extract.

### 9.4 NestJS Modules Used

| Module | Purpose |
|---|---|
| `@nestjs/passport` + `@nestjs/jwt` | JWT auth. Strategy in `auth/strategies/`. Guard in `common/guards/`. |
| `@nestjs/throttler` | Rate limiting. Stricter limit on `/auth/login` and `/auth/refresh`. |
| `@nestjs/event-emitter` | Audit log events only (`audit` event, async, non-transactional). |
| `@nestjs/schedule` | Cron triggers inside owning modules (e.g. stock alert in `inventory/`). |
| `@nestjs/cache-manager` | In-memory cache for permissions and price list. No Redis. |

**EventEmitter2 scope:** Used only for audit events. Financial side effects (ledger writes, stock deductions) use direct service calls inside `QueryRunner` transactions — not events. This keeps critical paths debuggable.

### 9.5 API Response Shape

```typescript
{ data: T }                                        // single
{ data: T[], meta: { total, page, limit, totalPages } }  // list
{ error: { code: string, message: string, details?: unknown } }  // error
{ error: { code: 'OPTIMISTIC_LOCK_CONFLICT', conflictId: string } }  // 409
```

### 9.6 Error Handling — `common/errors.ts`

Every error code and message lives in one file. Services never throw raw strings.

```typescript
// src/common/errors.ts
export const ERR = {

  // Auth
  AUTH_INVALID_CREDENTIALS:    { code: 'AUTH_001', message: 'Invalid username or password' },
  AUTH_TOKEN_EXPIRED:          { code: 'AUTH_002', message: 'Token has expired' },
  AUTH_INSUFFICIENT_PERMISSION:{ code: 'AUTH_003', message: 'You do not have permission for this action' },

  // Job Cards
  JOB_CARD_NOT_FOUND:          { code: 'JC_001', message: 'Job card not found' },
  JOB_CARD_INVALID_TRANSITION: { code: 'JC_002', message: 'This status change is not allowed' },
  JOB_CARD_BALANCE_NOT_ZERO:   { code: 'JC_003', message: 'Balance must be zero before closing' },
  JOB_CARD_VERSION_CONFLICT:   { code: 'JC_004', message: 'Job card was modified by someone else — please refresh' },

  // Work Orders
  WORK_ORDER_NOT_FOUND:        { code: 'WO_001', message: 'Work order not found' },
  WORK_ORDER_NO_WORKER:        { code: 'WO_002', message: 'At least one worker must be assigned' },
  WORK_ORDER_WORKER_BRANCH:    { code: 'WO_003', message: 'Worker does not belong to this branch' },
  WORK_ORDER_INVALID_SPEC:     { code: 'WO_004', message: 'Work order spec is invalid for this type' },
  WORK_ORDER_INVALID_TRANSITION:{ code: 'WO_005', message: 'This status change is not allowed' },

  // Payments
  PAYMENT_OFFLINE_BLOCKED:     { code: 'PAY_001', message: 'Payments cannot be processed offline' },
  PAYMENT_ADVANCE_TOO_LOW:     { code: 'PAY_002', message: 'Advance does not meet the minimum requirement' },

  // Inventory
  STOCK_INSUFFICIENT:          { code: 'INV_001', message: 'Insufficient stock for this operation' },

  // Price List
  PRICE_NOT_FOUND:             { code: 'PL_001',  message: 'No price entry found — work order set to customized' },

  // Customers
  CUSTOMER_PHONE_EXISTS:       { code: 'CUS_001', message: 'A customer with this phone number already exists' },
  CUSTOMER_NOT_FOUND:          { code: 'CUS_002', message: 'Customer not found' },

  // Workers
  WORKER_NOT_FOUND:            { code: 'WRK_001', message: 'Worker not found' },
  WORKER_INACTIVE:             { code: 'WRK_002', message: 'Worker is inactive and cannot be assigned' },

  // Offline Sync
  SYNC_EVENT_TOO_OLD:          { code: 'SYNC_001', message: 'Event is too old to sync — please re-enter manually' },
  SYNC_PAYMENT_BLOCKED:        { code: 'SYNC_002', message: 'Payment events cannot be queued offline' },

} as const
```

**How services use it:**
```typescript
import { ERR } from 'src/common/errors'

throw new NotFoundException(ERR.JOB_CARD_NOT_FOUND)
throw new BadRequestException(ERR.WORK_ORDER_NO_WORKER)
throw new ConflictException(ERR.JOB_CARD_VERSION_CONFLICT)
```

**`exception.filter.ts` reads the payload:**
```typescript
// Structured error always reaches the frontend
{ error: { code: 'WO_003', message: 'Worker does not belong to this branch' } }
```

**Why this matters:**
- Bug report mentions error code → `errors.ts` → found in 2 seconds
- Frontend switches on `code` (stable) not `message` (can change for UX)
- Typo in an error key fails at compile time, not runtime
- New developer opens `errors.ts` and sees every failure case in the system

---

## 10. Database Rules

- PostgreSQL 16+
- UUID v7 for all PKs (time-sortable, index-friendly)
- `synchronize: false` everywhere — migrations only
- Soft deletes (`is_active: false`) on USER, CUSTOMER, HARDWARE_STORE_ITEM, WORKER
- Append-only enforcement at DB level:

```sql
REVOKE UPDATE, DELETE ON audit_log FROM erp_app_user;
REVOKE UPDATE, DELETE ON work_order_status_note FROM erp_app_user;
REVOKE UPDATE, DELETE ON job_status_log FROM erp_app_user;
REVOKE UPDATE, DELETE ON ledger_entry FROM erp_app_user;
```

### Indexes
```sql
CREATE INDEX idx_job_card_branch_status  ON job_card(branch_id, status) WHERE status = 'DRAFT';
CREATE INDEX idx_work_order_job_card     ON work_order(job_card_id);
CREATE INDEX idx_worker_branch_active    ON worker(branch_id) WHERE is_active = true;
CREATE INDEX idx_price_list_lookup       ON price_list_entry(branch_id, work_order_type, material_type) WHERE is_active = true;
CREATE INDEX idx_ledger_job_card         ON ledger_entry(job_card_id, account_id);
CREATE INDEX idx_ledger_branch_date      ON ledger_entry(branch_id, created_at DESC);
CREATE INDEX idx_audit_log_entity        ON audit_log(entity_type, entity_id);
CREATE INDEX idx_stock_movement_item     ON stock_movement(item_id, moved_at DESC);
CREATE INDEX idx_conflict_queue_pending  ON conflict_queue(branch_id) WHERE status = 'PENDING';
```

### Optimistic Locking
Every mutating request sends the current `version`. Service checks `WHERE id = ? AND version = ?`.
0 rows affected → `409 ConflictException` → frontend shows `VersionConflictToast`.

---

## 11. Frontend — React + Vite (`apps/web`)

Web only. Supervisor and Chief screens must be tablet-usable (NFR01).

### 11.1 Structure

```
apps/web/src/
│
├── main.tsx
├── env.ts                              # Typed env accessor — never import.meta.env directly
│
├── app/
│   ├── providers.tsx                   # QueryClient, Router, Theme
│   ├── router.tsx                      # TanStack Router file-based routes
│   └── ability.ts                      # CASL builder — from server permissions list
│
├── routes/
│   ├── __root.tsx
│   ├── login.tsx
│   ├── _layout.tsx                     # Auth shell: sidebar + header + outlet
│   ├── index.tsx                       # Dashboard
│   ├── cashier-queue/index.tsx         # Cashier primary screen — SSE-driven
│   ├── job-cards/
│   │   ├── index.tsx
│   │   └── $jobCardId.tsx
│   ├── customers/
│   │   ├── index.tsx
│   │   └── $customerId.tsx
│   ├── workers/index.tsx
│   ├── price-list/index.tsx
│   ├── inventory/
│   │   ├── index.tsx
│   │   └── $itemId.tsx
│   ├── goods-issue/
│   │   ├── index.tsx
│   │   └── $goodsIssueId.tsx
│   ├── payments/index.tsx
│   ├── invoices/$invoiceId.tsx
│   ├── gate-passes/$passNumber.tsx     # Public — no auth
│   ├── petty-cash/index.tsx
│   ├── deliveries/index.tsx
│   ├── ledger/index.tsx                # Auditor / Admin financial view
│   ├── offline-sync/index.tsx          # Conflict queue + sync status — Admin only
│   └── settings/
│       ├── users.tsx
│       ├── permissions.tsx             # Super Admin only
│       ├── workers.tsx
│       └── branch-config.tsx
│
├── modules/                            # One folder per domain: components/ + hooks/
│   ├── job-cards/
│   │   ├── components/
│   │   │   ├── JobCardTable.tsx
│   │   │   ├── JobCardDetail.tsx
│   │   │   ├── JobCardStatusStepper.tsx
│   │   │   ├── JobCardForm.tsx
│   │   │   ├── JobCardFilters.tsx
│   │   │   └── CancellationModal.tsx
│   │   └── hooks/
│   │       ├── useJobCards.ts
│   │       ├── useJobCard.ts
│   │       ├── useCreateJobCard.ts
│   │       ├── useUpdateJobCardStatus.ts
│   │       ├── useJobCardSSE.ts
│   │       └── useCancellationRequest.ts
│   ├── cashier-queue/
│   │   ├── components/
│   │   │   ├── CashierQueue.tsx
│   │   │   ├── CashierQueueRow.tsx
│   │   │   └── PhoneSearchBar.tsx
│   │   └── hooks/
│   │       ├── useCashierQueue.ts
│   │       └── useCashierQueueSSE.ts
│   ├── work-orders/
│   │   ├── components/
│   │   │   ├── WorkOrderList.tsx
│   │   │   ├── WorkOrderForm.tsx       # Spec-aware multi-step
│   │   │   ├── WorkOrderCard.tsx
│   │   │   ├── WorkOrderInspectionForm.tsx
│   │   │   ├── WorkOrderAttachments.tsx
│   │   │   ├── WorkOrderStatusNotes.tsx
│   │   │   └── WorkerMultiSelect.tsx
│   │   └── hooks/
│   │       ├── useWorkOrders.ts
│   │       ├── useCreateWorkOrder.ts
│   │       ├── useInspectWorkOrder.ts
│   │       └── useAddStatusNote.ts
│   ├── ledger/
│   │   ├── components/
│   │   │   ├── LedgerTable.tsx         # Virtualized — TanStack Virtual
│   │   │   ├── LedgerFilters.tsx
│   │   │   └── JobCardLedgerPanel.tsx  # Mini ledger inside Job Card detail
│   │   └── hooks/
│   │       └── useLedgerEntries.ts
│   ├── permissions/
│   │   ├── components/
│   │   │   └── PermissionsMatrix.tsx   # Role × permission grid with toggles
│   │   └── hooks/
│   │       └── usePermissionsMatrix.ts
│   ├── customers/
│   ├── workers/
│   ├── price-list/
│   ├── inventory/
│   ├── material-orders/
│   ├── goods-issue/
│   ├── payments/
│   ├── invoices/
│   ├── gate-passes/
│   ├── petty-cash/
│   ├── deliveries/
│   ├── offline-sync/
│   ├── notifications/
│   └── audit-logs/
│
├── offline/
│   ├── OfflineBanner.tsx
│   ├── OfflineSyncStatus.tsx
│   └── hooks/
│       ├── useOnlineStatus.ts
│       └── useOfflineSync.ts
│
└── shared/
    ├── api/
    │   ├── client.ts                   # Axios — JWT attach + refresh interceptors
    │   └── query-keys.ts               # Central key factory for all modules
    ├── components/
    │   ├── DataTable.tsx
    │   ├── FormField.tsx
    │   ├── PageHeader.tsx
    │   ├── StatusBadge.tsx
    │   ├── ConfirmDialog.tsx
    │   ├── EmptyState.tsx
    │   ├── FileUpload.tsx
    │   ├── PrintLayout.tsx
    │   └── VersionConflictToast.tsx
    ├── stores/
    │   ├── auth.store.ts               # user, accessToken, activeBranchId, CASL ability
    │   └── offline.store.ts            # pending event count, sync state
    ├── hooks/
    │   ├── usePermission.ts            # Wraps CASL — can('create', 'job_card')
    │   ├── useSSE.ts                   # Reusable SSE subscription
    │   ├── usePagination.ts
    │   └── usePrint.ts
    └── lib/
        ├── format.ts                   # currency (÷100), dates, phone numbers
        └── utils.ts                    # cn(), debounce()
```

### 11.2 State Management

| State | Where | Why |
|---|---|---|
| Auth session, active branch, CASL ability | Zustand (persisted) | Survives page refresh |
| All server data | TanStack Query | Caching, background sync, deduplication |
| Form state | react-hook-form | Local to form — no global re-renders |
| UI toggles, modals | Local `useState` | Nothing else needs it |

### 11.3 Permissions on the Frontend

Login returns `permissions: string[]`. CASL ability built from this list — not hardcoded by role.

```typescript
function buildAbility(permissions: string[]): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility)
  permissions.forEach(p => {
    const [action, subject] = p.split(':')
    can(action, subject)
  })
  return build()
}
```

If Super Admin revokes a permission, next `403` triggers re-fetch of `GET /auth/me/permissions` → rebuilt ability.

### 11.4 Key Screens

**Cashier Queue**
```
┌────────────────────────────────────────────────────┐
│  CASHIER QUEUE  [Branch: Main]  ● Live             │
│  Search by phone: [____________________]           │
├────────────────────────────────────────────────────┤
│  #JC-2026-0042  Mohamed Ali  +94711234567          │
│  2 work orders · LKR 4,500 · Advance req 30%      │
│  Created 14:23                    [Process →]      │
├────────────────────────────────────────────────────┤
│  #JC-2026-0041  Samith Traders (Business)          │
│  4 work orders · LKR 12,000 · Standard            │
│  Created 13:55                    [Process →]      │
└────────────────────────────────────────────────────┘
```
SSE-driven. Phone search filters list. `[Process →]` opens payment drawer inline.

**Job Card Detail**
```
┌──────────────────────────────────────────────────────────┐
│  #JC-2026-0042  Mohamed Ali  [IN_PROGRESS]  [⋮ actions] │
│  ── Status history ─────────────────────────────────── │
├──────────────────┬───────────────────────────────────────┤
│ Customer         │ Tabs: Work Orders │ Payments │ Ledger │
│ (type, phone)    │       Delivery    │ Gate Pass │ Notes │
│                  │                                       │
│ Financial        │  [active tab content]                 │
│ (total, advance, │                                       │
│  balance_due)    │                                       │
└──────────────────┴───────────────────────────────────────┘
```

---

## 12. Shared Package (`packages/shared`)

Single source of truth for types shared between `apps/api` and `apps/web`.

```
packages/shared/src/
├── enums/
│   ├── role.enum.ts            # SUPER_ADMIN | ADMIN | AUDITOR | SUPERVISOR | CHIEF | CASHIER | MANAGER
│   ├── job-card-status.enum.ts
│   ├── work-order-status.enum.ts
│   ├── work-order-type.enum.ts # CUT | BEND | PIPE_BEND | BOX_BAR_BEND | FLAT_IRON | L_ANGLE | SHEET_ROLL | COIL_CUT
│   ├── pricing-model.enum.ts   # UNIT_BASED | WEIGHT_BASED
│   ├── customer-type.enum.ts   # INDIVIDUAL | BUSINESS
│   ├── account-type.enum.ts    # ASSET | LIABILITY | REVENUE | EXPENSE
│   ├── entry-type.enum.ts      # DEBIT | CREDIT
│   ├── payment-mode.enum.ts
│   ├── payment-type.enum.ts
│   ├── goods-issue-status.enum.ts
│   ├── conflict-status.enum.ts
│   └── index.ts
├── schemas/                    # Zod schemas — validated at API boundary and reused in forms
│   ├── job-card.schema.ts
│   ├── work-order.schema.ts    # Includes spec discriminated union validation
│   ├── customer.schema.ts
│   ├── payment.schema.ts
│   ├── material-order.schema.ts
│   ├── goods-issue.schema.ts
│   ├── price-list.schema.ts
│   ├── worker.schema.ts
│   ├── offline-event.schema.ts
│   └── index.ts
├── constants/
│   ├── work-order-materials.ts # Predefined material list (BR08/BR23)
│   ├── thickness-options.ts    # 6mm, 5mm, 4.5mm… gauge 16, 18, 19…
│   ├── rolling-work-types.ts   # FR09 predefined dropdown values
│   ├── system-accounts.ts      # Chart of accounts codes
│   └── index.ts
└── types/
    ├── api.types.ts            # ApiResponse<T>, PaginatedResponse<T>, ApiError
    ├── spec.types.ts           # CutBendSpec | RollingSpec | CoilCutSpec
    └── index.ts
```

---

## 13. Library Reference

| Purpose | Library |
|---|---|
| UI components | shadcn/ui + Radix UI |
| Data tables | TanStack Table v8 |
| Row virtualization | TanStack Virtual (ledger, audit log) |
| Routing | TanStack Router — file-based, typed |
| Server state | TanStack Query v5 |
| Client state | Zustand v5 — auth + offline state only |
| Forms | react-hook-form + zod |
| Permissions | CASL — built from server permissions list |
| HTTP client | Axios — JWT attach + refresh interceptors |
| Offline queue | `idb` (IndexedDB) in `packages/offline-queue` |
| Date formatting | date-fns |
| Charts | Recharts |
| QR codes | qrcode.react (gate pass) |
| JSON diff | jsondiffpatch (audit log + conflict queue) |
| Auth (server) | @nestjs/passport + @nestjs/jwt |
| Throttling | @nestjs/throttler |
| Audit events | @nestjs/event-emitter |
| Scheduling | @nestjs/schedule |
| Cache | @nestjs/cache-manager (in-memory) |
| Background jobs | pg-boss (Postgres-backed) |
| PDF | Puppeteer (server-side) |
| Logging | Pino — structured JSON, never console.log |
| Tests (unit) | Vitest |
| Tests (e2e) | Playwright |

---

## 14. Rules

1. No `synchronize: true` in TypeORM — migrations only
2. No server data in Zustand — TanStack Query owns all server state
3. No `import.meta.env` outside `env.ts`
4. Enums and Zod schemas in `@erp/shared` only
5. No business logic in controllers
6. Never return a raw TypeORM entity — always a DTO
7. All money stored as integers (cents) — divide by 100 only in `format.ts`
8. Branch scope enforced at service level — never trusted from frontend
9. Feature flags via `VITE_FEATURE_*`
10. No `console.log` in API — use Pino
11. JSONB for spec; scalar columns for anything queried or aggregated
12. State machine `canTransition()` is the only gate for status changes
13. Payment events never queued offline — blocked client-side and server-side
14. Every mutating request sends current `version` — optimistic locking is mandatory
15. Role captured from JWT at event time — never looked up after the fact (BR22)
16. Price list lookup always server-side — never calculated on frontend
17. `balance_due` server-computed from ledger, cached on JOB_CARD
18. No cash refunds on cancellation — ledger records loss, BR16 is absolute
19. No Redis — pg-boss and in-memory cache only
20. `LedgerService` is the only writer to `LEDGER_ENTRY`
21. `SUPER_ADMIN` bypasses `PermissionsGuard` in code — not in DB
22. Customer phone is globally unique — DB UNIQUE constraint
23. Audit writes are async and non-transactional — business ops never roll back for audit
24. pg-boss handlers are idempotent — safe to retry
25. `common/` imports nothing from `modules/` — ever
26. Services never throw raw strings — always use `ERR.*` from `common/errors.ts`

---

## 15. Team Split

Both developers equal level. Split by area in Phase 0, by module from Phase 1.

### Phase 0 — Foundation (Week 1–2)

**Developer A — Backend foundation:**
- [ ] Monorepo scaffold (pnpm workspaces + Turborepo)
- [ ] `packages/shared` — all enums, Zod schemas, constants
- [ ] `packages/offline-queue` — IndexedDB queue, sync, event types
- [ ] NestJS bootstrap — TypeORM, all @nestjs/* modules registered, pg-boss in app.module.ts
- [ ] `JwtStrategy` + `RefreshTokenStrategy`
- [ ] `JwtAuthGuard` (global), `PermissionsGuard`, all decorators
- [ ] `common/errors.ts` — all error codes and messages defined before any module is built
- [ ] `AuditableEvent` + `AuditLogListener`
- [ ] All TypeORM entities + initial migration (all tables including new ones from §3)
- [ ] `LedgerService` + chart of accounts seed data

**Developer B — Frontend foundation:**
- [ ] Vite + React bootstrap — TanStack Router, shadcn, Tailwind
- [ ] `env.ts` typed accessor + validation
- [ ] Auth flow — login, token storage, refresh interceptor, redirect
- [ ] Zustand auth store + offline store
- [ ] All shared components — DataTable, FormField, PageHeader, StatusBadge, ConfirmDialog, PrintLayout, FileUpload, VersionConflictToast
- [ ] `usePermission()` + `<ProtectedRoute>`
- [ ] Query key factory
- [ ] `useSSE()` + `useOnlineStatus()` + `useOfflineSync()`

### Phase 1–4 — Module Assignments

One developer owns backend + frontend for a module per sprint. Other reviews.

| Developer A | Developer B |
|---|---|
| Job Cards (backend) | Job Cards (frontend) |
| Work Orders (backend + spec logic) | Work Orders (frontend — multi-step form) |
| Cashier Queue SSE (backend) | Cashier Queue (frontend) |
| Payments + Ledger integration | Ledger UI (LedgerTable, JobCardLedgerPanel) |
| Price List (backend + cache) | Price List (frontend) |
| Permissions (backend + cache) | Permissions Matrix UI |
| Inventory + Goods Issue (backend) | Inventory + Goods Issue (frontend) |
| Offline Sync (backend) | Offline banner + Conflict Queue UI |
| PDF (Puppeteer + pg-boss) | Invoice print layout |
| Audit Log (backend) | Audit Log (frontend — virtualized) |
| Workers, Customers (backend) | Workers, Customers (frontend) |
| Gate Pass, Petty Cash, Deliveries (backend) | Gate Pass, Petty Cash, Deliveries (frontend) |

---

## 16. Development Phases

### Phase 0 — Foundation (Week 1–2)
Monorepo, shared package, offline-queue, full NestJS + React bootstrap, auth end-to-end, all entities migrated, both apps start cleanly.

### Phase 1 — Core Workflow (Week 3–7)
Customers, Workers, Price List, Job Cards, Work Orders, Cashier Queue, Gate Passes, Petty Cash, Ledger entries for payments.

Price list and worker management are Phase 1 — they are dependencies of work order creation.

### Phase 2 — Operations (Week 8–11)
Inventory, Material Orders, Goods Issue, Payments (full ledger), Invoices with PDF.

### Phase 3 — Supporting (Week 12–14)
Offline sync + Conflict Queue. Notifications. Audit Log viewer. Ledger report view. Deliveries. Branch Config settings.

### Phase 4 — Polish & Hardening (Week 15–17)
- Dashboard KPIs + live queue stats (Recharts)
- Reports module (enable `VITE_FEATURE_REPORTS`)
- Legacy import script (NFR08)
- Tablet responsive pass — Supervisor and Chief screens
- Performance audit — bundle, slow queries, virtual list coverage
- Security check — auth bypass, branch isolation, rate limiting
- Playwright E2E — job card lifecycle, payment + ledger balance, offline sync

---

## 17. Data Migration (NFR08)

`scripts/migrate-legacy.ts`:
- Input CSV: `customer_phone, customer_name, customer_type, job_type, material, quantity, status, outstanding_balance`
- Output: `JOB_CARD` with `is_legacy = true`, linked `LEGACY_IMPORT` rows
- `outstanding_balance > 0` → opening ledger entry on account 1100
- Validation failures → `migration-errors.csv`, never silently skipped
- Idempotent — keyed on `legacy_reference`
- Transaction per batch — all succeed or all roll back
- `--dry-run` to preview, `--confirm` required for production

---

## 18. Testing

| What | Tool | Target |
|---|---|---|
| State machines | Vitest | 100% — every valid and invalid transition |
| Ledger logic | Vitest | Every payment type, balance calculation, cancellation loss |
| Permissions service | Vitest | Cache hit/miss, grant/revoke, SUPER_ADMIN bypass |
| Service business rules | Vitest + TypeORM mock | BR rules, stock deduction, price lookup |
| Price list lookup chain | Vitest | Branch → master → null → auto-Customized |
| API endpoints | Supertest | Happy paths + 403/409/422 |
| Offline queue | Vitest (jsdom) | Queue, sync, conflict detection, payment block |
| E2E | Playwright | Full job card lifecycle, payment + ledger balance, offline sync |

Tests co-located with code (`*.spec.ts`). No separate `/test` root.

---

## 19. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Stock goes negative under concurrent IN_PROGRESS transitions | Atomic SQL: `UPDATE ... WHERE stock >= deduction`. 0 rows = exception. No two-step check. |
| Ledger balance drifts from payments | `balance_due` recomputed after every payment. Nightly pg-boss cron reconciles cached value against full ledger sum and logs mismatch. |
| Super Admin locked out | SUPER_ADMIN bypasses PermissionsGuard in code. Not in DB. Permissions UI hides SA column. |
| Permission cache stale after change | `permissions:{role}` cache key deleted on save. Next request repopulates from DB. |
| Offline events arrive out of order | Events carry client `created_at`. Server processes in timestamp order. |
| Price list empty at branch launch | Missing entry → auto-customized with visible warning. System stays functional. |
| Migration corrupts production data | `--dry-run` previews without writing. `--confirm` required for live. Transaction per batch. |
