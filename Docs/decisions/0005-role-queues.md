# 0005 — Role queues: status boards with user-driven moves

- **Status:** accepted (2026-10-27)
- **Scope:** job cards on the Workshop Queue and the Cashier Queue; the roofing Order Queue joined on 2026-10-31 (see the end).
- **Supersedes:** in [0001](0001-supervisor-dashboard.md), "Completed (workshop) is derived", the Workshop Queue status tabs and date filter, and "Awaiting Payment" on the Workshop Queue.

## Decisions (confirmed by the product owner)

| Topic | Decision |
|---|---|
| Payments any time | As in ERPNext / Odoo / SAP, payment status and work status are independent: the cashier can take a payment on any open job card. The **In Workshop** card lists every In Queue / In Progress card, paid or not; **Take Payment** (only while money is owed) opens the checkout and only lowers the balance — the card stays in the workshop, and a fully paid one shows "Waiting for workshop". Only the minimum advance moves a card. A card paid in full mid-job goes straight to the supervisor's Ready for Collection when it is marked finished. (2026-11-01) |
| One area per role | The **cashier** sees Awaiting Payment, In Workshop and Finished – Balance Due: they only collect money. The **supervisor and chief** see In Workshop Queue, Ongoing, Finished (still owing, read-only) and Ready for Collection. Managers and head office open the same two pages with their existing permissions; head office stays view-only. (2026-11-01) |
| Board, not filters | Each page shows only its own statuses, in lifecycle order, each with a count. There is no KPI ribbon or date filter, and search covers every status. Both queues show one card button per status; the selected card shows only its orders in a full-width list, each row with its move button. Roofing balances get their own card on the Cashier Queue. |
| The user moves the card | A card changes column only when someone presses its button. Nothing moves on its own except the payment gate: the cashier taking the advance is the move from Awaiting Payment to In Queue. |
| Every card starts at the cashier | As drawn by the product owner (2026-11-01): Create Job → Awaiting Payment → (full or advance payment) → In Queue. A card with a Rs 0 minimum advance also waits there ("No advance"); the cashier takes a payment or presses **Send to Workshop (no payment)** in the checkout (`POST /job-cards/:id/send-to-workshop`, `process:payment`; refused with ORD_005 while an advance is due). |
| Card and sub-job | **Start Job** moves the card to In Progress and starts the sub-jobs ticked in its dialog (all by default). The others start later from the card, and a sub-job can only start once the card is In Progress. **Mark Completed** needs every sub-job started; it completes the ones still in progress (the user is the inspector, BR07). Completing single sub-jobs never moves the card. |
| Cashier checkout | Every cashier payment (Take Advance, Take Payment, Collect Balance, roofing balance) opens a checkout **on the Cashier Queue page itself** (`?checkout=<order>`), not a popup. Step 1 lists every item in full (spec, material source, qty, unit price, amount) and the cashier ticks each one off with the customer; Take Payment unlocks only when all are ticked. Step 2 takes the amount, mode and reference. The ticks are not saved. (2026-11-01) |
| Hand-over | The cashier never closes a card. A finished card paid in full is **Ready for Collection** (derived: COMPLETED with balance 0) on the Workshop Queue. **Check & Hand Over** opens on that page (`?handover=<order>`): the supervisor ticks every item off against what the customer takes, enters **Received by** (required) and an optional note, and the card is CLOSED. The ticks are not saved. The server refuses a close while a balance is due, and a payment can no longer carry `close`. Permission `close:job_card` moved from CASHIER to **SUPERVISOR**; MANAGER keeps it, the chief does not have it. (2026-11-01) |

## Lifecycle

```
DRAFT ─[Cashier: Take Advance / full payment / Send to Workshop if Rs 0]─▶ IN_QUEUE ─[Supervisor: Start Job]─▶ IN_PROGRESS ─[Supervisor: Mark Completed]─▶ COMPLETED
COMPLETED, balance due ─[Cashier: Collect Balance]─▶ COMPLETED, paid in full (Ready for Collection) ─[Supervisor: Check & Hand Over]─▶ CLOSED
```

| Stored status | Label | Board column | Who moves it on |
|---|---|---|---|
| DRAFT | Awaiting Payment | Cashier · Awaiting Payment | Cashier (advance, or Send to Workshop when nothing is due) |
| IN_QUEUE | In Workshop Queue | Workshop · In Workshop Queue | Supervisor / Chief (Start Job) |
| IN_PROGRESS | In Progress | Workshop · In Progress | Supervisor / Chief (Mark Completed) |
| COMPLETED, balance due | Finished | Workshop · Finished (read-only) and Cashier · Finished – Balance Due | Cashier (Collect Balance) |
| COMPLETED, paid in full | Ready for Collection | Workshop · Ready for Collection | Supervisor / Manager (Check & Hand Over) |
| CLOSED | Closed | — (History only) | — |

