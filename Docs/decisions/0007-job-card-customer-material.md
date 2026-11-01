# 0007 — Customer material per item (job cards and roofing orders)

- **Status:** accepted (2026-10-30)
- **Scope:** job cards (`JOB_CARD`, 2026-10-30) and roofing orders (`ROOFING_ORDER`, 2026-10-30, same day follow-up).
- **Builds on:** [0003](0003-stock-reservation.md) (branch material is held at creation). Gate pass balances and statuses are unchanged.

## Why

The Create Job Card form asked for material twice: a card-level "Material Source" and a per-sub-job choice. Users mix both in one card (sub-job 1 from a gate pass item, sub-job 2 from branch stock, sub-job 3 from another gate pass item…), so two controls confused them. The data could not say which gate pass material a customer sub-job used, so the workshop could not tell either.

## Decisions (confirmed by the product owner)

| Topic | Decision |
|---|---|
| Where material is chosen | **Per sub-job only.** Each sub-job is Branch Stock or the Customer's Material. There is no card-level choice. |
| Gate pass | Customer material **always** comes from a gate pass item, **in every branch**, whatever `general.require_gate_pass` says. The branch needs customer material allowed and the gate pass feature on. |
| Items per sub-job | **One** gate pass item (and the pieces used) per sub-job. Two materials mean two sub-jobs. |
| Several passes | A card may draw on any of the customer's passes. Several sub-jobs may share one item, as long as their total fits what is left. |
| Coil Cutting | Can use the customer's material like the other job types. Its price does not change (coil cutting is priced by range, not by material source). |
| Pricing | Unchanged. Customer Cut / Bend and Rolling are priced by hand. Branch Cut / Bend holds branch stock; customer lines never do. Custom vs customer material inputs and pricing: see [0008](0008-job-card-custom-pricing.md). |

## Model

- The line input carries `customer_material: { gp_item_id, quantity }`. It is stored in `order_line.spec` with the rest of the input, so the edit form reads it back.
- Each link is one `material_allocation` row with `line_id` set (the column already existed). No migration.
- `header.material_source` and `header.gate_pass_id` are no longer written for job cards. Edits drop them from older cards. "Has customer material" means the card has committed allocations.
- On save, every item the card uses is locked together (`FOR UPDATE`, ordered by item id), the pieces are summed per item across sub-jobs, and the total is checked against what is left (`ALC_001`). An item on another customer's pass is refused (`GP_003`). An edit releases the card's earlier rows first, then commits the new ones. Every pass touched before or after has its stored status re-synced.
- `GET /gate-passes/available?phone=&order_id=` also returns the passes a card being edited already draws on, even when they are used up. The form adds the card's own pieces back.

## Screen

- Step 1 lists the customer's gate pass items with what is left for this card, and has **Create New Gate Pass**.
- The sub-job editor: **a.** job type, **b.** Material (Branch Stock / Customer's Material → gate pass item + pieces used), **c.** pricing, **d.** details. A new sub-job starts on the material of the last one added.
- The sub-job list and the work order show each customer sub-job's gate pass item and pieces.
- Older cards whose material was held for the whole card show a warning on edit until each customer sub-job has its item.

## Roofing orders (Create Order)

The same model, item by item:

- No card-level Material Source step and no Gate Pass panel / Allocate modal. Each item picks Branch Stock or the Customer's Material; a customer item picks one gate pass item and the pieces it uses (`customer_material` on the line).
- Customer items never need or hold a coil and keep the customer per-ft rate (unchanged). The "Coil for the Whole Order" step shows only while there is a Branch Stock item (or one is being added).
- **Pieces used are suggested** for sheet items when the gate pass piece has a length: ⌈length × pieces ÷ piece length⌉ (inches ÷ 12). The suggestion fills the field while it is empty and stays editable.
- Customer accessories are added one row at a time (one gate pass item per item).
- `allocate:gate_pass_order` is still checked: on placing, when any item uses a gate pass; on editing, only when an item uses a gate pass item the order did not already hold.

## Branch setting

`general.require_gate_pass` is no longer read: a gate pass item is always required. The toggle is gone from Branch settings; the field stays in the schema so stored settings parse.
