import { AllocationStatus } from '../enums/inventory.enums';

// Ported from the prototype's allocationManager.ts. Gate pass status is never
// stored as these values; it is derived from allocations and linked orders.

export interface GatePassItemLike {
  gp_item_id: string;
  material_type: string;
  thickness: string | null;
  length: number | string | null;
  length_unit: string | null;
  color: string | null;
  quantity: number;
  condition_note: string | null;
}

export interface AllocationLike {
  allocation_id: string;
  gp_item_id: string;
  order_id: string | null;
  draft_id: string | null;
  quantity: number;
  status: AllocationStatus;
  expires_at: Date | string | null;
  created_at: Date | string;
}

export interface LinkedOrderLike {
  order_id: string;
  order_number: string;
  order_type: string;
  /** Display status, e.g. "Pending", "Ready". */
  status_label: string;
  /** Work done (job card completed or closed, roofing released) — the material is used. */
  terminal: boolean;
  closed_at: Date | string | null;
}

export interface BalanceOptions {
  now?: Date;
  /** Leave out the draft being edited, so its own reservation counts as available. */
  exclude_draft_id?: string;
  /** Leave out the order being edited. */
  exclude_order_id?: string;
}

export interface ItemBalance {
  gp_item_id: string;
  received: number;
  committed: number;
  reserved: number;
  available: number;
}

export type GatePassDisplayStatus = 'OPEN' | 'RESERVED' | 'PARTIALLY_ASSIGNED' | 'FULLY_ASSIGNED' | 'CLOSED';

export const GATE_PASS_STATUS_LABEL: Record<GatePassDisplayStatus, string> = {
  OPEN: 'Open',
  RESERVED: 'Reserved',
  PARTIALLY_ASSIGNED: 'Partially Assigned',
  FULLY_ASSIGNED: 'Fully Assigned',
  CLOSED: 'Closed',
};

export const isReservationActive = (a: AllocationLike, now: Date) =>
  a.status === AllocationStatus.RESERVED && (!a.expires_at || new Date(a.expires_at) > now);

export function itemBalance(item: GatePassItemLike, allocations: readonly AllocationLike[], opts: BalanceOptions = {}): ItemBalance {
  const now = opts.now ?? new Date();
  const mine = allocations.filter(
    (a) =>
      a.gp_item_id === item.gp_item_id &&
      !(opts.exclude_draft_id && a.draft_id === opts.exclude_draft_id) &&
      !(opts.exclude_order_id && a.order_id === opts.exclude_order_id),
  );
  const committed = mine.filter((a) => a.status === AllocationStatus.COMMITTED).reduce((s, a) => s + a.quantity, 0);
  const reserved = mine.filter((a) => isReservationActive(a, now)).reduce((s, a) => s + a.quantity, 0);
  return {
    gp_item_id: item.gp_item_id,
    received: item.quantity,
    committed,
    reserved,
    available: Math.max(0, item.quantity - committed - reserved),
  };
}

export interface GatePassSummary {
  status: GatePassDisplayStatus;
  reservation_indicator: 'PARTIAL' | 'FULL' | null;
  total_received: number;
  total_committed: number;
  total_reserved: number;
  total_available: number;
  has_available: boolean;
  closed_at: string | null;
  item_balances: ItemBalance[];
}

export function gatePassSummary(
  items: readonly GatePassItemLike[],
  allocations: readonly AllocationLike[],
  linkedOrders: readonly LinkedOrderLike[],
  now: Date = new Date(),
): GatePassSummary {
  const balances = items.map((i) => itemBalance(i, allocations, { now }));
  const sum = (k: keyof Omit<ItemBalance, 'gp_item_id'>) => balances.reduce((s, b) => s + b[k], 0);
  const totalReceived = sum('received');
  const totalCommitted = sum('committed');
  const totalReserved = sum('reserved');
  const totalAvailable = sum('available');

  const allCommitted = balances.length > 0 && balances.every((b) => b.committed >= b.received);
  const allDocsTerminal = linkedOrders.length > 0 && linkedOrders.every((o) => o.terminal);

  let status: GatePassDisplayStatus;
  if (totalCommitted === 0) status = totalReserved > 0 ? 'RESERVED' : 'OPEN';
  else if (!allCommitted) status = 'PARTIALLY_ASSIGNED';
  else if (totalReserved === 0 && allDocsTerminal) status = 'CLOSED';
  else status = 'FULLY_ASSIGNED';

  const closedTimes = linkedOrders.map((o) => o.closed_at).filter((d): d is Date | string => !!d);
  const latestClosed = closedTimes.length
    ? new Date(Math.max(...closedTimes.map((d) => new Date(d).getTime()))).toISOString()
    : null;

  return {
    status,
    reservation_indicator: totalReserved > 0 ? (totalAvailable === 0 ? 'FULL' : 'PARTIAL') : null,
    total_received: totalReceived,
    total_committed: totalCommitted,
    total_reserved: totalReserved,
    total_available: totalAvailable,
    has_available: totalAvailable > 0,
    closed_at: status === 'CLOSED' ? latestClosed : null,
    item_balances: balances,
  };
}

/** "12 ft", or "40 inches". */
export function formatGatePassLength(length: number | string | null, unit: string | null): string {
  if (length === null || length === undefined || length === '') return '';
  return `${Number(length)} ${unit === 'INCHES' ? 'inches' : 'ft'}`;
}
