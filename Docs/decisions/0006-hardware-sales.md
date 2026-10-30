# 0006 — Hardware Store and Hardware Queue

- **Status:** accepted (2026-10-28)
- **Scope:** counter sales of hardware items (`order_type = HARDWARE_SALE`). Job cards and roofing are unchanged.
- **Builds on:** [0003](0003-stock-reservation.md) (hold at creation, deduct at payment), [0005](0005-role-queues.md) (role queue boards), [0002](0002-global-scope-and-main-branch.md) (head office is view-only).

## Decisions (confirmed by the product owner)

| Topic | Decision |
|---|---|
| Supervisor | Uses the **Hardware Store** for **their own branch only**. Place Order creates an **unpaid** order that goes to the branch cashier. Supervisors never take money. |
| Cashier, own branch | Uses the Hardware Store as a **counter sale**: the order is placed and **paid in full in one step**, so it goes straight to Paid. |
| Cashier, another branch | Only cashiers may order on another branch. The order is **owned by the branch that has the goods** (its stock, its queue). The ordering cashier takes an **advance only**: at least that branch's minimum %, always less than the total. The other branch's cashier collects the balance. |
| Seeing other branches' stock | Allowed **for this flow only**: a cashier with the cross-branch permission sees another branch's *hardware* stock in the store. This is a narrow exception to BR06, granted by its own permission. Supervisors still see only their own branch. |
| Hardware Queue | Same board layout as the other queues: **Awaiting Payment → Paid Today**. Paying the balance completes the sale. There is no separate collection step. |
| Stock | **Held** when the order is placed and **deducted** when it is paid in full. There is no override in the store: it only sells what is free. |
| Customer | Optional. With no customer it is a walk-in. A customer is found or created by phone, as on job cards. |
| On/off | **Role permissions** decide who (Role Permissions page). **Branch feature switches** `hardwareStore` / `hardwareQueue` decide where. Both are enforced on the server. |
| Cancel | Only while Awaiting Payment. Held stock is freed. An advance already taken is **not refunded** (RULE 17 / BR16) and is booked as a loss at the branch that received it. |

## Lifecycle

```
Supervisor (own branch)      ─▶ IN_QUEUE (Awaiting Payment) ─[Cashier: Collect Payment]─▶ CLOSED (Paid)
Cashier (own branch)         ─▶ IN_QUEUE ─▶ CLOSED                        (one transaction)
Cashier A for branch B       ─▶ IN_QUEUE at B, advance paid at A ─[Cashier B: Collect balance]─▶ CLOSED
Any Awaiting Payment order   ─[Cancel]─▶ VOIDED
```

| Event | Order | Stock | Money |
|---|---|---|---|
| Place | `IN_QUEUE` (lines `PENDING`) | `reserveMany` at the owning branch | Counter sale: FINAL payment. Cross-branch: ADVANCE received at A. |
| Pay balance | `CLOSED` (lines `COMPLETED`, `released_at` = paid time) | `deductMany(SALE)` consumes the hold | FINAL payment, ledger 1200 Dr / **4100 Material Revenue** Cr |
| Cancel | `VOIDED` (lines `CANCELLED`) | `releaseForOrder` | Advance (if any) → 5200 loss at the receiving branch |

Transitions come from `canTransitionHardware` / `canTransitionHardwareLine` (`packages/shared/src/domain/order-status.ts`). The shared job card table is unchanged, so job cards still cannot jump from IN_QUEUE to CLOSED.

## Permissions

| Permission | Grants | Default roles |
|---|---|---|
| `create:hardware_sale` | Hardware Store; place orders for own branch | SUPERVISOR, CASHIER |
| `create:cross_branch_hardware_sale` | Pick another branch in the store, see its hardware stock, place an advance-only order there | CASHIER |
| `view:hardware_queue` | Hardware Queue | CASHIER, MANAGER, ADMIN, AUDITOR |
| `cancel:hardware_sale` | Cancel an Awaiting Payment order | SUPERVISOR, CASHIER |

Taking any payment (counter sale, advance, balance) also needs `process:payment`. The server works out which of the three paths applies from the request and the user's grants, never from a client flag.

## API

| Endpoint | Guard | Notes |
|---|---|---|
| `GET /hardware-store/items?branch_id=` | `create:hardware_sale` + `hardwareStore` | `{ branch, branches, remote_min_advance_pct, items }`. One join, no paging; the store filters and searches in the browser. |
| `POST /hardware-sales` | `create:hardware_sale` + `hardwareStore` | `{ client_request_id, branch_id?, customer?, notes?, lines[{item_id, quantity}], payment? }`. Idempotent. Prices come from `item.price` on the server. |
| `GET /hardware-queue` | `view:hardware_queue` + `hardwareQueue` | `{ rows, counts }`: every Awaiting Payment order plus Paid Today (Asia/Colombo day). Counts come from the same rows. |
| `POST /hardware-sales/:id/pay` | `process:payment` + `hardwareQueue` | `{ client_request_id, version, amount, mode, reference? }`. `amount` must equal the balance. |
| `POST /hardware-sales/:id/cancel` | `cancel:hardware_sale` | `{ version, reason }` |

The detail modal reuses `GET /orders/:id`. `POST /orders/:id/payments` refuses hardware orders (`ORD_011`), so a partial payment can't skip the stock deduction. Writes nudge the live topics `orders`, `payments` and `stock` for the owning branch, and `payments` for the ordering branch.

## Schema (migration `1761600000000-HardwareSales`)

- `order.origin_branch_id`: the branch whose cashier placed the order (null = same branch).
- `payment.received_branch_id`: the branch where the money was taken (backfilled from the order). The cross-branch advance belongs to B's order but is cash in A's drawer.
- `orders.hardware_remote_min_advance_pct` (branch setting, default 30): the minimum advance for orders other branches place here. Set in Branch Config.

## Differences from the prototype

- The prototype's Store had a free branch picker and kept its own copy of stock. Here the branch comes from the login, and only cashiers with the cross-branch permission can switch.
- The prototype's Store paid every sale on the spot, and its Queue was never fed by anything. Here supervisor orders are unpaid and go to the Queue.
- The prototype's Queue had no stock effect. Here payment deducts the held stock.
- There is no discount on hardware sales: neither the prototype store nor this decision has one.

## Follow-ups (not built)

- **Revenue across branches:** a cross-branch advance sits in 2100 Advances at A, while the balance is recognised as 4100 revenue at B. Moving the advance into revenue between branches needs an accounting decision. Job cards have the same single-branch gap today: only the final payment is booked as revenue.
- **Cost of goods (5100)** is not booked on deduction. Nothing calls `recordStockDeduction` yet, for any order type.
- **Receipt printing** from the Hardware Queue.
