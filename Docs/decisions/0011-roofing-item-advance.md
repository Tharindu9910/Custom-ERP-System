# 0011 — Roofing order advance per item

- **Status:** accepted (2026-11-01)
- **Scope:** Create Order (roofing), the Cashier Queue's Awaiting Payment, Order Settings.
- **Follows:** [0010](0010-workshop-advance.md) (job card advance per sub-job) and [0005](0005-role-queues.md) (roofing orders go through the cashier).

## Decisions (confirmed by the product owner)

| Topic | Decision |
|---|---|
| Per item | Every order item has its own advance, shown on the item card the way a job card sub-job shows it (same `AdvanceStrip`). |
| Standard item | Fixed: the branch's **Standard item advance** (`orders.min_advance_pct`) of the item total. |
| Customized item | Pre-filled with `min_advance_pct_customized` (the workshop's customized advance); the supervisor or cashier may type any amount from Rs 0 to the item total (`ORD_031` otherwise). A typed amount on a standard item is ignored. |
| Order minimum | The sum of the item advances, never more than the order total. It replaces the order-level policy: `orders.min_payment_to_place` (None / Advance / Full) is no longer used for roofing and is gone from Order Settings. |
| Editing | The cashier can still edit until work starts (0005). Editing an item puts it back on its suggested advance; the advances are recalculated on save. |

## Technical notes

- `RoofingLineSchema.advance` (cents, optional; kept by `normalizeRoofingLine` only on customized items). Rules: `suggestedRoofingAdvance`, `roofingLineAdvance`, `roofingAdvanceEditable` in `packages/shared/src/domain/payments.ts`; `roofingTotals(…, advances)` sums them.
- The quote returns `suggested_advance`, `advance`, `advance_editable` per line. The form leaves typed advances out of the quote request and adds them up locally, as Create Job Card does.
- Each line stores its advance in `order_line.suggested_advance` (as job cards do) and in its spec; the order keeps the sum in `header.min_to_place`, which the payment gate and the Cashier Queue use.
