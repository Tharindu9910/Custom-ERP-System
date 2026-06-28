# Saniro ERP — Development Progress

> Last updated: 2026-06-13 — Phase 2B complete
> Stack: NestJS 11 · TypeORM · PostgreSQL 16 · React 19 · Vite · pnpm monorepo · Turborepo
> Source of truth: ER diagram → PRD v4 → plan-v6.md

---

## Phase Status

| #  | Phase                                              | Status       |
|----|----------------------------------------------------|--------------|
| 1  | Monorepo scaffold + health endpoints               | ✅ Done       |
| 2  | Auth module (JWT + sessions) — backend             | ✅ Done       |
| 2B | Foundation close-out (frontend infra + shared pkg) | ✅ Done       |
| 3  | Branch, users, permissions, workers, customers     | 🔲 Next       |
| 4  | Price list + job cards + work orders + cashier queue | 🔲 Pending  |
| 5  | Inventory, material orders, goods issue            | 🔲 Pending    |
| 6  | Payments + full financial ledger + invoices + PDF  | 🔲 Pending    |
| 7  | Offline sync, conflict queue, notifications, audit log, supporting modules | 🔲 Pending |
| 8  | Polish, reports, E2E, tablet pass, legacy import   | 🔲 Pending    |

---

## Phase 1 — Monorepo Scaffold ✅

**Instruction file:** `Instructions/instructions1.md`

- [x] pnpm workspaces + Turborepo configured
- [x] `apps/api` — NestJS skeleton, port 3000
- [x] `apps/web` — React 19 + Vite skeleton, port 5173
- [x] `packages/shared` — shared enums/types barrel
- [x] `packages/offline-queue` — IndexedDB offline queue scaffold
- [x] Docker Compose — PostgreSQL 16 on port 5433
- [x] `.env.example` with all variables documented
- [x] `GET /health` — API running check
- [x] `GET /health/run` — DB connectivity check
- [x] ONBOARDING.md written

---

## Phase 2 — Auth Module (Backend) ✅

**Instruction file:** `Instructions/instructions2.md`

### Backend
- [x] `UserEntity` — accounts, password hash, branch ref
- [x] `UserRoleEntity` — one active role per user (DB-level unique index)
- [x] `UserSessionEntity` — JTI-based session tracking
- [x] Migrations: `CreateUserAndUserRole`, `CreateUserSession`
- [x] `Role` enum in `packages/shared` (7 roles: SUPER_ADMIN → CASHIER)
- [x] `POST /auth/login` — issues access + refresh tokens, rate-limited 10/min
- [x] `POST /auth/refresh` — rotates tokens, replay detection
- [x] `POST /auth/logout` — revokes single session
- [x] `POST /auth/logout/all` — revokes all user sessions
- [x] `GET /auth/me` — returns current user profile
- [x] `JwtStrategy` — validates access token, checks session active
- [x] `RefreshTokenStrategy` — validates refresh token
- [x] Global JWT auth guard with `@Public()` bypass decorator
- [x] Global response interceptor → `{ data: ... }`
- [x] Global exception filter → `{ error: { code, message } }`
- [x] Global throttler guard (100/60s default, 10/60s on auth)
- [x] `@CurrentUser()` + `@RequirePermissions()` decorators
- [x] Zod env validation at startup

---

## Phase 2B — Foundation Close-Out 🔲

> **Start here next.**
> Everything in this phase must be done before Phase 3 module work begins.
> Backend items complete the shared infrastructure. Frontend items build the app shell that all future pages plug into.

### Backend — complete the shared infrastructure

#### `common/errors.ts` — all error codes defined before any module is built
- [ ] Create `apps/api/src/common/errors.ts` with full `ERR` object covering:
  - Auth: `AUTH_INVALID_CREDENTIALS`, `AUTH_TOKEN_EXPIRED`, `AUTH_INSUFFICIENT_PERMISSION`
  - Job Cards: `JOB_CARD_NOT_FOUND`, `JOB_CARD_INVALID_TRANSITION`, `JOB_CARD_BALANCE_NOT_ZERO`, `JOB_CARD_VERSION_CONFLICT`
  - Work Orders: `WORK_ORDER_NOT_FOUND`, `WORK_ORDER_NO_WORKER`, `WORK_ORDER_WORKER_BRANCH`, `WORK_ORDER_INVALID_SPEC`, `WORK_ORDER_INVALID_TRANSITION`
  - Payments: `PAYMENT_OFFLINE_BLOCKED`, `PAYMENT_ADVANCE_TOO_LOW`
  - Inventory: `STOCK_INSUFFICIENT`
  - Price List: `PRICE_NOT_FOUND`
  - Customers: `CUSTOMER_PHONE_EXISTS`, `CUSTOMER_NOT_FOUND`
  - Workers: `WORKER_NOT_FOUND`, `WORKER_INACTIVE`
  - Offline Sync: `SYNC_EVENT_TOO_OLD`, `SYNC_PAYMENT_BLOCKED`
- [ ] Wire `common/errors.ts` as a re-export from `packages/shared/src/errors.ts`

