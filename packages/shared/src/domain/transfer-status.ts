import { TransferStatus } from '../enums/inventory.enums';

// Stock request statuses as the prototype names them. Stored as ER-v6
// transfer_status: PENDING → ISSUED → CONFIRMED, or REJECTED / CANCELLED.
// A short receive goes ISSUED → SHORTAGE_PENDING → CONFIRMED (Docs/decisions/0014).

export type TransferDisplayStatus = 'WAITING' | 'SENT' | 'SHORT' | 'RECEIVED' | 'REJECTED' | 'CANCELLED';

const DISPLAY: Record<TransferStatus, TransferDisplayStatus> = {
  [TransferStatus.PENDING]: 'WAITING',
  // No approval step is used (Docs/decisions/0001); kept so an old row still shows
  [TransferStatus.APPROVED]: 'WAITING',
  [TransferStatus.ISSUED]: 'SENT',
  [TransferStatus.CONFIRMED]: 'RECEIVED',
  [TransferStatus.REJECTED]: 'REJECTED',
  [TransferStatus.CANCELLED]: 'CANCELLED',
  [TransferStatus.SHORTAGE_PENDING]: 'SHORT',
};

export const TRANSFER_STATUS_LABEL: Record<TransferDisplayStatus, string> = {
  WAITING: 'Waiting',
  SENT: 'Sent',
  SHORT: 'Short — awaiting manager',
  RECEIVED: 'Received',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export const transferDisplayStatus = (status: TransferStatus): TransferDisplayStatus => DISPLAY[status];

/**
 * Waiting or Sent: the goods haven't arrived yet, so the item can't be asked for again.
 * A short receive (SHORTAGE_PENDING) is not open here: what came is in stock and the
 * item may be requested again while the manager reviews the missing part.
 */
export const OPEN_TRANSFER_STATUSES = [TransferStatus.PENDING, TransferStatus.APPROVED, TransferStatus.ISSUED] as const;
/** Statuses the boards list as still in progress: open ones plus shortages awaiting the manager. */
export const ACTIVE_TRANSFER_STATUSES = [...OPEN_TRANSFER_STATUSES, TransferStatus.SHORTAGE_PENDING] as const;
export const isOpenTransfer = (status: TransferStatus) => (OPEN_TRANSFER_STATUSES as readonly TransferStatus[]).includes(status);

/**
 * The branch that has to act next: the supplier sends or rejects a waiting
 * request, the requester receives a sent one.
 */
export function transferNeedsAction(status: TransferStatus, side: 'INCOMING' | 'OUTGOING'): boolean {
  if (side === 'INCOMING') return status === TransferStatus.PENDING || status === TransferStatus.APPROVED;
  return status === TransferStatus.ISSUED || status === TransferStatus.SHORTAGE_PENDING;
}

/** Item already asked for and not yet received (Inventory / Stock Alerts markers). */
export interface OpenRequestInfo {
  status: 'WAITING' | 'SENT';
  /** Asked quantity while waiting, sent quantity once sent */
  qty: number;
  transfer_numbers: string[];
}
