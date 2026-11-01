# 0008 — Job card "Custom" pricing vs customer material

- **Status:** accepted (2026-11-01)
- **Scope:** job card sub-jobs (`JOB_CARD`). Coil Cutting is unchanged (optional Custom toggle, never forced).
- **Builds on:** [0003](0003-stock-reservation.md) (branch material is held at creation), [0007](0007-job-card-customer-material.md) (material source and gate pass item are per sub-job).

## Why

The form treated a branch sub-job marked **Custom** the same as a sub-job on the **customer's material**: every standard input was hidden and dropped, and the line was priced from the hand-entered charges only. A branch custom Cut / Bend therefore named no sheets, so nothing was held or deducted from branch stock (BR10). The prototype (`CreateJobCard.tsx`) keeps the branch inputs on a custom job and only hides them for customer material.

## Decisions (confirmed by the product owner)

| Case | Cut / Bend | Rolling | Pricing choice |
|---|---|---|---|
| Branch, standard | Material Type, Thickness / Length, Inches, Material Qty, cut and bend counts | Type, Sub Type, Size, Quantity | Standard / Custom (when `allow_custom_jobs`) |
| Branch + Custom | Material, thickness, inches and qty **stay and are required**; counts grey out; custom cut / bend charges | Type and Sub Type stay (optional); Size and Quantity grey out; custom rolling charge | Standard / Custom, reason required |
| Customer material | No branch inputs (Inches too); the gate pass item; custom cut / bend charges | No branch inputs; custom rolling charge | None: always priced by hand |

- **Branch + Custom Cut / Bend price** = custom cut / bend charges **+ the sheets** (branch price × material qty). An uncatalogued material adds nothing (the hand rate covers it). The sheets are held on save and deducted on start, as for a standard line.
- **Sheet Rolling** (rate + quantity) is offered on **every** Cut / Bend sub-job, standard or custom, and is **always charged** when a rate is entered. It is stored as a `ROLLING` custom charge described "Sheet rolling".
- A standard line with a missing rate still needs a real custom price: a sheet rolling charge alone does not clear `PRC_001`.

## Implementation notes

- `WorkshopLineSchema` requires material type, thickness and quantity on every branch Cut / Bend line.
- `priceWorkshopLine` adds the sheets in custom mode and the sheet rolling charge in standard mode.
- `JobCardsService.priceAll` gives every branch Cut / Bend line its stock `item_id`, custom or not.
