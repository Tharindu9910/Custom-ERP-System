# 0001 — Supervisor dashboard: business rules and technical defaults

- **Status:** accepted (2026-10-21)
- **Scope:** every screen the SUPERVISOR role has in the approved prototype: Gate Pass, Create Order (roofing), Order Queue, Create Job Card, Workshop Queue, Inventory, Stock Alerts, Stock Request, Create Chief Profile.
- **Sources:** the approved prototype (UI spec), `Docs/ER-v6.md` (data model), `Docs/Saniro-workshop-PRD.md` (BR01–BR26), `Docs/instructions.md` (engineering guidance).

The three sources disagree in several places. This record lists how each conflict was resolved, so that later phases (cashier, manager, admin) build on the same rules.

## Business rules (confirmed by the product owner)

| Topic | Decision | Why / note |
|---|---|---|
| Payment gate (BR05) | A new job card is **DRAFT** and sits in the Cashier Queue. When the minimum advance (BR09) is paid it becomes **IN_QUEUE** and appears in the Workshop Queue. | The prototype showed unpaid cards in the queue. The PRD gate wins. |
| Workers (BR03/BR04) | One multi-select of the branch's active employees in the job card header, assigned to every line. At least one is required. | Keeps the prototype layout and gives per-person accountability. |
| Standard pricing (BR01/BR17/BR23) | The server prices standard lines from `price_rate`: branch rate, then master rate. If there is no rate, the line is auto-customized and the supervisor enters the price. | The prototype left standard jobs unpriced. |
| Editing a job card | Lines can be added, edited or removed while the order is DRAFT or IN_QUEUE **and no line has started**. Adding to an IN_QUEUE card recalculates the minimum advance (BR26). | |
| Cashier | The real payment API is built now (payment and ledger in one transaction), with a minimal Cashier Queue screen. The full cashier UI comes later. | Without it, job cards could never reach the workshop. |
| Roofing placement payment | Supervisor, Chief or Cashier takes the placement payment (minimum from branch policy). Later balances go to the cashier. | As in the prototype. |
| Rates vs policy | All rates (workshop and roofing) live in `price_rate`. Policies (surcharge %, max discount %, minimum to place, minimum advance %) live in `branch.settings`. | One pricing table. Manager screens come later. |
| Stock deduction (BR10/BR11) | Roofing coil ft (`length × pieces`) is deducted when the order is **started**. Cut/Bend branch material (sheets) is deducted when a **line starts**. Rolling and coil cutting deduct nothing for now. Customer-supplied material never deducts. | The prototype never deducted; BR10 wins. |
| Not enough stock | Blocked with a 409. If the branch has `stock_override_enabled`, the supervisor can override with the branch override password and a reason, which is audited. | **Superseded by [0003](0003-stock-reservation.md):** stock is now checked and held when the order is saved; start uses the hold. |
| Stock requests | Waiting → Sent → Received (stored as PENDING → ISSUED → CONFIRMED), or Rejected/Cancelled while Waiting. The supplying branch's supervisor sends or rejects; the requesting branch's supervisor receives or cancels. No admin approval step. | As in the prototype. Overrides the ER-v6 note about ADMIN approval (BR12). |
| Other branches' stock | **Hidden.** A supervisor sees only their own branch's stock. The request form lists other branch names only. | BR06 holds. The prototype's "has X of N items" hints and network totals are removed. |
| Chief accounts | The supervisor picks an employee who has no account. The system generates a temporary password, shown once. It expires after 72 hours and must be changed at first login. | There is no email service yet. |
| BR21 Chief deference | Enforced on the server. A CHIEF edit, start, complete or void on an order created by a SUPERVISOR who has an active session returns 409: *"A Supervisor is active. Coordinate with them to modify this record."* | The prototype did not enforce it. |
| Live updates | The server sends a small "changed" message over SSE and screens refetch. Screens also refetch on focus and reconnect, poll every 60s as a fallback, and have a Refresh button. | |
| Offline | Deferred. An offline banner is shown. Create endpoints accept a client-generated `client_request_id`, so a retry or a later offline sync cannot create duplicates. | |