#### `packages/shared` — complete all enums, schemas, constants, and types
- [ ] **Enums** — add all missing enums (only `role.enum.ts` exists today):
  - `job-card-status.enum.ts` — `DRAFT | IN_QUEUE | IN_PROGRESS | CANCELLATION_PENDING | CLOSED | VOIDED`
  - `work-order-status.enum.ts` — `PENDING | ASSIGNED | IN_PROGRESS | COMPLETED | CANCELLED`
  - `work-order-type.enum.ts` — `CUT | BEND | PIPE_BEND | BOX_BAR_BEND | FLAT_IRON | L_ANGLE | SHEET_ROLL | COIL_CUT`
  - `pricing-model.enum.ts` — `UNIT_BASED | WEIGHT_BASED`
  - `customer-type.enum.ts` — `INDIVIDUAL | BUSINESS`
  - `account-type.enum.ts` — `ASSET | LIABILITY | REVENUE | EXPENSE`
  - `entry-type.enum.ts` — `DEBIT | CREDIT`
  - `payment-mode.enum.ts` — `CASH | CARD | TRANSFER`
  - `payment-type.enum.ts` — `ADVANCE | FINAL | PARTIAL`
  - `goods-issue-status.enum.ts` — `PENDING | ISSUED | CONFIRMED | CANCELLED`
  - `conflict-status.enum.ts` — `PENDING | RESOLVED | DISMISSED`
  - `index.ts` barrel export
- [ ] **Zod schemas** — `schemas/` folder:
  - `job-card.schema.ts`
  - `work-order.schema.ts` — includes discriminated union for CutBend / Rolling / CoilCut spec
  - `customer.schema.ts`
  - `payment.schema.ts`
  - `material-order.schema.ts`
  - `goods-issue.schema.ts`
  - `price-list.schema.ts`
  - `worker.schema.ts`
  - `offline-event.schema.ts`
  - `index.ts` barrel export
- [ ] **Constants** — `constants/` folder:
  - `work-order-materials.ts` — predefined material list (BR08 / BR23)
  - `thickness-options.ts` — 6mm, 5mm, 4.5mm, 4mm, 3mm, 2.5mm, 2mm, gauges 16 18 19 20 22 23 24
  - `rolling-work-types.ts` — GI Pipe, L Bending (1), Rolling (2), Full Length, Circle Bend, Gate Bend Two Side, Gate Bend One Side, For Lottery (FR09)
  - `system-accounts.ts` — chart of accounts codes (1100 AR, 1200 Cash, 2100 Advance, 4000 Revenue, 4100 Material Revenue, 5100 Material Cost, 5200 Cancelled Job Loss)
  - `index.ts` barrel export
- [ ] **Types** — `types/` folder:
  - `api.types.ts` — `ApiResponse<T>`, `PaginatedResponse<T>`, `ApiError`
  - `spec.types.ts` — `CutBendSpec | RollingSpec | CoilCutSpec` discriminated union
  - `index.ts` barrel export

#### State machines — `packages/shared/src/state-machines/`
- [ ] `job-card.transitions.ts` — `canTransition(from, to, actorRole)` for all Job Card transitions:
  - `DRAFT → IN_QUEUE` (payment recorded + invoice generated)
  - `DRAFT → VOIDED` (Supervisor / Chief / Admin void)
  - `IN_QUEUE → IN_PROGRESS` (first WO moves to IN_PROGRESS)
  - `IN_QUEUE → CANCELLATION_PENDING` (Admin requests cancel)
  - `IN_PROGRESS → CLOSED` (all WOs COMPLETED + balance_due = 0)
  - `IN_PROGRESS → CANCELLATION_PENDING` (Admin requests cancel)
  - `CANCELLATION_PENDING → VOIDED` (Admin approves)
  - `CANCELLATION_PENDING → previous status` (Admin rejects)
- [ ] `work-order.transitions.ts` — `canTransition(from, to, actorRole)`:
  - `PENDING → ASSIGNED` (worker assigned)
  - `ASSIGNED → IN_PROGRESS` (stock check passes / Admin override)
  - `IN_PROGRESS → COMPLETED` (Supervisor or Chief marks complete)
  - Any non-terminal `→ CANCELLED` (Admin cancels)
- [ ] `index.ts` barrel export

#### All TypeORM entities + single consolidated migration
> These tables are absent from the current codebase. All must land in one migration before Phase 3 starts. `synchronize: false` — no exceptions.

- [ ] `BranchEntity` + `BranchSectionEntity`
- [ ] `BranchConfigEntity` — min advance pct, stock override password hash; 1:1 with Branch
- [ ] `PermissionEntity` + `RolePermissionEntity` — dynamic RBAC; SUPER_ADMIN bypasses in code, never in DB
- [ ] `WorkerEntity` — branch-scoped roster; not a system user
- [ ] `WorkOrderWorkerEntity` — junction table, composite PK `(work_order_id, worker_id)`
- [ ] `CustomerEntity` — add `customer_type` enum, `company_name`, `contact_person`; UNIQUE constraint on `phone`
- [ ] `JobCardEntity` — columns: `section_type`, `service_type`, `version DEFAULT 1`, `is_legacy DEFAULT false`, `balance_due` (cents), `actor_role_at_creation`
- [ ] `JobStatusLogEntity` — append-only; REVOKE UPDATE DELETE at DB level
- [ ] `WorkOrderEntity` — columns: `spec JSONB`, `version DEFAULT 1`, `customer_supplied DEFAULT false`, `pricing_model`, `is_customized DEFAULT false`, `customized_reason_code`, `actor_role_at_creation`, `gate_pass_id FK NULLABLE`
- [ ] `WorkOrderStatusNoteEntity` — append-only; REVOKE UPDATE DELETE at DB level
- [ ] `WorkOrderInspectionEntity`
- [ ] `WorkOrderAttachmentEntity`
- [ ] `PriceListEntryEntity` — `branch_id NULLABLE` (NULL = master template)
- [ ] `MaterialOrderEntity` + `MaterialOrderLineEntity`
- [ ] `HardwareStoreItemEntity` + `StockMovementEntity` + `StockAlertEntity`
- [ ] `GoodsIssueEntity` + `GoodsIssueLineEntity`
- [ ] `FinancialAccountEntity` + `LedgerEntryEntity` — REVOKE UPDATE DELETE on ledger_entry at DB level
- [ ] `PaymentEntity` + `InvoiceEntity`
- [ ] `DeliveryEntity`
- [ ] `CancellationRequestEntity`
- [ ] `ConflictQueueEntity`
- [ ] `GatePassEntity` + `GatePassItemEntity`
- [ ] `PettyCashEntity`
- [ ] `NotificationEntity`
- [ ] `AuditLogEntity` — append-only; REVOKE UPDATE DELETE at DB level; includes `actor_role` column
- [ ] `LegacyImportEntity`
- [ ] All indexes from plan-v6 §10 applied in migration

