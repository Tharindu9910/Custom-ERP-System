# Frontend Folder Structure — Plain English Guide

> `apps/web/src/` — React 19 + Vite 6 frontend
>
> **The golden rule:** route files are thin shells, modules own their own API calls and cache keys, shared/ holds anything used by more than one module.

---

## Entry Point — Where the App Starts

### `main.tsx`

The very first file React runs. It finds the `<div id="root">` in your HTML file and mounts the entire app inside it. That's all it does — one job, done cleanly. It hands off immediately to `providers.tsx` which handles all the global setup.

> You almost never touch this file.

---

### `env.ts`

The only place allowed to read environment variables. In a Vite app, env variables are accessed via `import.meta.env.VITE_API_BASE_URL`. The rule in this project: **no file is allowed to do that except this one.**

This file reads all the `VITE_*` variables, validates they exist, and exports them as typed constants. Every other file imports from `env.ts` instead.

```typescript
// ✓ Every other file does this:
import { env } from '@/env'
const url = env.API_BASE_URL

// ✗ Never this anywhere else:
const url = import.meta.env.VITE_API_BASE_URL
```

If an env variable is missing or renamed, you find out in one place — not scattered across 20 files.

---

## `app/` — Global Setup That Wraps Everything

### `app/providers.tsx`

Wraps the whole app in everything it needs to function. Think of providers as setup that happens before any actual content renders. This file stacks them all:

```tsx
<QueryClientProvider>    ← data fetching (TanStack Query)
  <RouterProvider>       ← page navigation
    <ThemeProvider>      ← light/dark mode
      <App />            ← your actual app
    </ThemeProvider>
  </RouterProvider>
</QueryClientProvider>
```

Keeping all providers in one file means you always know where to look when adding something global.

---

### `app/router.tsx`

Connects URL paths to pages. Sets up TanStack Router — reads the files inside `routes/` and automatically creates the route map. `/job-cards` maps to `routes/job-cards/index.tsx`, `/job-cards/abc-123` maps to `routes/job-cards/$jobCardId.tsx`, and so on. Routes are fully typed — TypeScript knows which URL parameters exist on which routes.

---

### `app/ability.ts`

Turns the server's permission list into something React can check. When you log in, the server sends back a list like `["create:job_card", "process:payment"]`. This file takes that list and builds a CASL "ability" object from it.

Once built, any component can call `can('create', 'job_card')` and get a true/false answer — which controls whether a button is visible or a route is accessible.

```typescript
// Built once at login:
const ability = buildAbility(["create:job_card", "process:payment"])

// Used in any component:
if (can('create', 'job_card')) {
  // show the "New Job Card" button
}
```

> Permissions are not hardcoded by role. A Supervisor has whatever permissions the Super Admin assigned to that role in the database.

---

## `routes/` — One File Per Page

Route files are thin shells. They import the real component from `modules/` and render it. No logic lives here — just the URL-to-component connection.

---

### `routes/__root.tsx`

The invisible wrapper around every single page. In TanStack Router, `__root.tsx` wraps every other route. It renders things that should appear on every page — like the offline banner at the top or global toast notifications. Think of it as the outermost shell of the UI.

---

### `routes/login.tsx`

The login page — the only page that doesn't require being logged in. If you're already logged in and visit this route, it redirects you to the dashboard.

---

### `routes/_layout.tsx`

The sidebar + header shell that wraps all authenticated pages. The underscore prefix (`_layout`) is a TanStack Router convention meaning "this is a layout, not a page." It renders the sidebar and top header, and puts an `<Outlet />` in the middle where the actual page content appears.

It also acts as the auth gate — if you're not logged in and try to visit any protected page, this layout redirects you to `/login`.

```
┌─────────────────────────────────┐
│  [Sidebar]  │  [Header]         │
│             ├───────────────────│
│  - Job Cards│  <Outlet />       │
│  - Payments │  (page goes here) │
│  - Settings │                   │
└─────────────────────────────────┘
```

---

### `routes/index.tsx`

The dashboard at `/` — what you see after logging in. Shows summary stats, live queue counts, and quick links. Different roles see a different version.

---

### `routes/job-cards/index.tsx`

The job cards list page at `/job-cards`. A thin shell that just renders `JobCardTable` from `modules/job-cards/`. Almost no code in the file itself.

