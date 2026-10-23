# 0003: Branch stock is held from saving an order until its work starts

- **Status:** accepted (2026-10-23)
- **Scope:** job cards (branch Cut/Bend sheets), roofing orders (coil ft for sheet items), stock requests (sending), Inventory.
- **Replaces:** two lines in [0001](0001-supervisor-dashboard.md): "Not enough stock … blocked with a 409" (at start only) and "Coil picker … placing is never blocked".

## Problem

Stock was checked only when work **started** (BR10). Between saving an order and starting it, nothing held the material. Example: a branch has 10 sheets. Job card A needs 6, is saved and paid. Job card B needs 6 and starts first, taking 6. A is paid for, but only 4 sheets are left when A starts. Saving an order also never compared what it needed with what the branch had.

## Decisions (confirmed by the product owner)

| Topic | Decision |
|---|---|
| When stock is held | When the order is **saved**: a job card at creation (DRAFT), a roofing order at placement. A draft holds stock until it is voided. |
| Not enough available | 409 `STK_001` with the shortage list, as at start today. With the branch override (password + reason, audited) the order is saved. It holds what is free, and the rest is recorded as an authorised shortfall. |
| Roofing | Same rule: coil ft (`length × pieces`) per branch-material sheet item is held at placement. |
| Inventory | Shows **On hand / Reserved / Available**. Low/Out health and stock alerts stay on **on hand** (what is on the shelf). |

## How it works

- `available = on hand − reserved`. `branch_stock.reserved_quantity` keeps the total held per branch item. The database guarantees `0 ≤ reserved ≤ on hand`.
- `stock_reservation` keeps one row per order line: `quantity` held, `shortfall` authorised by an override, and status `RESERVED → CONSUMED` (work started) or `RELEASED` (edited / voided / cancelled).
- `StockService` is still the only writer of both tables:
  - `reserveMany`: on save. It locks the rows, checks available, and holds.
  - `releaseForOrder`: on edit (then holds again for the new lines), void and cancel.
  - `deductMany`: at start. It consumes the line's own hold first and takes anything extra from available stock only. An authorised shortfall is taken as an OVERRIDE movement with the original reason, and the password is **not** asked again. Any new shortage still gets 409 + override.
- A stock request can only **send** available stock: what open orders hold stays at the branch. The send screen shows "We can send".
- The coil picker and the stock-request send screen show available stock.

### Worked example

10 sheets on hand. A (6) is saved: reserved 6, available 4. B (6) is refused: available 4. B with an override: holds 4 with shortfall 2, so reserved 10, available 0. A starts: on hand 4, reserved 4. B starts: on hand 0, reserved 0. Its movement is OVERRIDE "short by 2" with B's reason.

## Existing data

Orders saved before this change hold nothing. After deploying, run once:

```
pnpm --filter api backfill:reservations           # dry run: lists what it would hold
pnpm --filter api backfill:reservations --apply
```

It holds oldest orders first. Anything that can't be held is recorded as a shortfall ("backfill: stock already short …"), so those orders start exactly as before. Running it again does nothing.

`pnpm check:numbers` now also checks that reserved = the sum of open holds, that 0 ≤ reserved ≤ on hand, that no hold is left on a voided/closed order or started line, and that every unstarted branch-material line has a hold.

## Not covered yet

- Hardware sales and BUY_MATERIALS ("deduct at payment", PRD BR10) are not built. When they are, they should hold with `reserveMany` at creation and deduct with `deductMany` at payment.
- Cancelling started work (BR15 attestation) is unchanged.
- Drafts never expire their hold. If unpaid drafts start tying up stock, an expiry (branch setting) can be added later.