#### Audit + ledger foundation
- [ ] `auditable.event.ts` — event class in `modules/audit-logs/`
- [ ] `audit-log.listener.ts` — `@OnEvent('audit', { async: true })` — never causes business rollback
- [ ] `LedgerService` skeleton — only writer to `LEDGER_ENTRY`; accepts optional `EntityManager` param
- [ ] Seed chart of accounts (7 accounts from `system-accounts.ts`) — idempotent

#### `PermissionsGuard` — wire dynamic RBAC
- [ ] `permissions.guard.ts` reads in-memory cache keyed by role
- [ ] Cache TTL: 5 min (`PERMISSION_CACHE_TTL_MS`)
- [ ] `SUPER_ADMIN` bypasses guard in code — never stored in `ROLE_PERMISSION`
- [ ] Default role permissions seeded (full matrix from plan-v6 §7)

### Frontend — build the complete app shell

#### Install and configure all dependencies
- [ ] TanStack Router (file-based, typed routes)
- [ ] TanStack Query v5
- [ ] TanStack Table v8
- [ ] TanStack Virtual
- [ ] Zustand v5
- [ ] shadcn/ui + Radix UI + Tailwind CSS
- [ ] react-hook-form + zod
- [ ] CASL (`@casl/ability`, `@casl/react`)
- [ ] Axios
- [ ] date-fns
- [ ] jsondiffpatch
- [ ] qrcode.react

#### `env.ts` — typed env accessor
- [ ] Read and validate all `VITE_*` variables at startup
- [ ] Hard crash on missing required vars
- [ ] Export typed constants — no other file may use `import.meta.env` directly

#### `app/` — global providers
- [ ] `providers.tsx` — stacks `QueryClientProvider`, `RouterProvider`, `ThemeProvider`
- [ ] `router.tsx` — TanStack Router file-based setup; all routes registered
- [ ] `ability.ts` — CASL builder from `permissions: string[]` returned by login

#### Auth flow (completes the Phase 2 frontend gap)
- [ ] `routes/login.tsx` — login form, redirects to dashboard if already authenticated
- [ ] `routes/_layout.tsx` — sidebar + header shell; redirects to `/login` if no session
- [ ] `routes/__root.tsx` — offline banner mount point + global toast
- [ ] `shared/stores/auth.store.ts` — persisted Zustand store: `user`, `accessToken`, `activeBranchId`, CASL ability
- [ ] `shared/api/client.ts` — Axios instance: JWT attach interceptor + silent refresh on 401

#### Shared infrastructure hooks and stores
- [ ] `shared/stores/offline.store.ts` — pending event count, sync in-progress flag
- [ ] `shared/hooks/usePermission.ts` — wraps CASL: `can('create', 'job_card')`
- [ ] `shared/hooks/useSSE.ts` — generic SSE subscription hook with reconnect + cleanup
- [ ] `shared/hooks/useOnlineStatus.ts` — browser online/offline detection
- [ ] `shared/hooks/useOfflineSync.ts` — manages IndexedDB queue, triggers flush on reconnect
- [ ] `shared/hooks/usePagination.ts` — page/limit state for list views
- [ ] `shared/hooks/usePrint.ts` — wraps `window.print()` with PrintLayout
- [ ] `shared/api/query-keys.ts` — central key factory for all modules

#### Shared UI components
- [ ] `DataTable.tsx` — base table used by all list views
- [ ] `FormField.tsx` — label + input + error message wrapper
- [ ] `PageHeader.tsx` — title + breadcrumb + action button bar
- [ ] `StatusBadge.tsx` — coloured pill for all status enums
- [ ] `ConfirmDialog.tsx` — "Are you sure?" modal for destructive actions
- [ ] `EmptyState.tsx` — "No results" illustration
- [ ] `FileUpload.tsx` — drag-and-drop for work order attachments
- [ ] `PrintLayout.tsx` — print-safe wrapper for invoices and gate passes
- [ ] `VersionConflictToast.tsx` — shown on 409 optimistic lock conflict

#### `shared/lib/`
- [ ] `format.ts` — `formatCurrency(cents)` (÷100 happens only here), `formatDate()`, `formatPhone()`
- [ ] `utils.ts` — `cn(...classes)` Tailwind merge, `debounce(fn, ms)`

---

## Phase 3 — Branch, Users, Permissions, Workers, Customers 🔲

> All entities already exist from Phase 2B migrations. This phase builds the CRUD APIs and UI pages on top of them.
> Must be complete before Phase 4 — Workers and Price List are hard dependencies of Work Order creation.

### Backend

#### `branches/` module
- [ ] `GET /branches` — list all (Manager / Super Admin) or own branch (others)
- [ ] `POST /branches` — Super Admin only
- [ ] `PATCH /branches/:id` — Super Admin only
- [ ] `GET /branches/:id/config` — read branch config (advance %, stock override)
- [ ] `PATCH /branches/:id/config` — Branch Manager / Admin
- [ ] `BranchesService.getConfig(branchId)` — used by Work Orders and Payments modules

