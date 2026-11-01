# 0010 — Workshop advance: material cost for standard work, supervisor-set for custom work

- **Status:** accepted (2026-11-01)
- **Scope:** Create / Edit Job Card, the cashier's payment gate, Branch Config → Job card advance.
- **Replaces:** the percentage-only rule of BR09 for job cards ([0001](0001-supervisor-dashboard.md)); builds on [0008](0008-job-card-custom-pricing.md).

## Why

The advance was a percentage of each line's total (30% custom, 0% standard). The workshop wants the advance to cover what it spends up front: on standard work that is the branch material; on custom work the supervisor judges it per job, starting from the branch percentage.

## Decisions (confirmed by the product owner)

| Sub-job | Advance | Supervisor can change it |
|---|---|---|
| Standard Cut / Bend on branch sheets | The sheet cost (sheet price × qty) | No |
| Custom Cut / Bend on branch sheets | Suggested: the sheet cost only | Yes, 0 to the sub-job total |
| Any other custom sub-job (customer material, custom Rolling / Coil Cutting, auto-custom for a missing rate) | Suggested: `min_advance_pct_customized` of its total | Yes, 0 to the sub-job total |
| Standard Rolling / Coil Cutting | Unchanged for now: `min_advance_pct_standard` of its total (default 0) | No |

- **One amount per sub-job.** The card's advance is the sum. With a sum of 0 the card still waits at the cashier, who sends it to the Workshop Queue without a payment (0005, 2026-11-01).
- **Edits recalculate.** Editing a sub-job, or the card, puts every typed advance back to its suggestion.
- **No edits after a payment.** Once the cashier takes any amount, the card can't be edited (`ORD_027`); void it while still unpaid, or start a new card. This removes BR26's "more advance is due" path.
- **Deferred:** pricing and deducting the coil on Coil Cutting, and any material advance for Rolling.

## Implementation notes

- `PricedWorkshopLine.material_total` is the branch sheet cost of a Cut / Bend line.
- `suggestedLineAdvance`, `lineAdvance`, `advanceEditable` and `jobCardMinAdvance` (a plain sum) live in `packages/shared/src/domain/payments.ts`.
- A line takes an optional `advance` (cents). The server uses it only on a customized line and refuses one above the line total (`ORD_026`). The audit record lists any advance that differs from the suggestion (`advance_overrides`).
- The saved advance is `order_line.suggested_advance` (no migration). Payment gate, Cashier Queue, Workshop Queue and order detail all add up that column over active lines.
- `can_edit` on a job card is false once `paid_amount > 0`.
- **API cost:** the form leaves typed advances out of `POST /job-cards/quote`. The quote returns each line's `suggested_advance` and `advance_editable`, and the form adds the advances up itself, so typing an amount sends no request.
