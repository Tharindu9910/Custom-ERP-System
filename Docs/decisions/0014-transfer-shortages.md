# 0014: Stock requests that arrive short: a reason at receive, the manager settles the loss

- **Status:** accepted (2026-11-04)
- **Scope:** receiving a stock request (Stock Requests → To receive) when fewer units arrive than were sent.
- **Builds on:**
  - [0003](0003-stock-reservation.md): free stock
  - [0012](0012-stock-menus.md): Stock Requests inbox and badge
- **Sources:**
  - Inbound discrepancy handling in WMS/ERP: SAP "goods receipt with difference", Odoo backorders / scrap on receipt. The counted quantity is booked at once; the difference is a separate, approved document.

## Problem

Branch A sends 10 sheets; when the lorry arrives Branch B counts 8. Before this change, B entered 8 and the request closed as Received:

- the 10 had already left A's stock when A pressed Send
- 8 went into B's stock
- **the other 2 were in no branch and nothing recorded them**

A line left out of the receive was counted as 0, so it disappeared in the same way. A stock count or a review couldn't explain where the stock went.

## Decisions (confirmed by the product owner)

| Topic | Decision |
|---|---|
| Counting | Every sent line must be counted on receive, even if nothing arrived (enter 0). A line left out is refused (`TRF_011`). |
| Reason | A line counted below what was sent needs a reason: **Damaged in transit**, **Missing on arrival**, **Sender loaded fewer**, or **Other**. Other needs a note; a note is optional for the rest (`TRF_012`). |
| What arrived | Goes into the receiving branch's stock **at once** (TRANSFER_IN), so it can be used straight away. |
| The missing part | The request becomes **Short — awaiting manager** (`SHORTAGE_PENDING`). The missing units are in no branch's stock. |
| Who settles it | **Always the receiving branch's manager**, whatever the size (`approve:transfer_shortage`, MANAGER by default). Supervisors and cashiers can see it but not settle it. |
| Approve loss | Writes one `TRANSIT_SHORTAGE` stock movement per short line: the quantity is 0 (on-hand stock doesn't change; the goods never arrived) and the reason says how many, why, and the note. The request closes as Received, with who approved it and when. |
| Correct count | When more turns up later, the manager raises the count. It can only go up, and never above what was sent (`TRF_013`). The extra goes into stock (TRANSFER_IN). If nothing is short any more the request closes; otherwise it stays Short for approval. |
| Asking again | A Short request doesn't block asking for the item again: what came is in stock, and the missing part may never come. |
| Who sees it | **Asking branch:** a new **Shortages** card, and the manager's badge. **Sending branch:** "Waiting on others". **Head office:** an "Arrived short" card (read-only). |

## API

- `POST /stock-transfers/:id/receive`: every line, with `shortage_reason` / `shortage_note` on short lines.
- `POST /stock-transfers/:id/shortage/approve` (approve:transfer_shortage).
- `POST /stock-transfers/:id/shortage/correct` `{ lines: [{ transfer_line_id, qty_received }] }` (approve:transfer_shortage).
- The lists, the detail and the count also open with `approve:transfer_shortage` (`@RequireAnyPermission`), so a manager can review without being able to ask for or receive stock. The badge counts to send + to receive for staff with `request:stock`, plus shortages for the manager.

## Not decided here

- **Recall / lost in transit** for a request that was sent but never arrives at all (still Sent): needs its own approval.
- **Who bears the cost** (sender or receiver) in the ledger: there are no stock-value entries yet.
