# 0013: New catalogue products: a branch asks, its manager approves (maker–checker)

- **Status:** accepted (2026-11-02)
- **Scope:** adding new products (SKUs) to the catalogue: Stock Levels (New item, Item requests), Price List → Item prices.
- **Builds on:**
  - [0002](0002-global-scope-and-main-branch.md): head office view-only on branch work
  - [0004](0004-global-price-list.md): one global price list
  - [0012](0012-stock-menus.md): Stock Levels, minimums
- **Sources:**
  - Maker–checker / segregation of duties for master data: SAP MDG change requests, Odoo product creation limited to managers or run through the Approvals app.
  - An entry only takes effect when someone validates it.

## Problem

There was no way to add a product to the catalogue: items came from the seed only. The user wants roles from supervisor up to add products, with a supervisor's product checked first.

A new active item is offered and priced at **every branch at once**:

- Sheets are priced by `material_type + thickness` (`pricing.service.ts`).
- Coils are found by thickness, colour and origin.
- New items appear in the job-card form, the coil pickers and Stock Requests item search.

So a wrong attribute, a duplicate or a zero price would misprice jobs everywhere.

## Decisions (confirmed by the product owner)

| Topic | Decision |
|---|---|
| What "add an item" means | A **new catalogue product** (master data), not stock arriving. Supplier deliveries are a separate document (Goods Receipt, below). |
| Supervisor | **New item** on Stock Levels creates an `item_request` (PENDING). It is a draft: it isn't in `item`, pricing or stock until approved. The supervisor may suggest a price and cost and add a note, and can cancel the request while it waits. |
| Approver | The **same branch's MANAGER** (`approve:item_request`). They may correct the fields, then set the **SKU**, **selling price** (> 0, except coils, which the roofing rates charge) and **cost**, and the branch **minimum**. Approval creates the item, starts a `branch_stock` row at that branch (0 on hand, so it shows in Restock), and links the item to the request. A reject needs a reason, which the supervisor sees. A decided request is final (`ITM_004`). |
| Manager's own product | Posts directly: the request is created and approved in one step. Still audited. |
| Head office | ADMIN / SUPER_ADMIN add products directly from **Price List → Item prices** (`create:item`), because the catalogue is global master data like the price list (0004). They **don't approve** a branch's requests: that is branch work (0002), so it's 403. They can read the requests. |
| Item types | All three (hardware, sheet material, coil). |
| Duplicates | Refused with `ITM_002`: same sheet `material_type + thickness`; same coil `origin + thickness + colour`; same hardware name. These are checked when asking and again when approving. A taken SKU gives `ITM_001`. Adds are serialised by an advisory lock. |
| Changes after approval | The request is never edited again. Price and cost changes go through Price List (already audited); minimums go through Stock Levels. |

## Audit

| Event | Recorded |
|---|---|
| `item_request` CREATE | the asked fields |
| `item_request` APPROVE | the final SKU, price, cost and minimum (before: PENDING) |
| `item_request` REJECT | the reason |
| `item_request` CANCEL | |
| `item` CREATE | SKU, price, cost and the request id |

The stock ledger is untouched: a new item starts at 0, and stock only arrives through documents (transfers, and later goods receipts).

## API

| Endpoint | Who | Notes |
|---|---|---|
| `POST /item-requests` | `request:new_item` (SUPERVISOR, MANAGER) | `@BranchId`, idempotent `client_request_id`. An `approve` block posts directly, and needs `approve:item_request`. |
| `GET /item-requests?status=OPEN\|ALL` | `view:inventory` | Head office reads by picked branch. |
| `GET /item-requests/count` | `approve:item_request` | The manager's badge (Stock Levels menu item and header). Live topic `item_requests`, no polling. |
| `POST /item-requests/:id/approve` \| `/reject` | `approve:item_request` | Own branch only; another branch's request is "not found" (BR06). |
| `POST /item-requests/:id/cancel` | `request:new_item` | The requester only, while PENDING. |
| `POST /items` | `create:item` (ADMIN, SA) | No `@BranchId`, like Price List. |

- `ItemCatalogService.createItem` is the only writer of new items.
- `itemDuplicateKey()` in `@erp/shared` is the one definition of "the same product".
- Migration `1761900000000-ItemRequests` adds the table and grants: `request:new_item` to SUPERVISOR and MANAGER, `approve:item_request` to MANAGER, `create:item` to ADMIN.

## Not covered yet

- **Goods Receipt** (supplier deliveries). The product owner wants it at **Naiwala and Veyangoda**, which changes BR13 ("restock only from main") and 0002 ("deferred"). It will follow the same draft → validate pattern, with the stock movement written on validation and the supplier's invoice / delivery-note number.
- A branch with no manager: its requests wait. Head office can see them but can't approve.
- Editing a product's name, unit or attributes after approval (only price and cost today), and deactivating a product from the UI.
