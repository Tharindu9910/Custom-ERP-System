# 0009 — Live material warnings, booking-aware stock alerts, alert badge

- **Status:** accepted (2026-11-01)
- **Scope:** Create / Edit Job Card, Inventory and Stock Alerts levels, the sidebar.
- **Builds on:** [0003](0003-stock-reservation.md) (orders hold branch material at creation), [0007](0007-job-card-customer-material.md), [0008](0008-job-card-custom-pricing.md).

## Why

Supervisors found material problems too late: customer pieces over what a gate pass item has left were only flagged in a small footer note, and branch sheets beyond stock only showed as a stock-override popup after pressing Submit. Stock Alerts compared on-hand stock only, so sheets booked by open job cards (still physically in the store) never raised an alert until work started, and nothing in the menu showed that alerts existed.

## Decisions (confirmed by the product owner)

| Topic | Decision |
|---|---|
| Customer pieces over what is left | Red message on **Pieces Used** as you type; the sub-job cannot be added (the server refuses it anyway, ALC_001). A saved row that becomes over (another card took material) shows "Over by N". |
| Branch sheets over free stock | Amber message on **Material Qty** as you type, "Short N" on the row, and a summary by Submit. Saving still goes through the stock-override step; Submit is disabled only when the branch has overrides off. |
| Stock alert rule | An item is low / out by its **free** stock = on hand − held for open orders − booked beyond stock (override shortfall). Booking 8 of 10 sheets raises the alert on save. Inventory status uses the same rule; On hand / Reserved / Available are still shown as before. |
| Badge | Red count on the **Stock Alerts** menu item = items needing restock (same number as the tab). Head office on "All branches" sees the network total. |

## API cost

No polling and nothing per keystroke:

- The job card form loads `GET /items/workshop-catalog` **once** (sheet stock, coils, `override_allowed`; it replaced `/items/workshop-coils`) and works out shortages in the browser (`sheetNeeds`). Gate pass items were already loaded.
- The badge loads `GET /stock-alerts/count` (or `/network/stock-alerts/count`) once, with `staleTime: Infinity`.
- Both sit under query keys the live stream already refreshes (`stock` → `['items']`, `['stock-alerts']`; `transfers` → `['stock-alerts']`). Job card save / void / start already emit `stock`, so they refetch only when something changed.

## Implementation notes

- `freeStock()` in `packages/shared/src/domain/stock-status.ts` is the one definition.
- `InventoryService.stockRows()` folds the open shortfall into its query; `alerts`, `networkAlerts`, the item detail and the counts use `free`.
- `StockService.syncAlerts()` keeps the `stock_alert` history in step after deducting, adding, holding and releasing.
