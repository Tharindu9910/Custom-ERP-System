# Role capabilities and tests: Super Admin and Supervisor

This page lists what **SUPER_ADMIN** and **SUPERVISOR** can and cannot do on every screen, and names the tests that prove it. Each test title starts with the ID shown here (for example `OQ-22`), so a failing test points back to a row on this page.

- **Browser tests** (Playwright) cover what the screen shows and does: `apps/e2e/tests/*.spec.ts`.
- **API tests** (jest + supertest) prove the server refuses what the screen hides: `apps/api/test/*.e2e-spec.ts`.

## Running the tests

| Command | What it does |
|---|---|
| `pnpm test:e2e:api` | API tests. Resets and seeds the database in `DATABASE_URL`, then boots the API in-process. |
| `pnpm test:e2e:web` | Browser tests. Resets and seeds the database, builds the API and starts it on **:3100**, and starts the web app on **:5180**. Your dev API on :3000 and anything on :5173 are left alone. |
| `pnpm test:e2e` | Both, one after the other. |
| `pnpm check:numbers` | After a run, checks that every KPI matches its list and that stock still equals the sum of its movements. |
| `pnpm --filter @erp/e2e report` | Opens the last browser report, with a trace and screenshot for each failure. |

> **Both suites wipe the database in `DATABASE_URL`** (the dev `erp_db`) and re-seed it. Set `E2E_SKIP_RESET=1` to keep the current data. Every test builds the records it needs through the API, so the suites also pass without a reset.

Browser runs use the installed Google Chrome. Set `E2E_CHANNEL=chromium` to use Playwright's own Chromium instead; download it first with `npx playwright install chromium`.

## Who is who

| | SUPER_ADMIN (`superadmin`) | SUPERVISOR (`supervisor_<branch>`) |
|---|---|---|
| Branch | None (head office). Picks a branch in the top bar to view one. | Exactly one. Any `X-Branch-Id` header is ignored. |
| Permissions | Passes every permission check. | 19 grants (`AUTH-03`). |
| Branch work | **View only.** The UI hides the buttons, and the server answers `403 CTX_003` to any write. | Own branch only (BR06). Other branches' records return 404. |
| Settings | Branch Config, Users, Role Permissions. | None. |

Seeded branches:

| Branch | Type | Notes |
|---|---|---|
| Naiwala | Roofing | Main branch; no stock override. |
| Veyangoda | Workshop | No stock override. |
| Thangalla | Roofing + Workshop | Stock override on, password `Override@123`. |

## Sample data for checking by hand

`pnpm db:seed` (which runs `seed:demo`) writes one example of every case below through the real services. Sign in as the user shown and look for the customer name.