---

### `routes/job-cards/$jobCardId.tsx`

The detail page for one specific job card. The `$` prefix means this is a dynamic route — the URL `/job-cards/abc-123` renders this file with `jobCardId = "abc-123"`. It reads that ID and passes it to `JobCardDetail` from the modules folder.

Other dynamic routes follow the same pattern: `$customerId.tsx`, `$itemId.tsx`, `$invoiceId.tsx`, `$passNumber.tsx`.

---

### `routes/gate-passes/$passNumber.tsx`

The only public page — customers can open this without logging in. When a customer brings their own materials, a gate pass is printed with a QR code. Scanning that QR code opens this page with no auth check required.

---

### `routes/settings/`

Four admin pages, each restricted to different roles:

| File | Purpose | Who sees it |
|---|---|---|
| `users.tsx` | Manage system user accounts | Admin |
| `permissions.tsx` | Configure role permissions | Super Admin only |
| `workers.tsx` | Manage shop-floor worker roster | Branch Manager / Admin |
| `branch-config.tsx` | Min advance %, stock override password | Branch Manager / Admin |

---

## `modules/` — The Real Work Happens Here

Every feature has its own module folder. Each module is self-contained — its API calls, cache keys, components, and hooks all live together.

### The module pattern

Every non-trivial module follows this structure:

| File / Folder | Responsibility |
|---|---|
| `api.ts` | All fetch calls for this feature. Hooks never call the API directly — they go through here. |
| `query-keys.ts` | Cache key definitions, colocated here — never in a central shared file. |
| `components/` | React components (UI only). They display data and handle interactions — no fetch calls inside. |
| `hooks/` | Custom hooks that call `api.ts` and handle loading/error states. Bridges components and the API. |

```typescript
// api.ts — typed fetch functions
export const jobCardsApi = {
  list:   (filters) => apiClient.get('/job-cards', { params: filters }),
  detail: (id)      => apiClient.get(`/job-cards/${id}`),
  create: (dto)     => apiClient.post('/job-cards', dto),
}

// query-keys.ts — colocated cache keys
export const jobCardKeys = {
  all:    ['job-cards'] as const,
  list:   (filters?) => [...jobCardKeys.all, 'list', filters] as const,
  detail: (id)       => [...jobCardKeys.all, id] as const,
}

// hooks/useJobCard.ts — imports from both
export function useJobCard(id: string) {
  return useQuery({
    queryKey: jobCardKeys.detail(id),
    queryFn:  () => jobCardsApi.detail(id),
  })
}
```

**Thin modules** (notifications, audit-logs, petty-cash, deliveries, gate-passes) have so few files that they skip the `components/` and `hooks/` subfolders — files live flat inside the module folder.

---

### `modules/job-cards/` ⭐ Core module

The most important module — one card per customer visit.

**`api.ts`** — list job cards, get one by ID, create, update status, request cancellation.

**`query-keys.ts`** — cache keys like `jobCardKeys.detail('abc-123')`.

**Components:**

| File | What it does |
|---|---|
| `JobCardTable.tsx` | The list view — shows all job cards with status badges and filters |
| `JobCardDetail.tsx` | The full detail view of one job card — work orders, payments, and ledger |
| `JobCardStatusStepper.tsx` | The visual status bar — Draft → In Queue → In Progress → Closed |
| `JobCardForm.tsx` | The form for creating a new job card |
| `JobCardFilters.tsx` | The filter bar above the table — by status, branch, date |
| `CancellationModal.tsx` | The modal that appears when a Branch Manager requests to cancel |

**Hooks:**

| File | What it does |
|---|---|
| `useJobCards.ts` | Fetches the list of job cards with filters |
| `useJobCard.ts` | Fetches one specific job card by ID |
| `useCreateJobCard.ts` | Handles submitting the create form |
| `useUpdateJobCardStatus.ts` | Handles status transitions (e.g. move to In Progress) |
| `useJobCardSSE.ts` | Listens for live updates over SSE — list updates in real-time without refresh |
| `useCancellationRequest.ts` | Handles submitting a cancellation request |

---

### `modules/cashier-queue/` — Live