## Technical defaults

- **Overrides and stock:** `branch_stock.quantity` keeps its `CHECK >= 0` (ER-v6). An override deducts down to 0 and records the shortfall on the OVERRIDE movement and in the audit log.
- **Material allocation:** `material_allocation` has an extra `order_id` column, because customer material is reserved for a whole order. `line_id` stays nullable.
- **Stock transfer:** `stock_transfer` has extra `reject_reason` and `receive_notes` columns.
- **Order status mapping:** "Completed" (workshop) and "Ready" (roofing) are derived, not stored. They mean IN_PROGRESS with every active line COMPLETED.

  | Workshop label | Stored status | Roofing label | Stored status |
  |---|---|---|---|
  | Pending | IN_QUEUE | Placed | IN_QUEUE |
  | In Progress | IN_PROGRESS | In Progress | IN_PROGRESS |
  | Completed | derived | Ready | derived |
  | | | Released | CLOSED |
  | | | Cancelled | VOIDED |

- **Customers:** order and gate pass creation find the customer by phone, or create a basic profile in the same transaction. The cashier completes the profile later.
- **Dates:** "today" always means Asia/Colombo (`APP_TIMEZONE`), never a UTC date.
- **Numbers:** generated by Postgres sequences:

  | Document | Format |
  |---|---|
  | Job card | `JC-00001` |
  | Roofing order | `WO-FORM-00001` |
  | Order line | `WO-00001` |
  | Gate pass | `GP-00001` |
  | Stock transfer | `GI-2026-0001` |
  | Receipt | `RC-00001` |

- **SSE authentication:** the access token is never put in a URL. The client exchanges it for a 30-second single-use ticket and opens the stream with that ticket.
- **Money:** stored as integer cents and formatted only in the UI.

## Added during implementation (phase 2 — workshop flow)

These go beyond or adjust the prototype. Each one closes a gap found while building the real flow.

- **"Awaiting Payment" tab in the Workshop Queue.** A job card stays DRAFT until the cashier takes the minimum advance, and the prototype gave the supervisor no way to find it there. The tab lets them check, edit or void such a card (BR14). "All Jobs" still means the paid queue.
- **Zero advance means straight to the queue.** If the minimum advance is 0 (for example, all-standard work at the default 0% standard rate), nothing is due, so the job card goes into the Workshop Queue as soon as it is created or edited. The balance is still collected at the cashier.
- **BR21 "active session" window.** A supervisor counts as active if they have a live session created in the last 30 minutes. While the app is open it refreshes its token every 15 minutes, and each refresh creates a new session row. Sessions alone last 7 days, so they can't be used for this.
- **Removed lines are cancelled, not deleted.** Editing a job card marks removed sub-jobs CANCELLED, so their history is kept.
- **Sub-job editing reuses the template panel** ("Update Sub-Job" / "Cancel edit") instead of the prototype's separate inline edit form. The fields are the same.
- **Sheet rolling on a Cut/Bend sub-job** is a custom charge, so it appears only in custom mode. The prototype also ignored it for standard pricing.
- **Gate pass date range** uses two plain date inputs instead of the prototype's date-picker library (not part of this project's stack).
- **Chief accounts:** the server always generates the temporary password. The prototype's "type a password" and "send email" options were removed.
- **Customer lookup** (`GET /customers/lookup`) only needs a sign-in, not a specific permission, because both supervisors and cashiers use it to prefill intake forms. It returns only the id, name and phone.

## Added during implementation (phase 3 — roofing orders)