| Screen | Case | Where (sign in as → look for) |
|---|---|---|
| Gate Pass | Open | `supervisor_thangalla` → Sunil Hardware |
| | Partially assigned | `supervisor_thangalla` → Nimal Perera; `supervisor_naiwala` → Roof Material Customer (roofing branch) |
| | Fully assigned | `supervisor_thangalla` → Full Pass Customer |
| | Closed (all material used by a completed job) | `supervisor_thangalla` → Closed Pass Customer |
| | Colour dropped at a workshop-only branch | `supervisor_veyangoda` → Nimal Perera |
| Workshop Queue | Awaiting payment, nothing paid | Kamal Stores (every workshop branch) |
| | Awaiting payment, part paid | `supervisor_thangalla` → Part Paid Customer |
| | Edited before work (sub-job added, coil cutting line) | `supervisor_thangalla` → Edited Card Customer |
| | Voided | `supervisor_thangalla` → Voided Card Customer (only in the order's history; voided cards leave the queue) |
| | In queue (paid), using customer material | Nimal Perera |
| | In queue, made by the chief | `supervisor_thangalla` → Chief Card Customer |
| | In progress | Rathna Builders |
| | In progress after a **stock override**, plus a manually customized line | `supervisor_thangalla` → Override Card Customer |
| | Completed | Saman Engineering, Closed Pass Customer |
| Order Queue | Placed (order coil, accessories) | Ajith Constructions |
| | Placed: customized item with a design photo + customer-supplied item | Lakmal Perera |
| | Placed: discount, paid by card | `supervisor_thangalla` → Discount Card Customer |
| | Placed: edited by the cashier, so a refund is due | `supervisor_thangalla` → Cashier Edited Customer |
| | Placed: customer material from a gate pass | `supervisor_naiwala` → Roof Material Customer |
| | In progress | Green Valley Hotel |
| | In progress after a **coil override** | `supervisor_thangalla` → Coil Override Customer |
| | Ready, balance due (Release locked) | Nuwan Silva |
| | Ready and fully paid (Release available) | `supervisor_thangalla` → Ready To Release |
| | Released | Mahesh Fernando |
| | Cancelled | Ruwan Jayasinghe |
| Inventory / Alerts | Healthy, low and out-of-stock items | Every branch (opening stock); an open request shows on its item |
| Stock Requests | Waiting (to send) | `supervisor_thangalla`: from Veyangoda (gate pipes); `supervisor_naiwala`: from Thangalla (urgent) |
| | **Late** (needed by yesterday, still waiting) | `supervisor_naiwala` → Requests to Us, "Overdue example" |
| | Sent in full, to receive | `supervisor_thangalla` → Our Requests (bolts) |
| | Sent less than asked, to receive | `supervisor_veyangoda` → Our Requests (round bar) |
| | Received in full | `supervisor_naiwala` → Our Requests (nuts) |
| | Received short, with a note | `supervisor_thangalla` → Our Requests (angle iron) |
| | Rejected with a reason / Cancelled | `supervisor_thangalla` → Our Requests, All |
| Chief profiles | Waiting for first sign-in (temporary password is printed by `pnpm db:seed`) | `priya.kumari@example.com` |
| | Temporary password expired | `dilshan.w@example.com` |
| Users (Super Admin) | Deactivated user | `cashier_old_thangalla` |
| Branch Config (Super Admin) | Inactive branch | Matara (closed) |

Not seeded: a **Reserved** gate pass. Material is only allocated when an order is placed, so this status can't happen with the current flow.

The e2e suites leave their own test records behind. To get back to just the sample data, run `node apps/api/test/reset-db.mjs` (drops the schema, migrates and seeds).

## Menu and access (NAV, ACC)

| Case | Supervisor | Super Admin | Tests |
|---|---|---|---|
| Menu | Gate Pass, Inventory, Stock Alerts, Stock Request and Create Chief Profile at every branch. Roofing branches add Create Order and Order Queue; workshop branches add Create Job Card and Workshop Queue. No Settings section. | Every screen to view, plus Settings and Role Permissions. No create forms. Finance and Audit Log appear as disabled "Coming soon" entries. | NAV-01, NAV-10, NAV-11 |
| Landing page | Gate Pass | Dashboard placeholder | AUTH-13, AUTH-14, NAV-04 |
| Cashier, Customers, Workers, Settings URLs | Redirected | Allowed (view only where it is branch work) | NAV-02, NAV-03, SA-40…42 |
| Screen the branch doesn't run (module off, or wrong branch type) | Shows "<Screen> isn't used at <Branch>"; the API answers `CTX_002` | The picker lists only branches that run the screen; a wrong pick explains itself | NAV-06, NAV-14, NAV-15, NAV-20, ACC-06, ACC-23, SA-CFG-01 |
| Create forms (`/orders/new`, `/job-cards/*`, `/chiefs/new`) | Allowed | Shows "This page is for branch staff" | NAV-18 |
| Branch pages before a branch is picked | n/a | "Choose a branch to view"; then the page with a View only tag. The pick survives a reload. | NAV-13, NAV-16 |
| Network pages (Inventory, Stock Alerts, Stock Requests) | Own branch only; `/network/*` answers `CTX_004` | Defaults to "All branches" | NAV-17, ACC-05, ACC-22 |
| Any write to branch work | Allowed on own branch | `403 CTX_003`, and nothing changes | ACC-10…13 |
| Another branch's records | 404 | 404 unless that branch is picked | ACC-04, ACC-24…26 |
| Permissions the supervisor lacks (cashier queue, payments, order edit and cancel, users, branches, role permissions, workers) | `403 AUTH_004` | Allowed | ACC-21 |
| Change own password | From the user area | From the user area | NAV-05, PWD-20, PWD-21 |

## Gate Pass (GP)

| Action | Supervisor | Super Admin | Tests |
|---|---|---|---|
| Create a pass. Needs the customer, plus a material with a thickness, length or quantity. Rows can be added and removed. Generates a `GP-` number. Safe to retry. | ✅ | ❌ (no Create tab; `CTX_003`) | GP-01…03, GP-10, GP-11, ACC-10 |
| Colour | Asked at roofing branches; not asked at a workshop-only branch, and the server drops it there | n/a | GP-04, GP-12, GP-13 |
| Queue: search, status, date range, Reset or Clear; the available count matches the Available filter | ✅ | ✅ (read) | GP-05, GP-15, GP-16, GP-19, GP-20 |
| Details, then Allocate to Job Card or to Order Form | ✅ (only what the branch runs) | ❌ (buttons hidden) | GP-14, GP-17, GP-19 |
| "Create New Gate Pass" from a form returns to that form with the pass linked | ✅ | n/a | GP-18, JC-33 |
| Another branch's pass | 404 | n/a | GP-06 |

## Job Card (JC)

| Action | Supervisor | Super Admin | Tests |
|---|---|---|---|
| Create. Needs at least one worker and one sub-job; the Add button says what is still needed; the live quote shows the total and the advance. | ✅ | ❌ (lock page; `CTX_003`) | JC-01, JC-03, JC-20…23, JC-43 |
| An all-standard card (0% advance) goes straight to the queue | ✅ | n/a | JC-02 |
| Edit or delete sub-jobs before submitting; Cancel clears the form | ✅ | n/a | JC-22, JC-25 |
| No standard rate: the line is flagged and submit is blocked (`PRC_001`) | ✅ | n/a | JC-05, JC-24 |
| Worker from another branch | `ORD_014` | n/a | JC-04 |
| Customer material from a gate pass: allocate (capped at what is left), unassign, and the material is committed (`ALC_001` beyond that) | ✅ | n/a | JC-06, JC-30…32 |
| Edit while DRAFT or IN_QUEUE with nothing started; the advance is recalculated and the queue shows a notice | ✅ | ❌ (no Edit button, G1) | JC-08, JC-40, JC-42, WQ-30 |
| Edit after work started | Opens locked (`ORD_004`) | n/a | JC-41, WQ-08 |
| Stale version | `ORD_003` | n/a | JC-09, WQ-04 |
| Safe to retry | ✅ | n/a | JC-07 |

## Workshop Queue (WQ)

| Action | Supervisor | Super Admin | Tests |
|---|---|---|---|
| KPIs and tab counts equal their rows; search; date filter with Clear | ✅ | ✅ (read) | WQ-01, WQ-20, WQ-21 |
| Unpaid card: no Start, with a "waiting for the advance" note (G9); a partial advance keeps it DRAFT | ✅ | n/a | WQ-02, WQ-09, WQ-22 |
| Start deducts sheets; Complete records the supervisor as inspector (BR07) | ✅ | ❌ | WQ-03, WQ-23 |
| Short stock: override dialog; a wrong password is refused (`STK_002`); the right one starts the work and stock stops at 0 | ✅ (Thangalla) | ❌ | WQ-05, WQ-24 |
| Branch without the override | Explains it is off; no override button (`STK_004`) | n/a | WQ-06, WQ-28 |
| Void an unpaid DRAFT card (reason of 3+ characters; Keep backs out). A paid card cannot be voided. | ✅ | ❌ | JC-10, JC-11, WQ-25, WQ-26 |
| BR21: a chief is blocked on a supervisor's card while the supervisor is active | Never blocked | n/a | WQ-07, WQ-29 |
| Live update without reloading | ✅ | ✅ | WQ-27 |

## Create Order, roofing (RO)

| Action | Supervisor | Super Admin | Tests |
|---|---|---|---|
| Sheet items need a coil, pattern, length and pieces; running feet are shown | ✅ (roofing branches) | ❌ (lock page) | RO-20 |
| Duplicate, edit and remove items; the list is grouped by category | ✅ | n/a | RO-21 |
| A customized item needs a design photo (upload with preview; images only) | ✅ | ❌ (`CTX_003`) | RO-02, RO-03, RO-22, ACC-13 |
| Accessory items | ✅ | n/a | RO-23 |
| Place an order: `WO-FORM-` number, banner, then New Order or Go to Order Queue. The server total matches the quote. Safe to retry. | ✅ | ❌ | RO-05, RO-30, RO-31 |
| Refusals: missing items, below the minimum (`PAY_002`), above the total (`PAY_003`), card without a reference (`PAY_004`), discount over the limit (`ORD_010`), unknown coil (`ORD_016`) | ✅ | n/a | RO-03, RO-04, RO-32, RO-33 |
| Offline: placing is blocked (BR18) | ✅ | n/a | RO-34 |
| Customer material from a gate pass | ✅ | n/a | RO-06, RO-35 |
| The coil list shows our stock | ✅ | n/a | RO-01, RO-36 |
| Workshop-only branch | Not run (`CTX_002`) | n/a | RO-07, NAV-06 |

## Order Queue (OQ)

| Action | Supervisor | Super Admin | Tests |
|---|---|---|---|
| Tab counts equal their rows and add up; search; placed-on filter | ✅ | ✅ (read) | OQ-01, OQ-20, OQ-21 |
| Start (deducts coil feet), then Complete (Ready) | ✅ | ❌ | OQ-02, OQ-05, OQ-22 |
| Short coil: override | ✅ | ❌ | OQ-04, OQ-24 |
| Release: locked while a balance is due (`ORD_006`) and not before Ready (`ORD_017`); needs "handed to"; the timeline is filled in | ✅ | ❌ | OQ-03, OQ-06, OQ-22, OQ-25 |
| Collect payment, edit or cancel an order | ❌ (hidden; `AUTH_004`) | ❌ | OQ-06, OQ-07, OQ-22 |
| Chief: BR21 message; no Release | n/a | n/a | OQ-07, OQ-08, OQ-26 |
| Detail modal: items, payments, timeline | ✅ | ✅ (no actions) | OQ-23, OQ-27 |

## Inventory and Stock Alerts (INV, ALR)

| Action | Supervisor | Super Admin | Tests |
|---|---|---|---|
| Tabs All, Healthy, Low and Out: counts equal rows, and they add up | ✅ (own branch) | ✅ (per branch) | INV-01, INV-10 |
| Search, category, sort, Clear Filters | ✅ | ✅ | INV-02, INV-11 |
| Details with recent movements and no other-branch figures (BR06) | ✅ | ✅ (read only) | INV-03, INV-12, INV-21 |
| Request from another branch or View request; the open-request marker on the row | ✅ | ❌ | INV-05, INV-13, INV-14 |
| Coils hidden at a workshop-only branch | ✅ | n/a | INV-04, INV-15 |
| All-branches grid with totals | ❌ (`CTX_004`) | ✅ | INV-20, ACC-05 |
| Alerts: KPIs agree with Inventory; deficit math; per-row Request; bulk select, Request selected, Clear | ✅ | Read only | ALR-01, ALR-02, ALR-10…12, ALR-20 |

## Stock Requests (TRF)

| Action | Supervisor | Super Admin | Tests |
|---|---|---|---|
| Suppliers are other branches by name, main first, with no stock figures | ✅ | n/a | TRF-01, TRF-20 |
| New request: item search shows our stock; steppers and remove; needs a date (not in the past); urgent and note; `GI-` number; safe to retry | ✅ | ❌ (no tab; `CTX_003`) | TRF-02, TRF-03, TRF-21…25 |
| An item with an open request cannot be asked for again (`TRF_003`) | ✅ | n/a | TRF-03, TRF-22 |
| Supplier, Check & Send: not over the asked amount or our stock; something must be sent; stock leaves | ✅ | ❌ | TRF-06, TRF-07, TRF-30, TRF-31 |
| Supplier: reject with a reason | ✅ | ❌ | TRF-08, TRF-31 |
| Requester, Receive: "We have" and "New total" update live; not over what was sent; a short count records a note; stock arrives | ✅ | ❌ | TRF-07, TRF-40 |
| Requester: cancel while Waiting (asks first) | ✅ | ❌ | TRF-08, TRF-41 |
| Wrong side or third branch | `TRF_010` / 404; not listed | n/a | TRF-04, TRF-05, TRF-32, TRF-44 |
| Badges and counts match the lists | ✅ | n/a | TRF-09, TRF-43 |
| History and reject reason in View | ✅ | ✅ | TRF-42, TRF-50 |
| Network list | ❌ | ✅ (read only) | TRF-50, TRF-51 |

## Create Chief Profile and passwords (CHF, PWD, AUTH)

| Action | Supervisor | Super Admin | Tests |
|---|---|---|---|
| Candidates are own-branch active employees with no login; search | ✅ | ❌ (lock page; `CTX_003`) | CHF-01, CHF-10 |
| Create: invalid email refused; email taken (`USR_005`); employee already has a login (`WRK_003`); another branch's employee (`WRK_001`) | ✅ | n/a | CHF-02, CHF-03, CHF-11, CHF-13 |
| The temporary password is shown once (Copy details; gone after Dismiss) | ✅ | n/a | CHF-12 |
| First login is forced to `/change-password`; other pages bounce back (`AUTH_006`); rules are checked; a wrong current password (`AUTH_008`); Sign out | n/a | n/a | CHF-03, PWD-10, PWD-11 |
| An expired temporary password cannot sign in (`AUTH_007`) | n/a | n/a | CHF-04, PWD-12 |
| Sign in and out; required fields; wrong password message | ✅ | ✅ | AUTH-01, AUTH-04, AUTH-10…16 |

## Super Admin settings (SA)

| Action | Tests |
|---|---|
| Branch list: search and type filter. Add a branch: a duplicate name is caught in the form, a duplicate code returns `BR_002`, ADMIN cannot add one. The new branch becomes a transfer target. | SA-10, SA-11, SA-BR-01 |
| Feature switches: unsaved changes, Discard, Save, Reset to defaults, the "leave without saving?" prompt. The supervisor's menu, URL and API follow at once. | SA-12, SA-13, NAV-20, SA-CFG-01, SA-CFG-02 |
| Invalid settings are refused | SA-CFG-03 |
| The override password set here is the one supervisors must enter | SA-15, SA-CFG-04 |
| Move the main branch and back. The main branch cannot be unset (`BR_004`) or deactivated (`BR_005`). Deactivating another branch removes it from the targets. | SA-14, SA-16, SA-17, SA-BR-02 |
| Users: list includes head office. The role list never offers SUPER ADMIN. Branch roles need a branch (`USR_004`); head-office roles must not have one (`USR_006`). Duplicate username (`USR_003`). Edit. Deactivate ends sessions and blocks login (`AUTH_005`); Activate restores it. Only a super admin grants SUPER_ADMIN. | SA-20…24, SA-USR-01…05 |
| Role Permissions: every role but SUPER_ADMIN. Revoking `view:inventory` from SUPERVISOR removes it from the menu and the API at once; granting it back restores it. | SA-30, SA-31, SA-PRM-01, SA-PRM-02 |
| Cashier Queue, Workers and Customers are readable, with no Record payment, Add or Edit | SA-40…42, SA-VIEW-02, ACC-11 |

## Gaps found while mapping, and what was done

| # | Gap | Fix | Test |
|---|---|---|---|
| G1 | Workshop Queue showed head office an Edit button that led to a lock page | Hidden for view-only roles | WQ-30 |
| G2 | Head office could add and edit customers | API refuses (`CTX_003`); buttons hidden | ACC-10, ACC-11, SA-42 |
| G3 | Finance and Audit Log linked to pages that don't exist | Disabled "Coming soon" entries | NAV-11 |
| G4 | No way to change your own password from the app | "Change password" link in the user area | NAV-05, PWD-20 |
| G5 | Login rate limit ignored `THROTTLE_AUTH_LIMIT` | Reads the setting (default still 10/min) | used by both suites |
| G6 | Missing permissions came back as a bare "Forbidden resource" instead of `AUTH_004` | The permission guard returns `AUTH_004` | ACC-21 |
| G7 | A supervisor opening a screen their branch doesn't run got an API error | Shows "<Screen> isn't used at <Branch>" | NAV-06, NAV-20 |
| G8 | A wrong password at login showed "An unexpected error occurred" | Failed logins skip the token refresh, so the real message shows | AUTH-12 |
| G9 | An unpaid job card offered Start, which then failed | Start hidden until the advance is paid, with a note | WQ-22 |
| G10 | Adding a second user with no email from Users failed with "An unexpected error occurred" (the blank email was saved as `''` and hit the unique index) | Blank email and phone are saved as "not given"; a taken email returns `USR_005` | SA-22, SA-USR-06 |
| G11 | Several stock movements in one transaction shared a timestamp, so "latest movement" and the Recent movements order were arbitrary | Each movement records its real time (`clock_timestamp()`) | LEDGER-01, `pnpm check:numbers` |

Found but not fixed (outside these two roles):
- ADMIN and AUDITOR see Workshop Queue and Stock Request in the menu, but the route and the API refuse them.
- `useOfflineSync` posts to `/offline-sync/flush`, which doesn't exist (offline work is deferred).
- After a job card with no advance due is created, the success message still says it was "sent to the Cashier Queue".
