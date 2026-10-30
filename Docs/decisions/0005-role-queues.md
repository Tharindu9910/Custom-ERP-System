# 0005 — Role queues: status boards with user-driven moves

- **Status:** accepted (2026-10-27)
- **Scope:** job cards on the Workshop Queue and the Cashier Queue. Roofing (Order Queue) is unchanged for now.
- **Supersedes:** in [0001](0001-supervisor-dashboard.md), "Completed (workshop) is derived", the Workshop Queue status tabs and date filter, and "Awaiting Payment" on the Workshop Queue.

## Decisions (confirmed by the product owner)

| Topic | Decision |
|---|---|
| One area per role | The **cashier** sees Awaiting Payment and Ready for Collection. The **supervisor and chief** see In Queue, In Progress and Completed. Managers and head office open the same two pages with their existing permissions; head office stays view-only. |
| Board, not filters | Each page shows only its own statuses, in lifecycle order, each with a count. There is no KPI ribbon or date filter, and search covers every status. Both queues show one card button per status; the selected card shows only its orders in a full-width list, each row with its move button. Roofing balances get their own card on the Cashier Queue. |
| The user moves the card | A card changes column only when someone presses its button. Nothing moves on its own except the payment gate: the cashier taking the advance is the move from Awaiting Payment to In Queue (and a zero advance still goes straight to In Queue, as in 0001). |
| Card and sub-job | **Start Job** moves the card to In Progress and starts the sub-jobs ticked in its dialog (all by default). The others start later from the card, and a sub-job can only start once the card is In Progress. **Mark Completed** needs every sub-job started; it completes the ones still in progress (the user is the inspector, BR07). Completing single sub-jobs never moves the card. |
| Close | **Close & Hand Over** needs a balance of 0. **Collect & Close** takes the balance and closes in one transaction. Permission `close:job_card` (CASHIER, MANAGER). |

## Lifecycle

```
DRAFT ─[Cashier: Take Advance]─▶ IN_QUEUE ─[Supervisor: Start Job]─▶ IN_PROGRESS ─[Supervisor: Mark Completed]─▶ COMPLETED ─[Cashier: Collect & Close]─▶ CLOSED
```

| Stored status | Label | Board column | Who moves it on |
|---|---|---|---|
| DRAFT | Awaiting Payment | Cashier · Awaiting Payment | Cashier (advance) |
| IN_QUEUE | Pending | Workshop · In Queue | Supervisor / Chief (Start Job) |
| IN_PROGRESS | In Progress | Workshop · In Progress | Supervisor / Chief (Mark Completed) |
| COMPLETED | Completed | Workshop · Completed (read-only) and Cashier · Ready for Collection | Cashier (Close) |
| CLOSED | Closed | — (History only) | — |

## Technical notes

- `order_status_enum` gets **COMPLETED** (job cards only; roofing READY stays derived). The migration moves job cards that were IN_PROGRESS with every active line COMPLETED to COMPLETED.
- Endpoints: `POST /job-cards/:id/start` `{version, line_ids, override?}`, `POST /job-cards/:id/complete` `{version, note?}`, `POST /job-cards/:id/close` `{version, released_to?, notes?}`. `POST /orders/:id/payments` takes `close` and `released_to`.
- Closing sets `released_to/by/at` and `release_notes`, as a roofing release does.
- The Cashier Queue no longer lists job cards that are In Queue or In Progress with a balance: the balance is collected at Ready for Collection. Roofing orders with a balance due keep their own column.
- Unpaid drafts are no longer on the Workshop Queue. The supervisor edits or voids them from **Create Job Card → History**.
- A gate pass still counts customer material as used once every sub-job is done, even before Mark Completed.
