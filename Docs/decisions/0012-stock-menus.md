# 0012: Stock menus: one job per page (Stock Levels, Restock, Stock Requests)

- **Status:** accepted (2026-11-02)
- **Scope:**
  - the sidebar
  - Inventory → **Stock Levels**
  - Stock Alerts → **Restock**
  - Stock Request → **Stock Requests**
  - branch minimums
- **Builds on:**
  - [0002](0002-global-scope-and-main-branch.md): network pages, head office view-only, Naiwala main
  - [0003](0003-stock-reservation.md): holds
  - [0009](0009-live-material-warnings-and-alerts.md): free stock, badge, no polling
- **Sources:** how Odoo's Inventory app splits its stock work:
  - Reporting → Stock (look up)
  - Operations → Replenishment (act on what is below its reordering rule)
  - Transfers (documents between warehouses, with a "resupply from" warehouse)
  - Configuration → Reordering rules
  - Pricelists live in Sales, not Inventory

## Problem

Supervisors had three stock pages that looked like one page shown three times:

- **Stock Alerts duplicated part of Inventory.** It ran the same query as Inventory's Low / Out tabs, in the same page shell (search, tabs, category, table).
- **A request could start in three places:** the Inventory popup, an Alerts row, and the New Request tab.
- **The number shown didn't match the status.** "In stock" showed on-hand stock while the status followed free stock (0009).
- **Price List looked like a fourth stock page** for head office, because it lists the same items.
- **Nobody could change a minimum.** `branch_stock.reorder_level` came from the seed only.

## Decisions (confirmed by the product owner)

| Topic | Decision |
|---|---|
| Sidebar | A **Stock** section holding Stock Levels, Restock and Stock Requests (routes unchanged: `/inventory`, `/stock-alerts`, `/stock-requests`). Price List stays under Settings: pricing is not stock. |
| Stock Levels | A lookup report. Columns: On hand / **Booked** (held + booked beyond stock) / **Free** / Minimum / Status. The status follows Free, and Free is the emphasised number. Status is a filter, not tabs. No request button. A low item's details link to Restock. |
| Restock | The to-do list (Odoo Replenishment). It lists items below their minimum that have **not been asked for yet**. Tick items, adjust "Ask for" (suggested = back to the minimum, covering any override shortfall), pick the branch (main first) and "Needed by", then **Send request** from the page. "More options" opens the full form. Items with an open request move to a collapsed **Already requested** list, so the to-do list empties as the branch acts. |
| Restock badge | Counts the to-do list only (items below minimum and not requested). This changes 0009, where the badge counted every item below minimum. |
| Stock Requests | Inbox first. **To do** (to send + to receive) is the default tab, then Requests to Us / Our Requests. "New Request" is a header button. The KPI strip and notice banners are gone, because the tabs carry the counts. |
| Stock Requests badge | Shows to send + to receive. Branch staff only: head office can't act, so it gets no to-do bubble. |
| Minimums | **MANAGER** (branch manager) sets an item's minimum for their own branch from the Stock Levels details. The permission is `configure:stock_minimum` (a branch write). It is a branch write, so it cannot be granted to head office roles (403). |
| Head office | The same three pages are read-only reports. Stock Levels = items × branches. Restock = every branch's shortages with what Naiwala holds; already-requested items show only when "Include already requested" is ticked. Stock Requests = every request. |

## API

| Endpoint | What it does |
|---|---|
| `GET /stock-alerts` | Now returns `rows` (to do), `requested`, and `counts.requested`. `needs_restock`, `critical` and `low` count the to-do list only. `/network/stock-alerts` works the same way. |
| `GET /stock-alerts/count` | Counts the to-do list (`needsRestock()` in `InventoryService`). `/network/stock-alerts/count` uses the same rule. |
| `PATCH /inventory/:itemId/minimum` | Body `{ reorder_level }`. Needs `configure:stock_minimum` and `@BranchId()`. `StockService.setMinimum` locks the row, updates it and re-syncs `stock_alert`. The change is audited (`branch_stock` / `SET_MINIMUM`, old → new) and sends the live `stock` topic. |
| `GET /stock-transfers/count` | Returns `{ count: to_send + to_receive }` for the badge. Its query key sits under `['stock-transfers']`, so the live `transfers` topic refreshes it. |

- `stockAlertInfo`: when free stock is below zero (booked beyond stock), the OUT deficit is now `minimum − free`, not just `minimum`.
- Inventory sorting by stock now sorts by free stock.
- Migration `1761800000000-StockMinimum` adds the permission and grants it to MANAGER.

`pnpm check:numbers`: "Restock to-do + requested = Stock Levels low + out".

## Not covered yet

- Stock count / manual adjustment (the `ADJUSTMENT` movement type is unused).
- Goods receipt at the main branch (deferred in 0002).
- A maximum level ("order up to") alongside the minimum.
- Reading the `stock_alert` history on screen.

## UI (2026-11-02): queue-board theme

The three pages were copies of the 2026-10-23 prototype. They now use the same theme as the role queues ([0005](0005-role-queues.md)), laid out like Odoo's Inventory: overview cards, then a list for the card you pick, with "New" opening a form.

**Every page**
- `StockPage` shell: title, refresh and search in the header, buttons on the right, no subtitle.
- `StatusCards` above one `BoardSection`. Filters and sort sit in the board header (its new `actions` slot).
- Queue-style tables, where the whole row is clickable.
- Results show as a `Notice` banner, not a toast.
- `.btn-primary` / `.btn-secondary` buttons; red for danger.
- One set of badges in `StockBadges.tsx`.

**Stock Levels**
- Look-up cards: All items / Booked / Requested / Below minimum.
- Below minimum opens Restock, so Restock stays the only to-do list.
- A row opens its details.

**Restock**
- Lifecycle cards: To restock → Requested → On the way. These replace the "Already requested" panel.
- The send bar floats at the bottom of the screen while items are ticked. It sits outside the board because the board clips overflow.
- "More options" opens the New Request popup, prefilled.

**Stock Requests**
- Cards: To send / To receive / Waiting on others / History. History loads only when picked; head office loads it up front.
- Requests show in a table (`TransferTable`), which replaces the `TransferRow` cards.
- New Request opens as a popup (`?new=1&items=…`).
- Old `?tab=` links are mapped to the new cards.

**Head office**
- The same cards and boards, read-only.
- The KPI ribbon and segmented tabs are gone.
