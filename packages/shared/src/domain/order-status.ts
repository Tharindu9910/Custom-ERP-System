import { LineStatus, OrderStatus } from '../enums/order.enums';

// Display status is derived from the stored order status and its lines
// (ER-v6 has no READY/COMPLETED order status). See Docs/decisions/0001.

export type WorkshopDisplayStatus = 'AWAITING_PAYMENT' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED' | 'CANCELLATION_PENDING' | 'VOIDED';
export type RoofingDisplayStatus = 'PLACED' | 'IN_PROGRESS' | 'READY' | 'RELEASED' | 'CANCELLATION_PENDING' | 'CANCELLED' | 'DRAFT';

export const WORKSHOP_STATUS_LABEL: Record<WorkshopDisplayStatus, string> = {
  AWAITING_PAYMENT: 'Awaiting Payment',
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CLOSED: 'Closed',
  CANCELLATION_PENDING: 'Cancellation Pending',
  VOIDED: 'Voided',
};

export const ROOFING_STATUS_LABEL: Record<RoofingDisplayStatus, string> = {
  DRAFT: 'Draft',
  PLACED: 'Placed',
  IN_PROGRESS: 'In Progress',
  READY: 'Ready',
  RELEASED: 'Released',
  CANCELLATION_PENDING: 'Cancellation Pending',
  CANCELLED: 'Cancelled',
};

export const LINE_STATUS_LABEL: Record<LineStatus, string> = {
  PENDING: 'Pending',
  ASSIGNED: 'Pending',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/** Every non-cancelled line is completed (and there is at least one). */
export function allActiveLinesCompleted(lineStatuses: readonly LineStatus[]): boolean {
  const active = lineStatuses.filter((s) => s !== LineStatus.CANCELLED);
  return active.length > 0 && active.every((s) => s === LineStatus.COMPLETED);
}

export function workshopDisplayStatus(status: OrderStatus, lineStatuses: readonly LineStatus[]): WorkshopDisplayStatus {
  switch (status) {
    case OrderStatus.DRAFT:
      return 'AWAITING_PAYMENT';
    case OrderStatus.IN_QUEUE:
      return 'PENDING';
    case OrderStatus.IN_PROGRESS:
      return allActiveLinesCompleted(lineStatuses) ? 'COMPLETED' : 'IN_PROGRESS';
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
    case OrderStatus.CANCELLATION_PENDING:
      return 'CANCELLATION_PENDING';
    case OrderStatus.CLOSED:
      return 'RELEASED';
    case OrderStatus.VOIDED:
      return 'CANCELLED';
  }
}

// ── Transitions ────────────────────────────────────────────────────────────

const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatus.DRAFT]: [OrderStatus.IN_QUEUE, OrderStatus.VOIDED],
  [OrderStatus.IN_QUEUE]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLATION_PENDING, OrderStatus.VOIDED],
  [OrderStatus.IN_PROGRESS]: [OrderStatus.CLOSED, OrderStatus.CANCELLATION_PENDING],
  [OrderStatus.CANCELLATION_PENDING]: [OrderStatus.VOIDED, OrderStatus.IN_QUEUE, OrderStatus.IN_PROGRESS],
  [OrderStatus.CLOSED]: [],
  [OrderStatus.VOIDED]: [],
};

const LINE_TRANSITIONS: Record<LineStatus, readonly LineStatus[]> = {
  [LineStatus.PENDING]: [LineStatus.ASSIGNED, LineStatus.CANCELLED],
  [LineStatus.ASSIGNED]: [LineStatus.IN_PROGRESS, LineStatus.CANCELLED],
  [LineStatus.IN_PROGRESS]: [LineStatus.COMPLETED, LineStatus.CANCELLED],
  [LineStatus.COMPLETED]: [],
  [LineStatus.CANCELLED]: [],
};

export const canTransitionOrder = (from: OrderStatus, to: OrderStatus) => ORDER_TRANSITIONS[from].includes(to);
export const canTransitionLine = (from: LineStatus, to: LineStatus) => LINE_TRANSITIONS[from].includes(to);

/** A line that has started work can no longer be edited or removed. */
export const lineHasStarted = (s: LineStatus) => s === LineStatus.IN_PROGRESS || s === LineStatus.COMPLETED;