#### `permissions/` module
- [ ] `GET /permissions` — full permission list (Super Admin)
- [ ] `GET /permissions/roles` — current role → permission matrix
- [ ] `PATCH /permissions/roles` — Super Admin toggles grant/revoke per role
- [ ] In-memory cache: `permissions:{role}` key, 5 min TTL
- [ ] Cache invalidation: delete key on save, repopulate on next request

#### `users/` module
- [ ] `GET /users` — branch-scoped list
- [ ] `POST /users` — Admin / Super Admin
- [ ] `PATCH /users/:id` — Admin / Super Admin
- [ ] `PATCH /users/:id/role` — role assignment; one active role per user enforced

#### `workers/` module (branch-scoped roster — not system users)
- [ ] `GET /workers` — active workers for caller's branch
- [ ] `POST /workers` — Branch Manager / Admin
- [ ] `PATCH /workers/:id` — Branch Manager / Admin (deactivate sets `is_active = false`)
- [ ] `WorkersService.isInBranch(workerId, branchId)` — called by Work Orders to enforce BR19
- [ ] Deactivated workers hidden from assignment dropdowns; remain on historical records (BR20)

#### `customers/` module
- [ ] `GET /customers` — search by phone (branch-scoped)
- [ ] `POST /customers` — Supervisor creates minimal record (phone + name); Cashier completes later
- [ ] `PATCH /customers/:id` — Cashier completes profile (address, type, company, email)
- [ ] Phone UNIQUE constraint enforced at DB level; service returns `ERR.CUSTOMER_PHONE_EXISTS` on conflict

#### Seed script update
- [ ] 2 branches with configs (30% customized advance, 0% standard)
- [ ] 1 user per role per branch
- [ ] Default role permissions from plan-v6 §7 inserted into `ROLE_PERMISSION`
- [ ] Worker roster: 3–4 workers per branch
- [ ] 2–3 sample customers

### Frontend

#### `routes/settings/` pages
- [ ] `settings/users.tsx` — user list + create/edit (Admin)
- [ ] `settings/permissions.tsx` — role × permission grid (Super Admin only)
- [ ] `settings/workers.tsx` — worker roster (Branch Manager / Admin)
- [ ] `settings/branch-config.tsx` — min advance %, stock override toggle (Branch Manager / Admin)

#### `modules/permissions/`
- [ ] `PermissionsMatrix.tsx` — role × permission grid with live toggles; saving invalidates cache
- [ ] `usePermissionsMatrix.ts` — fetch + patch permissions

#### `modules/workers/`
- [ ] Worker list with active/inactive filter
- [ ] Create / edit / deactivate worker form

#### `modules/customers/`
- [ ] Customer search by phone (used during Job Card creation)
- [ ] Customer profile completion form (Cashier view)
- [ ] Business vs Individual type toggle revealing company fields

#### Sidebar navigation
- [ ] Role-aware sidebar: items rendered only if `can()` returns true
- [ ] Active branch selector for Manager / Super Admin (cross-branch users)

---

## Phase 4 — Price List, Job Cards, Work Orders, Cashier Queue 🔲

> Price List must be built first — it is a runtime dependency of Work Order price resolution.
> Gate Passes are built here because they are required by the Customer-Supplied Materials flow (UC-03).

### Backend

#### `price-list/` module
- [ ] `GET /price-list` — list entries (branch-scoped + master template)
- [ ] `POST /price-list` — Super Admin creates master; Branch Manager overrides for their branch
- [ ] `PATCH /price-list/:id` — update rate
- [ ] `DELETE /price-list/:id` — soft delete (`is_active = false`)
- [ ] `PriceListService.lookup(workType, materialType, branchId)`:
  - Check branch-specific entry → master template (null branch_id) → return null
  - Null result → caller auto-sets `is_customized = true` (FR22 / BR17)
  - Results cached 10 min (`PRICE_LIST_CACHE_TTL_MS`); invalidate on save
- [ ] Seed: full price list for both test branches covering all work types

#### `job-cards/` module
- [ ] `GET /job-cards` — list with filters (status, branch, date); branch-scoped
- [ ] `POST /job-cards` — Supervisor / Chief creates with at least one Work Order
- [ ] `GET /job-cards/:id` — full detail with work orders, payments summary, balance_due
- [ ] `PATCH /job-cards/:id/status` — state machine gate via `canTransition(from, to, role)`; logs to `JOB_STATUS_LOG`
- [ ] `POST /job-cards/:id/cancel` — cancellation request with reason; BR14 / BR15 / BR15A enforcement
- [ ] `job-cards.state-machine.ts` — thin wrapper calling `canTransition()` from `@erp/shared`
- [ ] Optimistic locking: every PATCH sends `version`; 0 rows → `ERR.JOB_CARD_VERSION_CONFLICT` (409)
- [ ] `actor_role_at_creation` captured from JWT at creation time (BR22)
- [ ] Auto-generate unique `job_card_number` (e.g. `JC-2026-0001`)
- [ ] `SSE /job-cards/events?branchId=` — pushes new DRAFT cards to Cashier sessions (Cashier Queue)

#### `work-orders/` module
- [ ] `POST /work-orders` — add Work Order to an existing Job Card
- [ ] `PATCH /work-orders/:id/status` — state machine gate; stock deduction on → IN_PROGRESS (BR10 / FR16)
- [ ] `POST /work-orders/:id/notes` — append-only note; no UPDATE / DELETE ever exposed
- [ ] `POST /work-orders/:id/inspect` — Supervisor marks COMPLETED; auto-records inspector (BR07)
- [ ] `POST /work-orders/:id/attachments` — file upload (S3-compatible or local)
- [ ] `work-orders.service.ts` private methods:
  - `validateSpec(dto)` — Zod discriminated union per model (CutBend / Rolling / CoilCut)
  - `resolvePrice(dto)` — Amano rule (FR04); price list lookup; auto-customized flag
  - `assignWorkers(dto, actor)` — enforces BR03 (≥1 worker) and BR19 (branch isolation)
