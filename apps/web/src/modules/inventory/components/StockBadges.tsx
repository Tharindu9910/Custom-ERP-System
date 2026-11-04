import type { ReactNode } from 'react';
import { STOCK_LEVEL_LABEL, TRANSFER_STATUS_LABEL, type StockLevel, type TransferDisplayStatus } from '@erp/shared';

/**
 * Status pills of the stock pages, in the queue boards' pill style (Docs/decisions/0005, 0012).
 * One definition, so Stock Levels, Restock and Stock Requests show the same colours.
 */

const PILL = 'inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium';

const LEVEL_TONE: Record<StockLevel, string> = {
  OUT: 'bg-red-50 text-red-700',
  LOW: 'bg-amber-50 text-amber-800',
  HEALTHY: 'bg-green-50 text-green-700',
};

export function StockLevelBadge({ level }: { level: StockLevel }) {
  return <span className={`${PILL} ${LEVEL_TONE[level]}`}>{STOCK_LEVEL_LABEL[level]}</span>;
}

const TRANSFER_TONE: Record<TransferDisplayStatus, string> = {
  WAITING: 'bg-amber-50 text-amber-800',
  SENT: 'bg-blue-50 text-blue-700',
  SHORT: 'bg-orange-50 text-orange-800',
  RECEIVED: 'bg-green-50 text-green-700',
  REJECTED: 'bg-red-50 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-600',
};

export function TransferStatusBadge({ status }: { status: TransferDisplayStatus }) {
  return <span className={`${PILL} ${TRANSFER_TONE[status]}`}>{TRANSFER_STATUS_LABEL[status]}</span>;
}

export function UrgentBadge() {
  return <span className={`${PILL} bg-red-50 font-semibold uppercase tracking-wider text-red-700`}>Urgent</span>;
}

/** An open request on an item: "Requested" (waiting) or "+N on the way". */
export function OpenRequestBadge({ status, children }: { status: 'WAITING' | 'SENT'; children: ReactNode }) {
  return <span className={`${PILL} ${status === 'SENT' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{children}</span>;
}

/** The slate filter select used in board headers. */
export const selectCls =
  'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500';

/** Inputs inside the stock forms and popups. */
export const fieldCls =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500';
