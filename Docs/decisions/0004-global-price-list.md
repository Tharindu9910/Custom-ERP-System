# 0004: One price list for every branch, kept by managers

- **Status:** accepted (2026-10-25)
- **Scope:** work rates (`price_rate`), catalogue item prices (`item.price`, `item.unit_cost`), job card and roofing order pricing, Settings → Price List.

## Problem

Prices could only be set by the seed (`apps/api/src/database/seeds/catalog.ts`). Nobody could change a price from the app. `price_rate.branch_id` allowed a branch to override the master rate, but the business sells at the same price in every branch.

## Decisions (confirmed by the product owner)

| Topic | Decision |
|---|---|
| Branch prices | None. Every branch uses the same list, so `price_rate.branch_id` is removed. |
| Who edits | MANAGER and above (MANAGER, ADMIN, SUPER_ADMIN). It is a global setting, so ADMIN may edit even though head office is view-only on branch work ([0002](0002-global-scope-and-main-branch.md)). |
| Who views | The editors and AUDITOR (read-only). Supervisor, chief and cashier don't see the page. |
| What is on the page | Work rates (cut, bend, rolling, coil cutting, roofing sheet per ft, accessories) and catalogue item selling price and cost. |
| Rate changes | Change the amount, add a rate, deactivate or reactivate one. Never a hard delete. The key fields (work type, operation, material, size, material source) are fixed once a rate is created: to change them, deactivate it and add a new one. |

## How it works

- Permissions (in `PERMISSION_CATALOG`, so they show on Role Permissions): `view:price_list`, `configure:price_list` (work rates), `configure:item_prices` (item prices).
- API: `GET/POST /price-list/rates`, `PATCH /price-list/rates/:id`, `GET /price-list/items`, `PATCH /price-list/items/:id`. None of them take a branch.
- `findRate` needs every key field to match exactly. No match still means the line is customized and priced by hand (BR17/BR23).
- Only one **active** rate per key (unique index `idx_price_rate_lookup`). A duplicate is refused with `PRC_003`.
- Orders keep the price they were saved with (`order_line.unit_price`). A change affects new quotes only. Open order forms re-quote over the live stream (`prices` topic).
- Every change is audited (`price_rate` / `item_price`, before and after).
- Re-running the seed doesn't overwrite rates once any exist.