- [ ] `actor_role_at_creation` captured from JWT (BR22)
- [ ] Auto-generate unique `work_order_number`
- [ ] Optimistic locking on every PATCH

#### `gate-passes/` module (thin — no repository)
- [ ] `POST /gate-passes` — Supervisor creates when customer brings own materials (UC-03)
- [ ] `PATCH /gate-passes/:id/close` — close pass on job completion
- [ ] `GET /gate-passes/:passNumber` — **public, no auth** — QR code scan endpoint
- [ ] Link `gate_pass_id` on the relevant Work Order

#### `notifications/` — status change events
- [ ] pg-boss handler `send-notification` — routes to `log` / `smtp` / `whatsapp` by env
- [ ] Trigger on: Work Order COMPLETED, Job Card CLOSED, Job Card VOIDED

### Frontend

#### `modules/price-list/`
- [ ] Price list table — grouped by work type
- [ ] Create / edit rate form (Branch Manager overrides shown distinctly from master)

#### `modules/job-cards/`
- [ ] `JobCardTable.tsx` — list with status filter, date filter, search by number / customer phone
- [ ] `JobCardForm.tsx` — multi-step create: customer search / create → add work orders → review
- [ ] `JobCardDetail.tsx` — header (status, customer, balance_due) + tabbed body (Work Orders | Payments | Ledger | Delivery | Gate Pass)
- [ ] `JobCardStatusStepper.tsx` — visual status bar; buttons only shown if `canTransition()` returns true
- [ ] `JobCardFilters.tsx`
- [ ] `CancellationModal.tsx` — reason code + material consumed attestation (BR15)
- [ ] `useJobCardSSE.ts` — SSE subscription for live status updates on detail page

#### `modules/cashier-queue/`
- [ ] `CashierQueue.tsx` — SSE-driven live list of DRAFT job cards; sorted by creation time; branch-scoped
- [ ] `PhoneSearchBar.tsx` — filter queue by customer phone
- [ ] `CashierQueueRow.tsx` — customer, WO count, total, advance required; `[Process →]` opens payment drawer
- [ ] `useCashierQueueSSE.ts` — new DRAFT cards appear without page refresh
- [ ] Route: `routes/cashier-queue/index.tsx`

#### `modules/work-orders/`
- [ ] `WorkOrderForm.tsx` — shell that renders the correct spec sub-component:
  - `specs/CutBendFields.tsx` — thickness / gauge dropdown; Amano rule hides thickness, shows length (FR04)
  - `specs/RollingFields.tsx` — material type, work type, size dropdowns (predefined from `rolling-work-types.ts`)
  - `specs/CoilCutFields.tsx` — weight (kg) input only
- [ ] `WorkOrderList.tsx` + `WorkOrderCard.tsx`
- [ ] `WorkOrderStatusNotes.tsx` — append-only thread with add-note form
- [ ] `WorkOrderInspectionForm.tsx` — mark complete after QC
- [ ] `WorkOrderAttachments.tsx` — drag-and-drop file upload
- [ ] `WorkerMultiSelect.tsx` — searchable multi-select from branch roster

#### `modules/gate-passes/`
- [ ] Gate pass detail (public page — no auth required)
- [ ] Gate pass creation form (Supervisor, within Work Order flow)

---

## Phase 5 — Inventory, Material Orders, Goods Issue 🔲

### Backend

#### `inventory/` module
- [ ] `GET /inventory` — stock list with low-stock filter (branch-scoped)
- [ ] `GET /inventory/:id/movements` — stock movement history
- [ ] `PATCH /inventory/:id` — update item details / threshold (Admin)
- [ ] `POST /inventory` — create new item (Admin)
- [ ] Atomic stock deduction on Work Order → IN_PROGRESS:
  ```sql
  UPDATE hardware_store_item
  SET stock_quantity = stock_quantity - :amount
  WHERE item_id = :id AND stock_quantity >= :amount
  ```
  0 rows affected → `ERR.STOCK_INSUFFICIENT` — transition blocked; Branch Manager can override with password (BRANCH_CONFIG.stock_override_password_hash)
- [ ] `handlers/stock-alert.handler.ts` — pg-boss cron (hourly); creates `STOCK_ALERT` if below threshold

#### `material-orders/` module
- [ ] `POST /material-orders` — Supervisor requests materials from branch stock for a job
- [ ] `PATCH /material-orders/:id/confirm` — confirm payment; triggers stock deduction (BR10 / FR15)
- [ ] `GET /material-orders?jobCardId=` — list orders for a job card

#### `goods-issue/` module
- [ ] `POST /goods-issue` — request inter-branch transfer (Branch Manager / Supervisor)
- [ ] `PATCH /goods-issue/:id/issue` — source Branch Manager approves; deducts source stock immediately (BR12)
- [ ] `PATCH /goods-issue/:id/confirm` — target branch confirms receipt; adds to target stock
- [ ] `GET /goods-issue` — list with status filter

### Frontend

#### `modules/inventory/`
- [ ] Stock list with low-stock highlight + threshold badge
- [ ] Movement history timeline per item
- [ ] Create / edit item form (Admin)
- [ ] Stock alert acknowledgement

#### `modules/material-orders/`
- [ ] Material request form (linked to a Job Card)
- [ ] Order list per job card (shown in Job Card detail tab)