## Technical notes

- `order_status_enum` gets **COMPLETED** (job cards only; roofing READY stays derived). The migration moves job cards that were IN_PROGRESS with every active line COMPLETED to COMPLETED.
- Endpoints: `POST /job-cards/:id/start` `{version, line_ids, override?}`, `POST /job-cards/:id/complete` `{version, note?}`, `POST /job-cards/:id/close` `{version, released_to, notes?}`. `POST /orders/:id/payments` no longer takes `close` / `released_to` (the schema is strict).
- Migration `1761700000000-SupervisorHandOver` moves `close:job_card` from CASHIER to SUPERVISOR.
- Closing sets `released_to/by/at` and `release_notes`, as a roofing release does.
- The Cashier Queue lists drafts, every job card in the workshop (In Workshop), and finished cards that still owe money (Finished – Balance Due); names follow the product owner's workflow drawing (2026-11-01). Roofing orders with a balance due keep their own column.
- Unpaid drafts are no longer on the Workshop Queue. The supervisor edits or voids them from **Create Job Card → History**.
- A gate pass still counts customer material as used once every sub-job is done, even before Mark Completed.

## Order Queue (roofing), 2026-10-31

The Order Queue is the same kind of board (`shared/components/StatusBoard.tsx`, used by all three queues):

| Card | Roofing status | Row buttons (by permission) |
|---|---|---|
| In Queue | PLACED | Edit, Cancel (cashier) · **Start Job** (supervisor / chief) |
| Ongoing | IN_PROGRESS | **Mark Finished** |
| Ready for Release | READY (derived) | **Release** once fully paid (supervisor); **Collect** while a balance is due (cashier); otherwise "Waiting for cashier · Rs X due" |

- One board for every role; the server enforces the same permissions. Start Job and Mark Finished ask for confirmation; a short coil still opens the stock override (0003). Results show as a banner.
- No KPI ribbon, status tabs or placed-on date filter; one search covers the three cards. The Ready card notes how many are unpaid.
- Released and cancelled orders leave the board. **History** on the Order Queue opens the Order History popup; `GET /roofing-orders/history` now needs `view:orders` (every role with `create:roofing_order` has it), so supervisors without Create Order can use it.
- Balance collection in general stays on the Cashier Queue (Roofing – Balance Due).

## Roofing orders go through the cashier, and the Order Queue matches the Workshop Queue (2026-11-01)

Confirmed by the product owner: Create Order works like Create Job Card.

| Topic | Decision |
|---|---|
| Who takes money | Only the cashier (`process:payment`) sees **Pricing & Payment** on Create Order and places the order with the payment, straight into the Order Queue (In Queue). Anyone else (supervisor, chief) sees **Pricing** only (total and the minimum to collect) and **Submit Order** saves it unpaid (DRAFT). The server refuses a payment from anyone else (`ORD_029`). |
| Discount | Cashier only. Others submit with no discount and can't change one on edit (`ORD_028`). |
| Unpaid orders | A DRAFT roofing order waits on **Cashier Queue → Awaiting Payment** next to job cards; its "advance due" is the branch minimum to place, fixed on save (`header.min_to_place`, recalculated on edit). Paying it moves the order to the Order Queue (In Queue). With a Rs 0 minimum the cashier presses **Send to Order Queue (no payment)** (`POST /roofing-orders/:id/send-to-queue`, `process:payment`). |
| Order date | Stamped by the server on create (branch date); not on the form, never changed by an edit. |
| Create Order page | **Create Order / Order History** tabs (`?tab=history`), like Create Job Card. The banner offers **Open Order**. |
| Editing | An unpaid DRAFT is edited by whoever creates orders (`create:roofing_order`), from the History tab. Once money is taken, or the order is In Queue, it is the cashier's edit (`edit:order`, `allow_cashier_edit_before_start`, until work starts). The cashier can cancel a draft. |

The Order Queue board now has the Workshop Queue's four cards:

| Card | Roofing status | Row buttons (by permission) |
|---|---|---|
| In Queue | PLACED | Edit, Cancel (cashier) · **Start Job** (supervisor / chief) |
| Ongoing | IN_PROGRESS | **Mark Finished** |
| Finished | READY, balance due | none: "Waiting for cashier · Rs X due" (collected on Cashier Queue → Roofing – Balance Due) |
| Ready for Release | READY, paid in full | **Check & Release** (`release:order`): opens in the page (`?release=<order>`), the supervisor ticks every item, enters **Received by** and releases. Same component as the job card hand-over. |

This replaces the 2026-10-31 table above: Collect is no longer on the Order Queue, and the Release popup is gone. The **History** button stays on the Order Queue, so managers and auditors (`view:orders` without Create Order) can still find released and cancelled orders.