The Cashier's main working screen. Shows all job cards waiting for payment, sorted by creation time. When a Supervisor creates a new job card, it appears here automatically — no page refresh needed.

| File | What it does |
|---|---|
| `CashierQueue.tsx` | The full queue view — list container with search bar at the top |
| `CashierQueueRow.tsx` | One row in the queue — customer name, phone, work order count, amount due |
| `PhoneSearchBar.tsx` | Search input — Cashier types a phone number to find a specific customer |
| `useCashierQueue.ts` | Fetches the current queue from the API |
| `useCashierQueueSSE.ts` | Keeps the queue live — listens for new job cards from the server and updates the list automatically |

> SSE stands for Server-Sent Events. It's a one-way connection where the server pushes updates to the browser. When a Supervisor saves a job card, the server pushes it to all connected Cashier sessions at that branch — instantly.

---

### `modules/work-orders/` ⭐ Core module

Each work order is one operation — Cut, Bend, Pipe Bending, Coil Cutting, etc. This module has the most complex form in the whole app because each operation type has completely different fields.

**`WorkOrderForm.tsx` is a shell.** It doesn't render any spec fields itself. Based on the selected work order type, it renders one of three sub-components from `specs/`:

```
WorkOrderForm.tsx          ← shell: controls steps and submit only
  specs/
    CutBendFields.tsx      ← fields for Cut and Bend jobs
    RollingFields.tsx      ← fields for Rolling jobs
    CoilCutFields.tsx      ← fields for Coil Cutting
```

**The `specs/` files explained:**

| File | What it handles |
|---|---|
| `CutBendFields.tsx` | Thickness dropdown, quantity. Has the **Amano rule**: if material is "Amano", hides the thickness field and shows a length field instead |
| `RollingFields.tsx` | Material type, work type, size dropdowns |
| `CoilCutFields.tsx` | Just a weight (kg) input — Coil Cutting is priced by weight, not quantity |

**All components:**

| File | What it does |
|---|---|
| `WorkOrderList.tsx` | Shows all work orders within a job card |
| `WorkOrderCard.tsx` | A single work order card showing its status, type, and price |
| `WorkOrderForm.tsx` | The form shell — handles steps and submission |
| `WorkOrderFormSummary.tsx` | The review step before submitting — shows everything the Supervisor entered |
| `WorkOrderInspectionForm.tsx` | The form a Supervisor fills when marking a work order complete after QC |
| `WorkOrderAttachments.tsx` | File upload area for photos of the completed work |
| `WorkOrderStatusNotes.tsx` | The append-only comment thread on a work order — shows all notes and has the add-note form |
| `WorkerMultiSelect.tsx` | Searchable multi-select dropdown for assigning workers to this work order |

**Hooks:**

| File | What it does |
|---|---|
| `useWorkOrders.ts` | Fetches the list of work orders for a job card |
| `useCreateWorkOrder.ts` | Handles submitting the create form |
| `useInspectWorkOrder.ts` | Handles marking a work order as complete |
| `useAddStatusNote.ts` | Handles adding a note to the append-only thread |

---

### `modules/ledger/`

Shows the financial ledger entries. The main table can have thousands of rows so it uses **TanStack Virtual** — only the rows currently visible on screen are actually rendered in the DOM, keeping performance fast.

| File | What it does |
|---|---|
| `LedgerTable.tsx` | The virtualized table — handles large lists without slowing down the browser |
| `LedgerFilters.tsx` | Filter bar — by date range, account type, branch |
| `JobCardLedgerPanel.tsx` | A mini version of the ledger inside the Job Card detail view — shows just the entries for that one job |
| `useLedgerEntries.ts` | Fetches ledger entries with filters |

---

### `modules/permissions/`

A grid where rows are permissions and columns are roles. Each cell is a toggle. Super Admin checks or unchecks them. Saving immediately invalidates the server's permission cache.

| File | What it does |
|---|---|
| `PermissionsMatrix.tsx` | The full role × permission grid with live toggles |
| `usePermissionsMatrix.ts` | Fetches the current permission settings and handles saving changes |

---

### `modules/offline-sync/`

All offline-related UI lives in this one folder — there is no separate `offline/` folder anywhere else in the project.