#### `modules/goods-issue/`
- [ ] Goods issue list with status filter
- [ ] Create transfer request form
- [ ] Approve / confirm workflow UI

---

## Phase 6 — Payments, Financial Ledger, Invoices, PDF 🔲

> Payments and ledger entries are written in the same `QueryRunner` transaction. If either fails, both roll back.
> `LedgerService` is the only writer to `LEDGER_ENTRY` — no other service inserts ledger rows directly.
> No cash refunds on cancellation — BR16 is absolute.

### Backend

#### `payments/` module
- [ ] `POST /payments` — record Advance, Partial, or Final payment against a Job Card
  - Blocked if offline (`ERR.PAYMENT_OFFLINE_BLOCKED`)
  - Minimum advance check against `BRANCH_CONFIG` (BR09 / FR11)
  - Atomic `QueryRunner`: save `PAYMENT` row + call `LedgerService.recordPayment()` in same transaction
  - On commit: update `balance_due` on Job Card; emit audit event
- [ ] `POST /payments/:id/reverse` — Super Admin / Admin reversal; creates reversal ledger entries (no DELETE)
- [ ] `GET /payments?jobCardId=` — payment history for a job card

#### `ledger/` module — no HTTP controller; internal only
- [ ] `LedgerService.recordPayment(payment, actor, em?)`:
  - Advance payment → DEBIT 1200 (Cash) + CREDIT 2100 (Advance Payments Received)
  - Final payment → DEBIT 1200 + DEBIT 2100 (clears advance) + CREDIT 4000 (Service Revenue)
  - Accepts optional `EntityManager` — uses caller's transaction if provided
- [ ] `LedgerService.recordCancellationLoss(payment, actor, em?)`:
  - Paid advance → DEBIT 5200 (Cancelled Job Loss); advance stands; no cash moves (BR16)
- [ ] `LedgerService.recordStockDeduction(line, actor, em?)` — DEBIT 5100 (Material Cost)
- [ ] `LedgerRepository` — balance queries, branch financial summary by date range
- [ ] Nightly pg-boss cron: reconcile cached `balance_due` against full ledger sum; log mismatch

#### `invoices/` module
- [ ] `POST /invoices` — Cashier generates invoice after payment recorded
  - Creates `INVOICE` row synchronously
  - Enqueues `generate-invoice-pdf` pg-boss job (PDF is async — does not block HTTP response)
  - Triggers Job Card → IN_QUEUE transition (BR05)
- [ ] `GET /invoices/:id` — invoice detail with PDF URL
- [ ] `GET /invoices/:id/pdf` — redirect to stored PDF
- [ ] `handlers/invoice-pdf.handler.ts` — Puppeteer renders HTML → PDF; uploads to storage; updates `pdf_url`
- [ ] Invoice PDF includes: per-Work Order line items, advance paid, balance due (FR27)

#### Cancellation workflow — complete implementation
- [ ] `POST /job-cards/:id/cancel` — creates `CANCELLATION_REQUEST`; moves Job Card to `CANCELLATION_PENDING`
- [ ] `PATCH /job-cards/:id/cancel/:requestId/approve` — Branch Manager approves:
  - Records material consumption attestation (BR15)
  - IN_PROGRESS WO with consumed materials → loss entry on 5200
  - IN_PROGRESS WO with materials not consumed → stock reversal
  - COMPLETED WOs → all fully consumed, no reversal (BR15A)
  - Moves Job Card to VOIDED
- [ ] `PATCH /job-cards/:id/cancel/:requestId/reject` — restores previous status

### Frontend

#### `modules/payments/`
- [ ] Payment modal — amount, mode (Cash / Card / Transfer), type (Advance / Final / Partial)
- [ ] Minimum advance validation shown inline before submit
- [ ] Offline block — payment form disabled with clear message when `useOnlineStatus()` is false
- [ ] Payment history list within Job Card detail

#### `modules/invoices/`
- [ ] Invoice list page
- [ ] Invoice detail with PDF viewer / download
- [ ] Print layout for browser print (`PrintLayout.tsx`)

#### `modules/ledger/`
- [ ] `LedgerTable.tsx` — virtualized (TanStack Virtual); thousands of rows without jank
- [ ] `LedgerFilters.tsx` — date range, account type, branch
- [ ] `JobCardLedgerPanel.tsx` — mini ledger inside Job Card detail tab

---

## Phase 7 — Offline Sync, Conflict Queue, Notifications, Audit Log, Supporting Modules 🔲

### Backend

#### `offline-sync/` module
- [ ] `POST /offline-sync/flush` — receives batched events from tablet; processes in `created_at` order
  - Rejects payment events (`ERR.SYNC_PAYMENT_BLOCKED`)
  - Rejects events older than `OFFLINE_SYNC_MAX_AGE_HOURS` (`ERR.SYNC_EVENT_TOO_OLD`)
  - Optimistic lock mismatch → saves to `CONFLICT_QUEUE`; continues processing remaining events
  - Returns `{ accepted: string[], conflicts: ConflictSummary[] }`
- [ ] `GET /offline-sync/conflicts` — list pending conflicts (Branch Manager / Admin)
- [ ] `PATCH /offline-sync/conflicts/:id` — resolve or dismiss a conflict

#### `audit-logs/` module — complete wiring
- [ ] `GET /audit-logs` — paginated list with filters (entity type, date, user, branch) — Auditor / Admin / Manager
- [ ] Confirm `audit-log.listener.ts` handles all events from: payments, job card transitions, work order transitions, permission changes, cancellations

#### `petty-cash/` module (thin)
- [ ] `POST /petty-cash` — record small cash expense; requires Branch Manager approval above threshold
- [ ] `PATCH /petty-cash/:id/approve` — Branch Manager approval
- [ ] `GET /petty-cash` — list with status filter

