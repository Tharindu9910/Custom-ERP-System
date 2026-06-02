# PRD: Saniro ERP – Workshop Module (Comprehensive) – v4

**Version:** 4.0
**Status:** Final for Development Handoff
**Date:** April 2026
**Author:** Product Manager

---

## 1. Executive Summary

**Objective:** Digitize manual fabrication processes at New Saniro Factory.

**North Star:** Ensure every gram of steel and every hour of labor is accounted for, billed correctly, and tracked in realtime.

### Key Architecture Shift (vs. FRS)

The system moves from a flat "onecard" model to a **Parent-Child structure** where one **Job Card** (the customer's order) can contain multiple **Work Orders** (specific workshop tasks: Cut, Bend, Pipe Bending, etc.).

**Stakeholder sign-off obtained:** This shift has been reviewed and approved by Branch Managers and Supervisors.

---

## 2. System Access & UI Logic

The system uses **Context-Aware UI**. Dashboards and available sections are filtered based on the user's specific **Branch** and **Role**.

### 2.1 Role Definitions & Full Permission Matrix

| Permission | Super Admin | Chief | Supervisor | Cashier | Branch Manager | Manager |
| --- | --- | --- | --- | --- | --- | --- |
| Create Job Card | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Enter price – Customized job | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Enter price – Standard job | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Modify price after creation | ✓ | ✓ (Supervisor only) | Supervisor only | ✗ | ✗ | ✗ |
| Verify & confirm system price | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| Override price entered by other | ✓ | Cannot override Supervisor | N/A | ✗ | ✗ | ✗ |
| Toggle 'Is Customized' | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Assign worker | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Mark WO complete | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Process payment | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Void / Cancel Job Card | ✓ | ✗ | Draft only | ✗ | ✓ | ✗ |
| Cancel InProgress WO | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ |
| Branch Manager override | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ |
| View all branches | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| System configuration | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

> *Cashier verifies system-generated price against price list – does not enter or override.*
> *Cashier role has read-only access to all price fields.*
> *Restrict price modification to Draft status only, with an explicit Branch Manager override for In-Queue status. Explicitly block all price modifications once status is In-Progress or beyond.*

**Chief Deference Rule (BR-21):** If a Supervisor has an active session at a branch, a Chief at the same branch cannot modify Job Cards or Work Orders created by that Supervisor. The system displays a message: *"A Supervisor is active. Coordinate with them to modify this record."*

**Audit Distinction (BR-22):** All audit log entries record the actor's role at the time of the action, not just their user ID.

---

## 3. The Core Workflow (State Machine)

A Job Card's status is an aggregate of its child Work Orders.

- **Intake (Supervisor/Chief):** Create Job Card + add Work Orders. Status: `Draft`
- **Payment (Cashier):** Customer pays Advance or Full. Generate invoice. Status: `Paid / In-Queue`
- **Execution (Worker/Supervisor):** Work Orders assigned, status moves to `In-Progress`
- **Inspection (Supervisor/Chief):** Each Work Order marked `Completed` after QC
- **Closure (Cashier):** When *all* child Work Orders are Completed, final payment collected. Status: `Closed`
- **Cancellation (Branch Manager):** Job Card can be moved to terminal status `VOIDED` (see Section 6 – Cancellation Workflow).

**Work Order status notes (FR-10):**
Each Work Order supports an **append-only status note log** (timestamp, author, free text). Full substates (e.g., Materials Cut, Awaiting Inspection) are deferred to v2.

---

## 4. Job Card & Work Order Specifications

### 4.1 Work Order Definition (Mapping from FRS)

Each **Work Order** represents **one operation type** on **one material**.

| FRS Job Type | Work Order Type ID | Applies to |
| --- | --- | --- |
| Cut | `CUT` | Cut & Bending subcategory |
| Bend | `BEND` | Cut & Bending subcategory |
| Pipe Bending | `PIPE_BEND` | Rolling subcategory |
| Box Bar Bending | `BOX_BAR_BEND` | Rolling subcategory |
| Flat Iron | `FLAT_IRON` | Rolling subcategory |
| L Angle | `L_ANGLE` | Rolling subcategory |
| Sheet Rolling | `SHEET_ROLL` | Rolling subcategory |
| Coil Cutting | `COIL_CUT` | Coil Cutting |

### 4.2 JSONB "Spec Block"

All Work Orders use a `jsonb` spec block for measurements.

#### Model A: Cut & Bend (Unit-Based)

- **Primary Metric:** Quantity (number of cuts or bends)
- **Pricing:** Material type + Thickness/Gauge + Quantity
- **Spec Block:** `{"thickness_mm": float, "gauge_size": string, "length_m": float (only if material = Amano), "sheet_cuts": integer (optional), "sheet_pieces": integer (optional)}`
- **Thickness dropdown values:** 6mm, 5mm, 4.5mm, 4mm, 3mm, 2.5mm, 2mm, gauges 16, 18, 19, 20, 22, 23, 24

#### Model B: Rolling Sub-Categories (Pipe Bending / Box Bar / Flat Iron / L Angle / Sheet Rolling)

- **Primary Metric:** Quantity
- **Required fields:**
  - `material_type` (from FRS 6.2.2)
  - `work_type` (dropdown: GI Pipe, L Bending (1), Rolling (2), Full Length, Circle Bend, Gate Bend Two Side, Gate Bend One Side, For Lottery)
  - `size` (dropdown or free text)
- **Spec Block:** `{"material_type": string, "work_type": string, "size": string}`
- **Pricing Matrix (BR-17):** Standard price = `lookup(work_type, material_type)` from branch Price List. If no entry exists, the Work Order is automatically treated as **Customized** (FR22).

#### Model C: Coil Cutting (Weight-Based)

- **Primary Metric:** Weight (kg)
- **Spec Block:** `{"weight_kg": float}`
- **Pricing:** Rate per kg from price list (Customized toggle applies if no list entry).

### 4.3 Worker Entity (FR-24, FR-25)

- Workers are managed by **Branch Manager** (add, edit, deactivate).
- Each worker belongs to one branch (BR19 – branch isolation).
- Worker assignment is stored as `worker_id` FK reference (not free text).
- UI renders a **searchable multi-select dropdown** from the branch's active worker roster.
- Deactivated workers remain on historical records but are hidden from assignment dropdowns (BR20).

---

## 5. Materials & Stock Management

### 5.1 Stock Deduction Rules

| Scenario | Stock Deduction |
| --- | --- |
| Customer buys materials directly (Material Work Order) | Deduct from **branch stock** immediately after payment confirmation. |
| Customer brings own materials from outside | **No deduction**. System marks Work Order as `customer_material_supplied = true`. No stock check required. |
| Workshop uses branch stock for fabrication | Deduct from **branch stock** when Work Order status changes to In Progress. |
| Goods issue to another branch (inter-branch transfer) | Deduct from **source branch** at time of goods issue creation. Target branch receives stock after confirmation (BR12). |

### 5.2 Stock Adding (Restocking)

- Restocking occurs via **Goods Issue from Main Warehouse** to branch.
- System provides a *Restock from Main* function (Branch Manager / Supervisor).
- Upon confirmation, stock is added to branch inventory.
- **Constraint:** Restock request requires a valid Goods Issue document number from Main Warehouse (BR13).

### 5.3 Customer-Supplied Materials

- In any Work Order, Supervisor toggles **Customer Supplied Material?** (Yes/No).
- If Yes:
  - Gate pass comes here (issues gatepass to the item and links to the work order).
  - Price calculation excludes material cost (labour/service only).
  - Stock is **not deducted**.

---

## 6. Business Rules & Financial Integrity (Complete Numbered List)

| Rule ID | Rule |
| --- | --- |
| BR01 | **Price Authority:** Supervisors/Chiefs enter rates for Customized jobs at creation. Cashiers enter/verify rates for Standard jobs. |
| BR02 | One Job Card can have multiple Work Orders (1:N relationship). |
| BR03 | **Accountability:** A Work Order cannot be submitted without at least one Worker assigned. |
| BR04 | **Worker Assignment:** One Work Order can be assigned to multiple workers simultaneously (1:N). |
| BR05 | **Payment Gate:** Job Card moves to Workshop Queue only after invoice is generated and payment recorded. |
| BR06 | **Branch Isolation:** Data from Branch A is invisible to Branch B unless user is Manager or Super Admin. |
| BR07 | Supervisor name is auto-recorded as Inspector when a Work Order is marked Completed. |
| BR08 | For standard jobs, thickness/size must be from predefined list; free-text only for customized jobs. |
| BR09 | Minimum advance percentage: configurable per branch (default 30% for customized, 0% for standard). |
| BR10 | **Stock Deduction Timing:** Material Work Orders deduct stock upon payment confirmation. Fabrication Work Orders deduct stock when status changes to In Progress. |
| BR11 | **Customer Supplied Material:** If `customer_supplied = true`, system shall NOT deduct stock and shall NOT include material cost in price. |
| BR12 | **Inter-Branch Transfer:** Goods issue to another branch requires approval from source Branch Manager. Target branch stock updated only after confirmation. |
| BR13 | **Restocking:** Branch stock can only be increased via (a) Restock from Main Warehouse with valid Goods Issue number. (No Returns accepted for workshop from customers.) See BR-15 also. |
| BR14 | **Cancellation Gate:** Draft Job Card may be voided by Supervisor/Chief. Any other status requires Branch Manager approval. |
| BR15 | **Stock Reversal on Cancel:** If a cancelled Work Order was In Progress, Branch Manager attests material consumption. Consumed → loss record; not consumed → stock reversal. |
| BR15A | If any Work Order is in Completed status, Job Card cancellation requires Manager (not just Branch Manager) approval. All completed Work Orders are automatically marked as fully consumed — no stock reversal. |
| BR16 | **Advance Refund:** No refunds. |
| BR17 | **Rolling Pricing Matrix:** Model B standard price = `lookup(work_type, material_type)` from branch Price List. No entry → auto-Customized. |
| BR18 | **Offline Payment Block:** Payment recording requires server connectivity. Blocked in offline mode with clear user message. |
| BR19 | **Worker Branch Isolation:** Workers are branch-scoped. Cannot be assigned across branches. |
| BR20 | **Worker Deactivation:** Deactivated workers remain on historical records; hidden from assignment dropdowns only. |
| BR21 | **Chief Deference Rule:** Chief cannot modify a Supervisor's Job Cards while that Supervisor has an active session at the branch. |
| BR22 | **Audit Distinction:** All audit log entries record actor's role at time of action, not just user ID. |
| BR23 | **Customized Definition:** A Work Order is Customized if (a) material not in predefined list, (b) size not in dropdown, or (c) Supervisor manually toggles with a reason. Conditions (a)/(b) auto-set and are not overridable. |
| BR24 | **Customized Audit:** Manual toggle of *Is Customized* records user, role, timestamp, and reason code. Visible to Branch Manager and Manager. |
| BR25 | **Balance Gate:** Job Card cannot transition to CLOSED unless `balance_due = 0`. |
| BR26 | **Advance Recalculation:** Adding a Work Order to an In-Queue Job Card triggers advance recalculation. Cashier alerted if advance falls below minimum percentage. |

---

## 7. Use Case Specifications

### UC-01: Create Job Card (Supervisor)

1. Select **Section** (Workshop, Hardware, etc.)
2. Select **Service Type** (Fabrication or Buy Materials)
3. **Customer Intake:** Search by phone number; if not found, create as "new customer" (customer registration completed later by Cashier).
4. **Add Work Orders:** Supervisor adds one or more Work Orders.
   - For each Work Order:
     - For Standard: Select from predefined dropdowns.
     - For Customized: Toggle "Is Customized," enter free-text size, and manual price/rate.
     - **Amano Rule (FR-04):** If material = Amano, system hides Thickness, shows Length (m), and relabels Quantity as "Number of Cuts".
   - **Multi-Worker Assignment:** Select one or more workers from branch roster.
5. **Submit:** Generate unique Job Card ID and Work Order IDs. Job Card sent to **Cashier Queue** (list view of pending payments, sorted by creation time, branch-scoped).

### UC-02: Payment & Invoicing (Cashier)

1. Cashier fetches Job Card by phone number; system aggregates all Work Order costs.
2. For Standard jobs: system-calculated price from price list; Cashier confirms with customer.
3. For Customized jobs: pre-entered rate is displayed.
4. Cashier records payment (Advance or Full). If offline, payment recording is blocked (BR18).
5. **Minimum advance check (BR-09):** System validates against branch configuration.
6. Invoice generated (PDF export, per-Work Order line items, advance paid, balance due – FR27).
7. Job automatically moved to Workshop Queue.

### UC-03: Handle Customer-Supplied Materials (Supervisor)

1. Create Work Order as normal.
2. Toggle **Customer Supplied Material = Yes**.
3. System hides material price fields.
4. Supervisor enters only labour/service price.
5. Submit – no stock deduction.

### UC-04: Cancel a Job Card (Branch Manager)

1. Branch Manager selects Job Card.
2. Chooses cancellation reason.
3. If advance was paid: system generates Refund Voucher. Cashier processes refund (or holds as credit) before void is completed (BR16).
4. If any Work Order was In Progress: Branch Manager attests material consumption (BR15).
5. System moves Job Card to terminal status `VOIDED`.

---

## 8. Functional Requirements Summary

| FR ID | Requirement | Priority |
| --- | --- | --- |
| FR01 | Auto-generate unique Job Card and Work Order numbers. | High |
| FR02 | Restrict price entry for customized jobs to Supervisor/Chief. | High |
| FR03 | Enforce "Worker Name" as mandatory (selected from roster). | High |
| FR04 | Hide/Show fields based on Material: Amano → Length, not Thickness; relabel Quantity. | High |
| FR05 | Filter modules/sections based on User Role and Branch. | High |
| FR06 | Provide search-by-phone interface for Cashier. | High |
| FR07 | Support kilo-based pricing for Coil Cutting. | High |
| FR08 | Store "Number of Sheet Cuts" and "Number of Sheet Pieces" per Work Order (Cut/Bend). | High |
| FR09 | Enforce predefined dropdown for Rolling work types (values from FRS 6.2.3). | High |
| FR10 | Support append-only status note log on Work Orders. Substates deferred to v2. | High |
| FR11 | Minimum advance (branch-configurable) required before job moves to Workshop Queue. | Medium |
| FR12 | Deduct/add branch stock at time of Goods Issue. | High |
| FR13 | Offline Job Card creation via client-side event queue. Stock deductions and payments require server connectivity. | High |
| FR14 | Support `customer_supplied` toggle on Work Orders, disabling stock deduction and material pricing. | High |
| FR15 | Deduct branch stock for Material Work Orders upon payment confirmation. | High |
| FR16 | Deduct branch stock for fabrication Work Orders when status moves to In Progress. | High |
| FR17 | Support inter-branch goods issue with approval workflow. | Medium |
| FR18 | Support restocking from Main Warehouse using Goods Issue number as reference. | High |
| FR19 | Support `VOIDED` terminal status for Job Cards with mandatory cancellation reason. | High |
| FR20 | Generate Refund Voucher when paid Job Card is voided; block void until refund disposition confirmed. | High |
| FR21 | Maintain configurable Price List per branch for Model B work types (Super Admin creates master, Branch Manager overrides). | High |
| FR22 | If Model B Work Order's `work_type + material_type` has no price list entry, auto-set `Is Customized = true`. | High |
| FR23 | Implement optimistic locking (server-side version counter). Sync conflicts surfaced in Conflict Queue for Branch Manager. | High |
| FR24 | Maintain Worker roster per branch, managed by Branch Manager. Supervisors select from roster only. | High |
| FR25 | Worker assignment stored as `worker_id` FK; UI renders searchable multi-select dropdown from branch roster. | High |
| FR26 | Auto-set `Is Customized = true` when material or size fields do not match predefined values. | Medium |
| FR27 | Invoice document includes per-Work Order line items, advance paid, and balance due. PDF export required. | High |
| FR28 | Maintain payment ledger per Job Card (`payments[]`, `balance_due`) visible to Cashier, Supervisor, Branch Manager, Manager. | High |
| FR29 | Amano pricing = rate per cut × length from Cut & Bend price list. No price list entry → auto-Customized. | Medium |

---

## 9. Non-Functional Requirements

| NFR ID | Category | Requirement |
| --- | --- | --- |
| NFR01 | Usability | Supervisor entry form optimized for mobile/tablet (large buttons, minimal typing). |
| NFR02 | Data Integrity | Branch isolation hardcoded; users from Branch A cannot access Branch B's job cards or stock. |
| NFR03 | Performance | Dashboard "Queue" refreshes in real-time (under 3 seconds). |
| NFR04 | Security | RBAC prevents Cashiers from modifying measurements or worker assignments. |
| NFR05 | Availability | System available during all branch operating hours. |
| NFR06 | Auditability | All job card creation, edits, payment events logged with user, timestamp, action, and role (BR22). |
| NFR07 | Scalability | Support concurrent operations from multiple branches without degradation. |
| NFR08 | Data Migration | Existing open job cards (manual system) importable with legacy flag. Mandatory fields: customer phone, customer name, job type, material, quantity, status, outstanding balance. |
| NFR09 | Offline Support | Job Card creation works offline using local event queue; sync when online. |
| NFR10 | Conflict Resolution | Sync conflicts surfaced in a dedicated Conflict Queue accessible to Branch Manager. |

---

## 10. Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Supervisors reject multi-Work Order model. | Pilot with one branch first; provide training video showing time savings. |
| Cashier sees too many line items per Job Card. | Collapse Work Orders by type by default, expand on click. |
| Branch stocks go negative if deduction timing is wrong. | System prevents status change to In Progress if required stock unavailable. Branch Manager can override with password. |
| Offline sync conflicts cause data corruption. | Server-authoritative model with conflict queue (FR23). Payments require online. |
| Rolling pricing matrix incomplete at launch. | Default to Customized for any missing price list entry; explicit warning to Supervisor. |

---

## 11. Differences from FRS (Explicitly Called Out)

| FRS Assumption | PRD v4 Assumption | Rationale |
| --- | --- | --- |
| One job card = one operation (Cut OR Bend) | One job card = multiple Work Orders (Cut + Bend + Rolling) | Matches real customer requests; reduces reconciliation. |
| Worker name = free-text per job | Worker assignment = FK to managed roster, 1:N per Work Order | Accountability, reporting, and branch isolation. |
| No explicit parent-child IDs | Job Card ID + Work Order IDs | Traceability and partial completion. |
| Pipe Bending work types mentioned but not enforced as dropdown | Required dropdown for `work_type` with predefined values | Prevents data entry errors. |
| No cancellation workflow | Terminal `VOIDED` status with refund and stock reversal rules | Handles real-world cancellations without data corruption. |