| File | What it does |
|---|---|
| `OfflineBanner.tsx` | The yellow banner that appears at the top when the tablet loses internet |
| `OfflineSyncStatus.tsx` | Shows how many events are queued and waiting to sync |
| `ConflictQueueTable.tsx` | Table where Branch Managers review and resolve sync conflicts — uses jsondiffpatch to show exactly what changed |
| `useOnlineStatus.ts` | Watches browser connectivity — returns true/false for whether the device is online |
| `useOfflineSync.ts` | Manages the local event queue and triggers the sync when connectivity returns |
| `useConflictQueue.ts` | Fetches and resolves sync conflicts from the server |

---

### Standard modules — same pattern, nothing unusual

These modules all follow the exact same `api.ts` + `query-keys.ts` + `components/` + `hooks/` pattern:

| Module | What it covers |
|---|---|
| `customers/` | Customer list and profile. Cashiers complete profiles here after a Supervisor creates a basic record. |
| `workers/` | Shop-floor worker roster. Branch Manager adds, edits, and deactivates workers. |
| `price-list/` | Rate configuration table. Branch Manager overrides individual rates for their branch. |
| `inventory/` | Hardware store stock levels. Shows current stock and movement history. |
| `payments/` | Payment history and recording. Cashier collects advance and final payments here. |
| `invoices/` | Invoice list and PDF viewer. |
| `material-orders/` | Materials requested from stock for a specific job. |
| `goods-issue/` | Inter-branch stock transfers with approval workflow. |
| `gate-passes/` | Gate pass lookup and creation. |
| `petty-cash/` | Small cash expense recording and approval. |
| `deliveries/` | Recording that a completed job was handed over or delivered. |

---

### `modules/notifications/` — Thin

A simple read-only list showing notifications sent to customers (job ready, payment received, etc.) with their delivery status. One component, one hook.

---

### `modules/audit-logs/` — Thin

A virtualized table (same TanStack Virtual approach as the ledger) showing who did what and when. When you click a row, **jsondiffpatch** shows a colour-coded diff of exactly what changed — green for added, red for removed. Audit logs can have tens of thousands of rows so virtualisation is essential.

---

## `shared/` — Utilities Used Across All Modules

This is the app's internal shared code — not the `packages/shared` contract. Things that are used in multiple modules but don't belong to any one of them.

---

### `shared/api/client.ts`

The single Axios instance — every module's `api.ts` imports from here. Instead of each module creating its own HTTP client, the whole app shares one instance configured in this file.

It handles two things automatically on every request:

**JWT attachment** — reads the access token from the Zustand auth store and adds it to the `Authorization` header of every outgoing request. You never have to remember to add the token yourself.

**Token refresh** — if a request gets a `401 Unauthorized` response (meaning the access token expired), it automatically calls `/auth/refresh` to get a new token and retries the original request. All of this happens invisibly.

```typescript
// Every module's api.ts starts with this:
import { apiClient } from '@/shared/api/client'

// Then just uses it — token handling is automatic:
apiClient.get('/job-cards')
apiClient.post('/job-cards', dto)
```

---

### `shared/components/`

Reusable UI building blocks used across multiple modules. If a component appears in more than one module, it belongs here.

| File | What it does |
|---|---|
| `DataTable.tsx` | The base table component used by almost every list view in the app |
| `FormField.tsx` | A label + input + error message wrapper used in every form |
| `PageHeader.tsx` | The title + breadcrumb + action button bar at the top of every page |
| `StatusBadge.tsx` | The coloured pill that shows DRAFT / IN_PROGRESS / CLOSED etc. |
| `ConfirmDialog.tsx` | The "Are you sure?" modal used before destructive actions |
| `EmptyState.tsx` | The "No results found" illustration shown when a list is empty |
| `FileUpload.tsx` | The drag-and-drop upload area used for work order attachments |
| `PrintLayout.tsx` | A wrapper that formats content correctly when the browser prints (for invoices) |
| `VersionConflictToast.tsx` | The toast notification when an optimistic lock conflict is detected — tells the user to refresh and try again |

---

### `shared/stores/auth.store.ts`

Holds the logged-in user's session — survives page refresh. A Zustand store that holds the current user object, the active branch ID, the access token, and the CASL ability object.

Persisted to `localStorage` — so if you refresh the page, you're still logged in. When you log out, it's cleared. This is the only place in the frontend that stores user session data.