#### `deliveries/` module (thin)
- [ ] `POST /deliveries` — record job handover (method: pickup or delivery, recipient name, notes)
- [ ] `GET /deliveries?jobCardId=` — delivery record for a job card

#### `notifications/` module — complete wiring
- [ ] `GET /notifications?jobCardId=` — notification history per job card with delivery status
- [ ] Confirm pg-boss handler fires on: WO COMPLETED, JC CLOSED, JC VOIDED

### Frontend

#### `modules/offline-sync/`
- [ ] `OfflineBanner.tsx` — yellow banner at top when tablet loses internet; mounted in `__root.tsx`
- [ ] `OfflineSyncStatus.tsx` — queued event count + sync in-progress indicator
- [ ] `ConflictQueueTable.tsx` — jsondiffpatch diff view (green added / red removed) per conflict; resolve / dismiss actions
- [ ] Route: `routes/offline-sync/index.tsx` (Admin only)

#### `modules/audit-logs/`
- [ ] `AuditLogTable.tsx` — virtualized (TanStack Virtual); click row → jsondiffpatch diff panel
- [ ] `AuditLogFilters.tsx` — entity type, date range, user, action
- [ ] Route: `routes/audit-log/index.tsx`

#### `modules/petty-cash/`
- [ ] Expense record form + approval list

#### `modules/deliveries/`
- [ ] Delivery record form (within Job Card detail — Delivery tab)

#### `modules/notifications/`
- [ ] Notification history list per job card (read-only)

---

## Phase 8 — Polish, Reports, E2E, Tablet Pass, Legacy Import 🔲

### Backend
- [ ] `scripts/migrate-legacy.ts` — one-shot legacy import (NFR08):
  - Input CSV: `customer_phone, customer_name, customer_type, job_type, material, quantity, status, outstanding_balance`
  - Output: `JOB_CARD` with `is_legacy = true` + linked `LEGACY_IMPORT` rows
  - `outstanding_balance > 0` → opening ledger entry on account 1100
  - Failures → `migration-errors.csv`; nothing silently skipped
  - Idempotent keyed on `legacy_reference`; `--dry-run` required before `--confirm`
- [ ] Revenue by branch / period endpoint
- [ ] Technician productivity endpoint
- [ ] Inventory turnover endpoint

### Frontend
- [ ] Dashboard KPIs + live queue stats (Recharts)
- [ ] Reports module (enabled via `VITE_FEATURE_REPORTS=true`)
- [ ] Tablet responsive audit — Supervisor and Chief screens (NFR01)
- [ ] Offline banner + sync status shown on all Supervisor / Chief routes

### Testing
- [ ] Vitest: state machines — every valid and invalid transition (target 100%)
- [ ] Vitest: ledger logic — every payment type, balance calculation, cancellation loss
- [ ] Vitest: permissions service — cache hit/miss, grant/revoke, SUPER_ADMIN bypass
- [ ] Vitest: service business rules — BR rules, stock deduction, price lookup chain
- [ ] Vitest: price list lookup — branch → master → null → auto-Customized
- [ ] Supertest: API endpoints — happy paths + 403 / 409 / 422
- [ ] Vitest (jsdom): offline queue — queue, sync, conflict detection, payment block
- [ ] Playwright E2E: full job card lifecycle (Draft → In Queue → In Progress → Closed)
- [ ] Playwright E2E: payment + ledger balance reconciliation
- [ ] Playwright E2E: offline sync with conflict resolution

### Performance + Security audit
- [ ] Bundle size audit — lazy-loaded routes for non-critical modules
- [ ] Slow query audit — EXPLAIN ANALYZE on queue + ledger endpoints
- [ ] Virtual list coverage — ledger and audit log tables confirmed smooth at 10k rows
- [ ] Auth bypass check — all protected routes return 401 without valid token
- [ ] Branch isolation check — Branch A user cannot read Branch B data
- [ ] Rate limit check — auth endpoints enforce 10/60s

---

## Architecture Quick Reference

| Concern | Decision |
|---------|----------|
| Auth | JWT Bearer only (no cookies), JTI session table |
| Token rotation | New pair on every refresh; replay → revoke all |
| Roles | One per user, enforced at DB level; permissions dynamic via `ROLE_PERMISSION` |
| Real-time | SSE (not WebSockets) — in-process via EventEmitter2 |
| Offline | IndexedDB queue in `packages/offline-queue`; payments never queued |
| Background jobs | pg-boss (PostgreSQL, no Redis) |
| Response shape | `{ data }` success / `{ error: { code, message } }` failure |
| Rate limiting | Throttler guard — 100/60s global, 10/60s on auth |
| Money | Stored as integers (cents); divided by 100 only in `shared/lib/format.ts` |
| State machines | `canTransition(from, to, role)` from `@erp/shared` — only gate for status changes |
| Ledger | Double-entry; payment + ledger entries in same QueryRunner transaction |
| Optimistic locking | Every mutating request sends `version`; 0 rows → 409 |
| SUPER_ADMIN | Bypasses `PermissionsGuard` in code — never in DB |
| Append-only tables | `audit_log`, `work_order_status_note`, `job_status_log`, `ledger_entry` — REVOKE at DB level |

---

## DB Tables

### Live (Phases 1–2)
| Table | Purpose |
|-------|---------|
| `user` | System accounts |
| `user_role` | Role assignments (1 active per user) |
| `user_session` | JWT session tracking |

