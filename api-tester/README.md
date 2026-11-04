# Saniro ERP — API Tester

Single-file, zero-build browser tool for testing the Saniro ERP API. It covers every controller route (105), grouped by what it does.

## Quick Start

```bash
cd api-tester
python -m http.server 9000
```

Open **http://localhost:9000** in your browser.

> Must be served over HTTP (not `file://`) due to CORS restrictions.

## Prerequisites

- API running on `http://localhost:3000` (`pnpm dev` or `nest start --watch` in `apps/api`)
- Database seeded (`pnpm db:seed`) if you want to use the quick-fill login chips

## Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  SANIRO·ERP  API Tester             [LOCAL|CLOUD]  [API URL]  [●] PING │
├──────────────┬────────────────────────────────────┬──────────────────┤
│ [filter…]    │ Token Store                        │  Request Log     │
│ □ my perms   │  tokens · role · X-Branch-Id picker│                  │
│              ├────────────────────────────────────┤  Live request /  │
│ ▾ SYSTEM     │ METHOD /path   [perm] [branch]     │  response stream │
│ ▾ AUTH       │  :id path params (recent ids)      │  + SSE events    │
│ ▾ USERS      │  query fields                      │                  │
│ ▸ …          │  JSON body (prefilled example)     │                  │
│              │  [Send] [Format] [Reset] [curl]    │                  │
│              │  Response + ids found              │                  │
└──────────────┴────────────────────────────────────┴──────────────────┘
```

Each endpoint panel shows:

- **Tags:** the permission (`@RequirePermissions`), the branch feature switch (`@RequireFeature`), `branch` for branch-context routes, `head office` for network routes, and a warning when the logged-in role lacks the permission.
- **Path params:** inputs with a dropdown of ids seen in earlier responses.
- **Query fields:** prefilled; empty values are not sent.
- **JSON body:** prefilled with a valid example built from the Zod schemas in `packages/shared/src/schemas`. Edits are kept per endpoint until you click **Reset to example**. `Ctrl/⌘ + Enter` sends.
- **copy curl:** copies the same request (with tokens and headers) as a curl command.

### Body placeholders

| Placeholder | Replaced with |
|---|---|
| `$uuid` | a new random UUID (used for `client_request_id`) |
| `$today` | today, `YYYY-MM-DD` |
| `$today-30`, `$today+7` | date offset by N days |
| `"<worker_id>"`, `"<item_id>"`, … | **not** replaced: paste a real id. The log warns if one is left. |

Money is in **cents** (Rs 1,000 = `100000`). Update and action bodies need the order's current `version`, which `GET /orders/:id` returns. Branch saves (`PATCH /branches/:id` and `PATCH /branches/:id/config`) need the branch's `version` too, from `GET /branches` or `GET /branches/:id/config`. A stale version is refused with `409 BR_006`.

## Branch context (X-Branch-Id)

- **Branch roles** (MANAGER, SUPERVISOR, CHIEF, CASHIER) always work in their JWT branch. The header is ignored.
- **Global roles** (SUPER_ADMIN, ADMIN, AUDITOR) have no JWT branch. For routes tagged `branch`, pick one in the **X-Branch-Id** picker.
  - Click **load**, or call `GET /branches`, to fill the picker. The seeded branches are listed until then.
  - "none" means all branches, which only some reads accept.
  - Global roles are view-only on branch work, so creates return `CTX_003`.
- `/network/*` routes never send the header.

## Endpoints

| Category | Endpoints |
|---|---|
| **System** | `GET /health`, `GET /health/run`, `POST /events/ticket`, `GET /events/stream` (SSE) |
| **Auth & Session** | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/change-password`, `GET /auth/me`, `POST /auth/logout`, `POST /auth/logout/all` |
| **Users & Access** | `GET/POST /users`, `PATCH /users/:id`, `PATCH /users/:id/role`, `GET /users/chief-candidates`, `POST /users/chief`, `GET /permissions`, `GET/PATCH /permissions/roles` |
| **Branches & Settings** | `GET/POST /branches`, `GET /branches/current`, `GET /branches/transfer-targets`, `PATCH /branches/:id`, `GET/PATCH /branches/:id/config` |
| **Customers** | `GET/POST /customers`, `GET /customers/lookup`, `PATCH /customers/:id` |
| **Workers** | `GET/POST /workers`, `PATCH /workers/:id` |
| **Catalogue & Pricing** | `GET /items/options`, `POST /items`, `GET /items/coils`, `GET /items/workshop-catalog`, `GET/POST /item-requests`, `GET /item-requests/count`, `POST /item-requests/:id/approve\|reject\|cancel`, `GET/POST /price-list/rates`, `PATCH /price-list/rates/:id`, `GET /price-list/items`, `PATCH /price-list/items/:id` |
| **Inventory & Stock Alerts** | `GET /inventory`, `GET /inventory/:itemId`, `PATCH /inventory/:itemId/minimum`, `GET /stock-alerts`, `GET /stock-alerts/count`, `GET /network/inventory`, `GET /network/stock-alerts`, `GET /network/stock-alerts/count` |
| **Stock Transfers** | `GET /stock-transfers/targets`, `GET /stock-transfers/items`, `GET/POST /stock-transfers`, `GET /stock-transfers/count`, `GET /stock-transfers/:id`, `POST /stock-transfers/:id/send\|reject\|cancel\|receive`, `GET /network/stock-transfers` |
| **Gate Passes** | `GET/POST /gate-passes`, `GET /gate-passes/available`, `GET /gate-passes/materials`, `GET /gate-passes/catalog-materials`, `GET /gate-passes/:id` |
| **Job Cards (Workshop)** | `POST /job-cards/quote`, `POST /job-cards`, `PUT /job-cards/:id`, `POST /job-cards/:id/void`, `GET /job-cards/history`, `GET /workshop-queue`, `POST /job-cards/:id/start\|complete\|close`, `POST /order-lines/:id/start\|complete` |
| **Roofing Orders** | `POST /roofing-orders/quote`, `POST /roofing-orders`, `PUT /roofing-orders/:id`, `GET /roofing-orders/history`, `GET /roofing-queue`, `POST /roofing-orders/:id/send-to-queue\|start\|complete\|release\|cancel` |
| **Orders & Payments (Cashier)** | `GET /orders/:id`, `GET /cashier-queue`, `POST /orders/:id/payments`, `POST /job-cards/:id/send-to-workshop` |
| **Hardware Sales** | `GET /hardware-store/items`, `POST /hardware-sales`, `GET /hardware-queue`, `POST /hardware-sales/:id/pay\|cancel` |
| **Attachments** | `POST /attachments` (multipart: `file` + `purpose`), `GET /attachments/:id/file` (image shown inline) |
| **Utils** | JWT Inspector (decodes locally, nothing is sent) |

`GET /items/workshop-catalog` and `GET /items/coils` are also listed under Job Cards and Roofing Orders, where their ids are needed.

When you add a controller route, add one entry to the `ENDPOINTS` array in `index.html`. Each entry holds the category, method, path, permission and an example body.

## Seeded Test Users

| Chip | Username | Password | Role |
|------|----------|----------|------|
| superadmin | superadmin | Super@123 | SUPER_ADMIN |
| admin | admin | Admin@123 | ADMIN (global, view-only on branch work) |
| auditor1 | auditor1 | Auditor@123 | AUDITOR (global, read-only) |
| manager_thangalla | manager_thangalla | Dev@1234 | MANAGER (branch) |
| supervisor_thangalla | supervisor_thangalla | Dev@1234 | SUPERVISOR |
| chief_thangalla | chief_thangalla | Dev@1234 | CHIEF |
| cashier_thangalla | cashier_thangalla | Dev@1234 | CASHIER |

Every branch (naiwala, veyangoda, thangalla) has `manager_`, `supervisor_`, `chief_` and `cashier_<branch>` users with password `Dev@1234`.

Seeded branch ids: Naiwala `…0001`, Veyangoda `…0002`, Thangalla `…0003` (`00000000-0000-0000-0000-00000000000N`).

## Typical Test Flows

Ids found in each response are offered in every `:id` field and shown as copy chips next to the status badge. That lets you chain the steps below.

### Session
1. `POST /auth/login` → pick a chip → **Send**. The tokens, role and permissions go into the Token Store.
2. `GET /auth/me` → `POST /auth/refresh` → `POST /auth/logout`.
3. `GET /auth/me` again → `401`.

### Job card (workshop)
1. As `supervisor_thangalla`:
   - `GET /workers?active=true` gives you a `worker_id`.
   - `POST /job-cards/quote` prices the lines.
   - `POST /job-cards` creates the card. Replace `<worker_id>` first.
2. As `cashier_thangalla`: `GET /cashier-queue`, then either `POST /orders/:id/payments`, or `POST /job-cards/:id/send-to-workshop` when nothing is due.
3. As `supervisor_thangalla`:
   - `GET /orders/:id` gives you the `version` and `line_id`s.
   - `POST /job-cards/:id/start`
   - `POST /job-cards/:id/complete`
4. Pay the balance as the cashier, then `POST /job-cards/:id/close` as the supervisor.

### Roofing order
1. `GET /items/coils` gives you a `coil_item_id`.
2. `POST /roofing-orders/quote`, then `POST /roofing-orders`.
3. Payment, or `send-to-queue`.
4. `start`, then `complete`, then `release`.

### Stock transfer
1. As `manager_thangalla`:
   - `GET /stock-transfers/items` gives you an `item_id`.
   - `POST /stock-transfers` asks Naiwala for stock.
2. As `manager_naiwala`:
   - `GET /stock-transfers?direction=INCOMING`
   - `GET /stock-transfers/:id` gives you the `transfer_line_id`s.
   - `POST /stock-transfers/:id/send`
3. As `manager_thangalla`: `POST /stock-transfers/:id/receive`.

### New catalogue item
1. As `supervisor_thangalla`: `POST /item-requests`.
2. As `manager_thangalla`:
   - `GET /item-requests/count`
   - `POST /item-requests/:id/approve` (or `reject`)

### Head office view
1. Log in as `admin`.
2. `GET /network/inventory` and `GET /network/stock-transfers` need no branch.
3. For branch screens (e.g. `GET /workshop-queue`), pick a branch in **X-Branch-Id** first.
4. A create such as `POST /customers` is refused, because head office is view-only.

### Live updates (SSE)
1. `POST /events/ticket` stores the ticket.
2. `GET /events/stream` → **Connect**.
3. In another tab, do any write. `changed` events appear in the Request Log, and a `ping` arrives every 25 s.
4. A ticket works once: get a new one to reconnect.

## LOCAL / CLOUD Toggle

- **LOCAL**: `http://localhost:3000` (default)
- **CLOUD**: configure your deployed API URL

URLs are saved separately for each environment in `localStorage` and restored on the next load.

## Environment Variables (API)

| Variable | Default | Notes |
|----------|---------|-------|
| `API_PORT` | `3000` | Change the URL in the tester if you override this |
| `JWT_ACCESS_EXPIRES` | `15m` | Access token TTL shown in JWT Inspector |
| `JWT_REFRESH_EXPIRES` | `7d` | Refresh token TTL |
| `THROTTLE_AUTH_LIMIT` | `10` | Logins per minute per IP |

## Notes

- **Token Store:** kept in `sessionStorage`. It survives a page reload in the same tab, and a new tab starts empty. **clear all** forgets it.
- **Logout:** revokes the session on the server (`user_session.is_active = false`). A revoked access token gets `401` even before it expires.
- **my permissions only:** hides routes the logged-in role cannot call. It uses `permissions` from the login or `/auth/me` response; SUPER_ADMIN sees everything.
- **Sidebar:** the selected endpoint is kept in the URL hash, and folded categories are remembered.
- **PING:** hits `/health` and shows a green dot when the API is reachable.