---

### `shared/stores/offline.store.ts`

Tracks how many offline events are queued and whether a sync is in progress. A small Zustand store that the `OfflineBanner` and `OfflineSyncStatus` components read from to show the user what's happening.

---

### `shared/hooks/usePermission.ts`

Check if the current user can do something — used everywhere. Wraps the CASL ability object from the auth store into a simple hook.

```tsx
const { can } = usePermission()

// Show the button only if user can create job cards:
{can('create', 'job_card') && <NewJobCardButton />}

// Show the cancel option only if user can cancel any status:
{can('cancel', 'job_card_any') && <CancelButton />}
```

---

### `shared/hooks/useSSE.ts`

Reusable hook for listening to live server updates. A generic hook that opens an SSE connection to a given URL and calls a callback whenever an event arrives. Both `useJobCardSSE.ts` and `useCashierQueueSSE.ts` are built on top of this. Handles connecting, reconnecting on disconnect, and cleaning up when the component unmounts.

---

### `shared/hooks/usePagination.ts`

Manages page number and page size state for any list. A small utility hook that any module's list component can use. Keeps pagination logic out of individual components.

---

### `shared/hooks/usePrint.ts`

Triggers the browser's print dialog for invoices and gate passes. Wraps `window.print()` with some setup — temporarily applies the `PrintLayout` wrapper and removes it after printing.

---

### `shared/lib/format.ts`

All money, date, and phone number formatting — and the only place division by 100 happens. All money in the database is stored as integers (cents) to avoid floating point errors — LKR 1,350 is stored as `135000`. This file is the only place in the frontend that divides by 100 to display it.

If you need to show a money value, always call `formatCurrency(amount)` from here — never write `amount / 100` anywhere else.

```typescript
formatCurrency(135000)       → "LKR 1,350.00"
formatDate(timestamp)        → "15 Apr 2026, 14:23"
formatPhone("+94711234567")  → "+94 71 123 4567"
```

> This rule prevents bugs where a developer forgets to divide, or divides twice. One function, one place.

---

### `shared/lib/utils.ts`

Two small utility functions used everywhere.

`cn(...classes)` — merges Tailwind class names together, handling conflicts. Used in almost every component:
```typescript
cn("px-4 py-2", isActive && "bg-blue-500")
```

`debounce(fn, ms)` — delays a function call until the user stops typing. Used in search inputs so the API is not hit on every keystroke.

---

## Quick Reference

### Where does each concern live?

| Concern | Location |
|---|---|
| Reading env variables | `env.ts` only — nowhere else |
| Global providers (query, router, theme) | `app/providers.tsx` |
| Permission building from server list | `app/ability.ts` |
| Auth guard + layout shell | `routes/_layout.tsx` |
| Page-to-component wiring | `routes/<name>/` |
| API fetch functions | `modules/<name>/api.ts` |
| Cache keys | `modules/<name>/query-keys.ts` |
| UI components for a feature | `modules/<name>/components/` |
| Data fetching hooks for a feature | `modules/<name>/hooks/` |
| Reusable UI building blocks | `shared/components/` |
| Session / auth state | `shared/stores/auth.store.ts` |
| Offline queue state | `shared/stores/offline.store.ts` |
| Permission checks in components | `shared/hooks/usePermission.ts` |
| Axios instance | `shared/api/client.ts` |
| Money / date formatting | `shared/lib/format.ts` |
| cn(), debounce() | `shared/lib/utils.ts` |

### Which modules have something special about them?

| Module | What makes it different |
|---|---|
| `cashier-queue/` | Has an SSE hook for live real-time updates |
| `work-orders/` | `WorkOrderForm` is a shell — spec fields in `specs/` subfolder |
| `ledger/` | Virtualized table (TanStack Virtual) for large data sets |
| `audit-logs/` | Virtualized table + jsondiffpatch for diff view |
| `offline-sync/` | Contains all offline UI — banner, status, conflict queue |
| `gate-passes/` | Has one route that is publicly accessible without login |
| `notifications/`, `audit-logs/`, `petty-cash/`, `deliveries/`, `gate-passes/` | Thin — flat file structure, no `components/` or `hooks/` subfolders |
