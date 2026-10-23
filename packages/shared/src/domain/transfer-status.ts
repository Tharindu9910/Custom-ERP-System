import { TransferStatus } from '../enums/inventory.enums';

// Stock request statuses as the prototype names them. Stored as ER-v6
// transfer_status: PENDING → ISSUED → CONFIRMED, or REJECTED / CANCELLED.

export type TransferDisplayStatus = 'WAITING' | 'SENT' | 'RECEIVED' | 'REJECTED' | 'CANCELLED';

const DISPLAY: Record<TransferStatus, TransferDisplayStatus> = {
  [TransferStatus.PENDING]: 'WAITING',
  // No approval step is used (Docs/decisions/0001); kept so an old row still shows
  [TransferStatus.APPROVED]: 'WAITING',
  [TransferStatus.ISSUED]: 'SENT',
  [TransferStatus.CONFIRMED]: 'RECEIVED',
  [TransferStatus.REJECTED]: 'REJECTED',
  [TransferStatus.CANCELLED]: 'CANCELLED',
};

export const TRANSFER_STATUS_LABEL: Record<TransferDisplayStatus, string> = {
  WAITING: 'Waiting',
  SENT: 'Sent',
  RECEIVED: 'Received',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

export const transferDisplayStatus = (status: TransferStatus): TransferDisplayStatus => DISPLAY[status];

/** Waiting or Sent: the request still needs someone to act. */
export const OPEN_TRANSFER_STATUSES = [TransferStatus.PENDING, TransferStatus.APPROVED, TransferStatus.ISSUED] as const;
export const isOpenTransfer = (status: TransferStatus) => (OPEN_TRANSFER_STATUSES as readonly TransferStatus[]).includes(status);

/**
 * The branch that has to act next: the supplier sends or rejects a waiting
 * request, the requester receives a sent one.
 */
export function transferNeedsAction(status: TransferStatus, side: 'INCOMING' | 'OUTGOING'): boolean {
  if (side === 'INCOMING') return status === TransferStatus.PENDING || status === TransferStatus.APPROVED;
  return status === TransferStatus.ISSUED;
}

/** Item already asked for and not yet received (Inventory / Stock Alerts markers). */
export interface OpenRequestInfo {
  status: 'WAITING' | 'SENT';
  /** Asked quantity while waiting, sent quantity once sent */
  qty: number;
  transfer_numbers: string[];
}