- **Placing = first payment.** A roofing order is created straight into the queue as *Placed* (IN_QUEUE) together with its placement payment, in one transaction. The amount must be at least the branch minimum (`orders.min_payment_to_place`) and at most the total. With a NONE policy an order can be placed with no payment (no payment row is written).
- **Only sheets use coil stock.** Starting an order deducts `length × pieces` ft for each branch-material sheet item (BR10). Accessories still record their coil for the workshop, but deduct nothing: their coil use per piece isn't known yet.
- **Coil snapshot.** Each line keeps the coil's number and description as they were when ordered, so the order still reads correctly if the catalogue changes later.
- **Coil picker shows our own stock** ("1,500 ft in stock" / "out of stock"). It is a hint only: placing is never blocked, and stock is checked when work starts (BR06: own branch only). *Superseded by [0003](0003-stock-reservation.md): placing now holds the coil, and the picker shows available ft.*
- **Design photos** are uploaded as soon as they are picked: JPEG, PNG or WebP, at most 5 MB, resized in the browser to 1600 px. They are stored on local disk (`UPLOAD_DIR`, default `apps/api/uploads`) behind `StorageService`. Until the order is saved, only the uploader can see a photo; after that, anyone at the order's branch can. Photos from forms that were abandoned before saving are not cleaned up yet.
- **Complete is order-level**, as in the prototype: every item is completed at once, and the person who completes is recorded as the inspector on each line (BR07).
- **Cashier edit and cancel** are built on the server and in the form (`/orders/:id/edit`), but supervisors don't see them. After an edit, an overpayment is shown as a refund due at the counter. Cancelling keeps the paid amount on the order and creates no refund record (BR16).
- **Order Queue counts follow the search and date filter**, the same rule as the Workshop Queue (the prototype counted every order). The Released, Cancelled and All tabs list the latest 200 orders, and their counts are always exact.
- **Order numbers** are `WO-FORM-00001` (sequence), instead of the prototype's random 5-digit number.

## Added during implementation (phase 4 — inventory, stock alerts, stock requests)

- **Own branch only (BR06), everywhere.** Inventory and Stock Alerts list only this branch's stock. The prototype's "All branches" total, the per-branch stock list and "Request from here" are gone. The item details popup shows this branch's **recent stock movements** in their place. The New Request form drops the "Other branch has" column and the "has X of N items" hints, and no longer picks the best-stocked branch: it lists other branch *names* only (those with Stock Request switched on), and the supplier checks their own stock when sending.
- **What Inventory lists:** every item the branch keeps a stock row for, coils only where the branch does roofing. The category list comes from those items.
- **Counts follow search and category** (not the status tab), the same rule as the queues. On Stock Requests, the header totals and the action badges (To Send / To Receive) are branch-wide and ignore the search.
- **Health rule:** Out = nothing left; Low = at or below the minimum; Need = minimum − stock (the full minimum when out). One shared function drives Inventory, Stock Alerts and the `stock_alert` rows, so they always agree.
- **One open request per item.** An item that is already Waiting or Sent from this branch can't be asked for again until it is received, rejected or cancelled (409 `TRF_003`). The check is serialised per branch, so two requests created at the same moment can't both pass.
- **Sending is capped at what was asked**, as well as at the supplier's own stock. (The prototype only capped at stock.) Lines can be sent as 0, but at least one item must be sent. Stock leaves the supplier on Send (TRANSFER_OUT) and arrives on Receive (TRANSFER_IN), so nothing is counted twice. Sending never uses the stock override.
- **Receiving short:** the requester enters what actually arrived (at most what was sent). Only that amount is added. The gap stays on record in the line quantities and the receive note, and is **not** returned to the supplier's stock automatically.
- **No approval step.** `APPROVED` / `approved_by` stay unused. A Waiting request can be rejected (with a reason, by the asked branch) or cancelled (by the asking branch). Once Sent it can only be received.
- **Late** = still open after the needed-by date (branch timezone). History lists show the latest 200 requests; counts are exact.
- **Numbers:** `GI-2026-0001` (yearly prefix, sequence).
- **Value check:** `pnpm check:numbers` checks every supervisor screen: each KPI and tab count must equal its list, and stock must equal the sum of its movements, never be negative, and have exactly one open alert while low.
