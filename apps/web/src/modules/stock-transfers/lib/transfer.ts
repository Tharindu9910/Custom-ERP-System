import type { TransferDisplayStatus } from '@erp/shared';

export const TRANSFER_STATUS_STYLE: Record<TransferDisplayStatus, string> = {
  WAITING: 'bg-amber-50 text-amber-800 border-amber-200',
  SENT: 'bg-blue-50 text-blue-800 border-blue-200',
  RECEIVED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-800 border-rose-200',
  CANCELLED: 'bg-slate-100 text-slate-600 border-slate-200',
};

/** "piece" → "pieces"; kg and ft never change (prototype unitLabel). */
export const unitLabel = (qty: number, unit?: string) => (!unit ? '' : qty === 1 || unit === 'kg' || unit === 'ft' ? unit : `${unit}s`);

/** Stock amounts are whole units or up to 3 decimals (kg, ft). */
export const formatQty = (n: number) => n.toLocaleString('en-LK', { maximumFractionDigits: 3 });

export interface RequestDraftItem {
  item_id: string;
  quantity: number;
}

/** Items handed to the New Request form travel in the URL as "id:qty,id:qty". */
export const encodeRequestItems = (items: RequestDraftItem[]) => items.map((i) => `${i.item_id}:${i.quantity}`).join(',');

export function decodeRequestItems(value?: string): RequestDraftItem[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => {
      const [item_id, qty] = part.split(':');
      return { item_id, quantity: Math.max(1, Number(qty) || 1) };
    })
    .filter((i) => /^[0-9a-f-]{36}$/i.test(i.item_id));
}