### Added in Phase 2B (single consolidated migration)
| Table | Purpose |
|-------|---------|
| `branch` | Branch offices |
| `branch_section` | Workshop / Hardware sections per branch |
| `branch_config` | Min advance %, stock override password; 1:1 with branch |
| `permission` | All available permissions |
| `role_permission` | Role → permission grants (dynamic RBAC) |
| `worker` | Shop-floor roster; not system users |
| `work_order_worker` | Junction: WO ↔ workers |
| `customer` | Customer records; phone globally unique |
| `job_card` | Parent order record |
| `job_status_log` | Append-only status history |
| `work_order` | Individual operations on a job card |
| `work_order_status_note` | Append-only comment thread per WO |
| `work_order_inspection` | QC inspection records |
| `work_order_attachment` | File references per WO |
| `price_list_entry` | Rates per work type; null branch = master template |
| `material_order` + `material_order_line` | Branch stock requests per job |
| `hardware_store_item` | Branch stock catalogue |
| `stock_movement` | All stock in/out events |
| `stock_alert` | Low stock notifications |
| `goods_issue` + `goods_issue_line` | Inter-branch transfers |
| `financial_account` | Chart of accounts (7 accounts, seeded) |
| `ledger_entry` | Append-only double-entry ledger |
| `payment` | Payment records |
| `invoice` | Invoice records with PDF URL |
| `delivery` | Job handover records |
| `cancellation_request` | Approval workflow for voids |
| `conflict_queue` | Offline sync conflicts |
| `gate_pass` + `gate_pass_item` | Customer-supplied material passes |
| `petty_cash` | Small cash expenses |
| `notification` | Outbound notification log |
| `audit_log` | Immutable audit trail |
| `legacy_import` | One-shot migration reference |

---

## API Routes

### Live
| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | Public |
| GET | `/health/run` | Public |
| POST | `/auth/login` | Public |
| POST | `/auth/refresh` | Public |
| GET | `/auth/me` | Bearer |
| POST | `/auth/logout` | Bearer |
| POST | `/auth/logout/all` | Bearer |

### Added in Phase 3
| Method | Path | Notes |
|--------|------|-------|
| GET / POST | `/branches` | |
| PATCH | `/branches/:id` | |
| GET / PATCH | `/branches/:id/config` | |
| GET / PATCH | `/permissions/roles` | Super Admin |
| GET / POST / PATCH | `/users` + `/users/:id` | |
| PATCH | `/users/:id/role` | |
| GET / POST / PATCH | `/workers` + `/workers/:id` | |
| GET / POST / PATCH | `/customers` + `/customers/:id` | |

### Added in Phase 4
| Method | Path | Notes |
|--------|------|-------|
| GET / POST / PATCH | `/price-list` + `/:id` | |
| GET / POST | `/job-cards` | |
| GET / PATCH | `/job-cards/:id` | |
| PATCH | `/job-cards/:id/status` | State machine gated |
| POST | `/job-cards/:id/cancel` | |
| GET (SSE) | `/job-cards/events` | Cashier Queue push |
| POST / PATCH / GET | `/work-orders` + `/:id` | |
| POST | `/work-orders/:id/notes` | Append-only |
| POST | `/work-orders/:id/inspect` | |
| POST | `/work-orders/:id/attachments` | |
| GET / POST / PATCH | `/gate-passes` + `/:passNumber` | GET is public |

### Added in Phase 5
| Method | Path | Notes |
|--------|------|-------|
| GET / POST / PATCH | `/inventory` + `/:id` | |
| GET | `/inventory/:id/movements` | |
| GET / POST / PATCH | `/material-orders` + `/:id` | |
| GET / POST / PATCH | `/goods-issue` + `/:id` | |

### Added in Phase 6
| Method | Path | Notes |
|--------|------|-------|
| GET / POST | `/payments` | Online only |
| POST | `/payments/:id/reverse` | Admin |
| GET / POST | `/invoices` + `/:id` | |
| GET | `/invoices/:id/pdf` | |
| PATCH | `/job-cards/:id/cancel/:requestId/approve` | |
| PATCH | `/job-cards/:id/cancel/:requestId/reject` | |

### Added in Phase 7
| Method | Path | Notes |
|--------|------|-------|
| POST | `/offline-sync/flush` | |
| GET / PATCH | `/offline-sync/conflicts` + `/:id` | |
| GET | `/audit-logs` | Auditor / Admin |
| GET / POST / PATCH | `/petty-cash` + `/:id` | |
| GET / POST | `/deliveries` + `/:id` | |
| GET | `/notifications` | |

---

## Key Files

| File | Purpose |
|------|---------|
| `plan-v6.md` | Master plan — all technical decisions; source of truth |
| `ER-v4.md` | Entity relationship diagram |
| `Saniro-workshop-PRD-v4.md` | Product requirements |
| `ONBOARDING.md` | Dev environment setup |
| `Instructions/instructions1.md` | Phase 1 spec (done) |
| `Instructions/instructions2.md` | Phase 2 spec (done) |
| `apps/api/src/common/errors.ts` | Every error code — defined in Phase 2B |
| `packages/shared/src/errors.ts` | Re-exports `ERR` for frontend use |
| `packages/shared/src/state-machines/` | `canTransition()` — only gate for status changes |
| `packages/shared/src/enums/` | All status / type enums |
| `packages/shared/src/schemas/` | Zod schemas — API boundary + form validation |
| `packages/shared/src/constants/` | Predefined material lists, thickness options, rolling work types |
| `packages/offline-queue/` | IndexedDB queue (browser only — never import in API) |
| `apps/api/src/modules/ledger/` | No controller — internal only; only writer to `ledger_entry` |
| `apps/api/src/database/migrations/` | All schema changes — `synchronize: false` everywhere |
| `scripts/seed.ts` | Idempotent dev seed |
| `scripts/migrate-legacy.ts` | One-shot legacy import (Phase 8) |
