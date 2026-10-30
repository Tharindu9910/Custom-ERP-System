import { LineStatus, OrderStatus } from '../enums/order.enums';

// Display status comes from the stored order status. Job cards store COMPLETED
// (Docs/decisions/0005); roofing READY is still derived from its lines (0001).

export type WorkshopDisplayStatus = 'AWAITING_PAYMENT' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED' | 'CANCELLATION_PENDING' | 'VOIDED';
export type RoofingDisplayStatus = 'PLACED' | 'IN_PROGRESS' | 'READY' | 'RELEASED' | 'CANCELLATION_PENDING' | 'CANCELLED' | 'DRAFT';

export const WORKSHOP_STATUS_LABEL: Record<WorkshopDisplayStatus, string> = {
  AWAITING_PAYMENT: 'Awaiting Payment',
  PENDING: 'Pending',
  IN_PROGRESS: 'Ongoing',
  COMPLETED: 'Finished',
  CLOSED: 'Closed',
  CANCELLATION_PENDING: 'Cancellation Pending',
  VOIDED: 'Voided',
};

export const ROOFING_STATUS_LABEL: Record<RoofingDisplayStatus, string> = {
  DRAFT: 'Draft',
  PLACED: 'Placed',
  IN_PROGRESS: 'Ongoing',
  READY: 'Ready',
  RELEASED: 'Released',
  CANCELLATION_PENDING: 'Cancellation Pending',
  CANCELLED: 'Cancelled',
};

// Hardware sales: placed (awaiting payment) → paid, or cancelled (Docs/decisions/0006)
export type HardwareDisplayStatus = 'AWAITING_PAYMENT' | 'PAID' | 'CANCELLED';

export const HARDWARE_STATUS_LABEL: Record<HardwareDisplayStatus, string> = {
  AWAITING_PAYMENT: 'Awaiting Payment',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
};

export const LINE_STATUS_LABEL: Record<LineStatus, string> = {
  PENDING: 'Pending',
  ASSIGNED: 'Pending',
  IN_PROGRESS: 'Ongoing',
  COMPLETED: 'Finished',
  CANCELLED: 'Cancelled',
};

/** Every non-cancelled line is completed (and there is at least one). */
export function allActiveLinesCompleted(lineStatuses: readonly LineStatus[]): boolean {
  const active = lineStatuses.filter((s) => s !== LineStatus.CANCELLED);
  return active.length > 0 && active.every((s) => s === LineStatus.COMPLETED);
}

export function workshopDisplayStatus(status: OrderStatus): WorkshopDisplayStatus {
  switch (status) {
    case OrderStatus.DRAFT:
      return 'AWAITING_PAYMENT';
    case OrderStatus.IN_QUEUE:
      return 'PENDING';
    case OrderStatus.IN_PROGRESS:
      return 'IN_PROGRESS';
    case OrderStatus.COMPLETED:
      return 'COMPLETED';
    case OrderStatus.CANCELLATION_PENDING:
      return 'CANCELLATION_PENDING';
    case OrderStatus.CLOSED:
      return 'CLOSED';
    case OrderStatus.VOIDED:
      return 'VOIDED';
  }
}

export function roofingDisplayStatus(status: OrderStatus, lineStatuses: readonly LineStatus[]): RoofingDisplayStatus {
  switch (status) {
    case OrderStatus.DRAFT:
      return 'DRAFT';
    case OrderStatus.IN_QUEUE:
      return 'PLACED';
    case OrderStatus.IN_PROGRESS:
      return allActiveLinesCompleted(lineStatuses) ? 'READY' : 'IN_PROGRESS';
    // Never stored for roofing; mapped so every status has a label
    case OrderStatus.COMPLETED:
      return 'READY';
    case OrderStatus.CANCELLATION_PENDING:
      return 'CANCELLATION_PENDING';
    case OrderStatus.CLOSED:
      return 'RELEASED';
    case OrderStatus.VOIDED:
      return 'CANCELLED';
  }
}

export function hardwareDisplayStatus(status: OrderStatus): HardwareDisplayStatus {
  if (status === OrderStatus.CLOSED) return 'PAID';
  if (status === OrderStatus.VOIDED) return 'CANCELLED';
  return 'AWAITING_PAYMENT';
}

// ── Transitions ────────────────────────────────────────────────────────────

const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatus.DRAFT]: [OrderStatus.IN_QUEUE, OrderStatus.VOIDED],
  [OrderStatus.IN_QUEUE]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLATION_PENDING, OrderStatus.VOIDED],
  // IN_PROGRESS → CLOSED is roofing release; job cards go through COMPLETED
  [OrderStatus.IN_PROGRESS]: [OrderStatus.COMPLETED, OrderStatus.CLOSED, OrderStatus.CANCELLATION_PENDING],
  [OrderStatus.COMPLETED]: [OrderStatus.CLOSED, OrderStatus.CANCELLATION_PENDING],
  [OrderStatus.CANCELLATION_PENDING]: [OrderStatus.VOIDED, OrderStatus.IN_QUEUE, OrderStatus.IN_PROGRESS, OrderStatus.COMPLETED],
  [OrderStatus.CLOSED]: [],
  [OrderStatus.VOIDED]: [],
};

// Hardware sales skip the workshop states: paid in full closes, cancel voids
const HARDWARE_TRANSITIONS: Partial<Record<OrderStatus, readonly OrderStatus[]>> = {
  [OrderStatus.IN_QUEUE]: [OrderStatus.CLOSED, OrderStatus.VOIDED],
};

const LINE_TRANSITIONS: Record<LineStatus, readonly LineStatus[]> = {
  [LineStatus.PENDING]: [LineStatus.ASSIGNED, LineStatus.CANCELLED],
  [LineStatus.ASSIGNED]: [LineStatus.IN_PROGRESS, LineStatus.CANCELLED],
  [LineStatus.IN_PROGRESS]: [LineStatus.COMPLETED, LineStatus.CANCELLED],
  [LineStatus.COMPLETED]: [],
  [LineStatus.CANCELLED]: [],
};

export const canTransitionOrder = (from: OrderStatus, to: OrderStatus) => ORDER_TRANSITIONS[from].includes(to);
// A hardware line is handed over when the sale is paid, or dropped with the order
const HARDWARE_LINE_TRANSITIONS: Partial<Record<LineStatus, readonly LineStatus[]>> = {
  [LineStatus.PENDING]: [LineStatus.COMPLETED, LineStatus.CANCELLED],
};

export const canTransitionHardware = (from: OrderStatus, to: OrderStatus) => (HARDWARE_TRANSITIONS[from] ?? []).includes(to);
export const canTransitionHardwareLine = (from: LineStatus, to: LineStatus) => (HARDWARE_LINE_TRANSITIONS[from] ?? []).includes(to);
export const canTransitionLine = (from: LineStatus, to: LineStatus) => LINE_TRANSITIONS[from].includes(to);

/** A line that has started work can no longer be edited or removed. */
export const lineHasStarted = (s: LineStatus) => s === LineStatus.IN_PROGRESS || s === LineStatus.COMPLETED;
