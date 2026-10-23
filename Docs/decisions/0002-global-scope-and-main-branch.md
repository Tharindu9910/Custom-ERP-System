# 0002: Global scope, view-only head office, and the main branch

- **Status:** accepted (2026-10-22)
- **Scope:**
  - who works across branches
  - how each screen picks its branch
  - what head office can do on branch screens
  - the main (distribution) branch
- **Sources:**
  - PRD BR06, BR12 and BR13
  - `Docs/ER-v6.md` (USER_ROLE)
  - decision [0001](0001-supervisor-dashboard.md)
  - how SAP (company code / plant), Odoo (multi-company) and NetSuite (subsidiary) separate global settings, per-branch transactions and consolidated reports

## Problem

The top-bar branch picker appeared on every page for SUPER_ADMIN and MANAGER. On global pages (Branch Config, Users, Role Permissions) it did nothing, so users believed they were editing one branch when they were not. Head office also had no single view of stock across branches. Most stock arrives at Naiwala and is sent on from there, but nothing in the data said so.

## Decisions (confirmed by the product owner)

| Topic | Decision | Why / note |
|---|---|---|
| Global roles | **SUPER_ADMIN, ADMIN and AUDITOR** have no branch (`user_role.branch_id IS NULL`). Every other role has exactly one branch. The DB check `chk_user_role_branch_scope` enforces both directions. | ER-v6 allowed MANAGER and ADMIN either way, and the code disagreed in four places. There is now one definition: `GLOBAL_ROLES` in `@erp/shared`. |
| ADMIN | A head-office role. The per-branch `admin_<branch>` users are gone; one global `admin` remains. | |
| MANAGER | Branch-scoped: the PRD's "Branch Manager". It takes ADMIN's former branch-operation permissions: job-card status and cancels, `manage:workers`, `override:stock`, `resolve:conflict_queue`. | BR06 named Manager as cross-branch; the product owner chose branch-scoped instead. |
| Head office is view-only on branch work | A global role can open any branch's queues and stock, but it cannot create, send, receive, pay, start or cancel. The server refuses any non-GET request that resolves its branch through `X-Branch-Id`, with **403 `CTX_003` (GLOBAL_VIEW_ONLY)**. The UI hides those buttons (`useCanTransact`). | Segregation of duties: head office watches and the branches transact. One check in `@BranchId()` covers every branch transaction. The live-updates ticket (`POST /events/ticket`) is a read, so it uses `@ReadBranchId()` instead; with no branch selected, head office streams every branch. |
| Global settings stay editable | Branch Config (`PATCH /branches/:id/config`), Users and Role Permissions take their branch from the path or JWT, not from `X-Branch-Id`, so they still work. Only SUPER_ADMIN adds branches, changes branch details, moves the main branch, or grants SUPER_ADMIN. | ADMIN also has `manage:users`, so it must not be able to create super admins. |
| Customers are branch work | `POST /customers` and `PATCH /customers/:id` resolve their branch through `@BranchId()`, so a global role gets `CTX_003`. The Customers page is still readable by head office, but **Add Customer** and **Edit** are hidden there. | Found while mapping role capabilities for the e2e tests (2026-10-22). Before this, head office could create customers with no home branch. |
| Page scope | Every page declares a scope in `apps/web/src/app/navigation.ts`. **global**: a "Global · applies to all branches" chip and no picker. **network**: Inventory, Stock Alerts and Stock Requests; the picker defaults to *All branches*. **branch**: queues, gate pass and workers; the user picks one branch where the page runs, and a *View only* tag is shown. Branch-bound users never see a picker. | The scope belongs to the screen, not the session. |
| Consolidated reads | `GET /network/inventory` (items × branches, main first, total; status is the worst level at any branch), `GET /network/stock-alerts` (each branch's shortfall plus what the main branch holds), and `GET /network/stock-transfers` (every request, read-only). These are for global roles only (403 `CTX_004` otherwise). | BR06 still holds for branch staff: a supervisor sees only their own stock. |
| Main branch | `branch.is_main`. A partial unique index allows only one. It is seeded on Naiwala (`BR-NAI-001`). Branch lists sort main first, it shows a ★ Main badge, and the New Request form defaults its supplier to the main branch. SUPER_ADMIN can move the flag from Branch Config; the main branch must be active. | One stock pool at Naiwala, no separate warehouse location. |
| Supplier inflow (Goods Receipt / BR13) | **Deferred.** | "Not now". Today stock only grows through transfers and the opening balances. |

## Migration

`1761100000000-GlobalScopeMainBranch` does the following:
- adds `is_main` and sets it on Naiwala
- clears the branch on ADMIN roles and moves MANAGER roles without a branch to the main branch, keeping `user.branch_id` in step
- replaces the role/branch check
- moves the branch-operation grants from ADMIN to MANAGER and adds the view grants to ADMIN and AUDITOR (the same grants as the seed matrix)

## Not done yet

- Cache keys for branch data still don't include the branch. The top bar clears the query cache whenever the branch changes.
- Dashboard, Finance and Audit Log are still placeholders. They are declared `global` and will need their own network views when built.
