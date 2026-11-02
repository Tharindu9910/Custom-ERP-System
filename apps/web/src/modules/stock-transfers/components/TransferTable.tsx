import type { ReactNode } from 'react';
import { IdChip } from '@/shared/components/Marks';
import { formatDateTime, formatLocalDate } from '@/shared/lib/format';
import { TransferStatusBadge, UrgentBadge } from '@/modules/inventory/components/StockBadges';
import { BoardMessageRow, TABLE, TBODY, TH, THEAD } from '@/modules/inventory/components/StockPage';
import type { TransferDto } from '../hooks/useStockTransfers';
import { formatQty } from '../lib/transfer';

/**
 * Stock requests as a board table (Docs/decisions/0012), like Odoo's Transfers list.
 * The whole row opens the request; the action column has at most one main button.
 * `readOnly` (head office) hides every action; `network` shows both branches.
 */
export function TransferTable({
  rows,
  loading,
  empty,
  readOnly = false,
  network = false,
  canSend = false,
  confirmingCancelId = null,
  busy = false,
  onSend,
  onReceive,
  onView,
  onAskCancel,
  onConfirmCancel,
  onKeep,
}: {
  rows: TransferDto[];
  loading: boolean;
  empty: ReactNode;
  readOnly?: boolean;
  network?: boolean;
  canSend?: boolean;
  confirmingCancelId?: string | null;
  busy?: boolean;
  onSend?: (t: TransferDto) => void;
  onReceive?: (t: TransferDto) => void;
  onView: (t: TransferDto) => void;
  onAskCancel?: (t: TransferDto) => void;
  onConfirmCancel?: (t: TransferDto) => void;
  onKeep?: () => void;
}) {
  return (
    <div className="flex-1 overflow-x-auto">
      <table className={TABLE}>
        <thead className={THEAD}>
          <tr>
            <th className={TH}>Request</th>
            <th className={TH}>{network ? 'Asked by → from' : 'Branch'}</th>
            <th className={TH}>Items</th>
            <th className={TH}>Needed by</th>
            <th className={TH}>Status</th>
            <th className={`${TH} text-right`}>Action</th>
          </tr>
        </thead>
        <tbody className={TBODY}>
          {loading && <BoardMessageRow colSpan={6}>Loading…</BoardMessageRow>}
          {!loading && rows.length === 0 && <BoardMessageRow colSpan={6}>{empty}</BoardMessageRow>}
          {!loading &&
            rows.map((t) => {
              const toUs = t.side === 'INCOMING';
              const asked = t.lines.reduce((s, l) => s + l.qty_requested, 0);
              const hint = progressHint(t, toUs, network, asked);
              const confirming = confirmingCancelId === t.transfer_id;
              return (
                <tr key={t.transfer_id} onClick={() => onView(t)} className="cursor-pointer transition-colors hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center gap-2">
                      <IdChip>{t.transfer_number}</IdChip>
                      {t.is_urgent && <UrgentBadge />}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">Requested {formatDateTime(t.created_at)}</div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    {network ? (
                      <span className="font-bold text-slate-900">
                        {t.requesting_branch.name} → {t.supplying_branch.name}
                      </span>
                    ) : (
                      <>
                        <div className="font-bold text-slate-900">{toUs ? t.requesting_branch.name : t.supplying_branch.name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{toUs ? 'Asked us' : 'We asked'}</div>
                      </>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-slate-900">
                      <span className="font-bold">{t.lines.length}</span> item{t.lines.length === 1 ? '' : 's'}{' '}
                      <span className="text-xs text-slate-500">({formatQty(asked)} units)</span>
                    </div>
                    {hint && <div className={`mt-0.5 text-xs font-semibold ${hint.tone}`}>{hint.text}</div>}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span className={t.late ? 'font-bold text-red-600' : 'text-slate-700'}>{formatLocalDate(t.needed_before)}</span>
                    {t.late && <div className="mt-0.5 text-xs font-semibold text-red-600">Late</div>}
                  </td>
                  <td className="px-6 py-4">
                    <TransferStatusBadge status={t.display_status} />
                    {t.display_status === 'REJECTED' && t.reject_reason && (
                      <div className="mt-1 max-w-[16rem] truncate text-xs text-red-700" title={t.reject_reason}>
                        {t.reject_reason}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      {!readOnly && toUs && t.display_status === 'WAITING' && canSend && (
                        <button onClick={() => onSend?.(t)} className="btn-primary whitespace-nowrap">
                          Check & Send
                        </button>
                      )}
                      {!readOnly && !toUs && t.display_status === 'SENT' && (
                        <button onClick={() => onReceive?.(t)} className="btn-primary whitespace-nowrap bg-emerald-600 hover:bg-emerald-700">
                          Receive
                        </button>
                      )}
                      {!readOnly &&
                        !toUs &&
                        t.display_status === 'WAITING' &&
                        (confirming ? (
                          <>
                            <span className="whitespace-nowrap text-xs font-semibold text-slate-600">Cancel this request?</span>
                            <button onClick={() => onConfirmCancel?.(t)} disabled={busy} className="btn-primary whitespace-nowrap bg-red-600 hover:bg-red-700">
                              Yes, cancel
                            </button>
                            <button onClick={onKeep} className="btn-secondary">
                              No
                            </button>
                          </>
                        ) : (
                          <button onClick={() => onAskCancel?.(t)} className="rounded bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:text-red-800">
                            Cancel
                          </button>
                        ))}
                      {!confirming && (
                        <button onClick={() => onView(t)} className="rounded bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800">
                          View
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

/** How far the request got, from our own stock only (BR06). */
function progressHint(t: TransferDto, toUs: boolean, network: boolean, asked: number): { text: string; tone: string } | null {
  if (toUs && !network && t.display_status === 'WAITING') {
    // What open orders hold can't be sent (Docs/decisions/0003)
    const short = t.lines.filter((l) => l.own_available < l.qty_requested).length;
    return short > 0 ? { text: `${short} not enough available`, tone: 'text-amber-600' } : { text: 'All available', tone: 'text-emerald-600' };
  }
  if (t.display_status === 'SENT') {
    const sent = t.lines.reduce((s, l) => s + (l.qty_sent ?? 0), 0);
    return sent < asked ? { text: `${formatQty(sent)} of ${formatQty(asked)} sent`, tone: 'text-amber-600' } : { text: 'All sent', tone: 'text-blue-600' };
  }
  if (t.display_status === 'RECEIVED') {
    const got = t.lines.reduce((s, l) => s + (l.qty_received ?? 0), 0);
    return got < asked ? { text: `${formatQty(got)} of ${formatQty(asked)} received`, tone: 'text-amber-600' } : { text: 'All received', tone: 'text-emerald-600' };
  }
  return null;
}
