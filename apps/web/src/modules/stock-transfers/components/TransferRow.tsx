import { TRANSFER_STATUS_LABEL } from '@erp/shared';
import { formatDateTime, formatLocalDate } from '@/shared/lib/format';
import type { TransferDto } from '../hooks/useStockTransfers';
import { TRANSFER_STATUS_STYLE, formatQty } from '../lib/transfer';

/**
 * One request in Requests to Us / Our Requests (prototype renderRow). At most one main button.
 * `readOnly` (head office) hides every action; `network` also shows both branches.
 */
export function TransferRow({
  t,
  readOnly = false,
  network = false,
  canSend,
  confirmingCancel,
  busy,
  onSend,
  onReceive,
  onView,
  onAskCancel,
  onConfirmCancel,
  onKeep,
}: {
  t: TransferDto;
  readOnly?: boolean;
  network?: boolean;
  canSend: boolean;
  confirmingCancel: boolean;
  busy: boolean;
  onSend: () => void;
  onReceive: () => void;
  onView: () => void;
  onAskCancel: () => void;
  onConfirmCancel: () => void;
  onKeep: () => void;
}) {
  const toUs = t.side === 'INCOMING';
  const other = toUs ? t.requesting_branch.name : t.supplying_branch.name;
  const asked = t.lines.reduce((s, l) => s + l.qty_requested, 0);

  let hint: { text: string; tone: string } | null = null;
  if (toUs && !network && t.display_status === 'WAITING') {
    // Our own available stock only (BR06); what open orders hold can't be sent
    const short = t.lines.filter((l) => l.own_available < l.qty_requested).length;
    hint = short > 0 ? { text: `${short} not enough available`, tone: 'text-amber-600' } : { text: 'All available', tone: 'text-emerald-600' };
  } else if (t.display_status === 'SENT') {
    const sent = t.lines.reduce((s, l) => s + (l.qty_sent ?? 0), 0);
    hint = sent < asked ? { text: `${formatQty(sent)} of ${formatQty(asked)} sent`, tone: 'text-amber-600' } : { text: 'All sent', tone: 'text-blue-600' };
  } else if (t.display_status === 'RECEIVED') {
    const got = t.lines.reduce((s, l) => s + (l.qty_received ?? 0), 0);
    hint = got < asked ? { text: `${formatQty(got)} of ${formatQty(asked)} received`, tone: 'text-amber-600' } : { text: 'All received', tone: 'text-emerald-600' };
  }

  return (
    <div
      className={`grid grid-cols-2 items-center gap-x-4 gap-y-3 rounded-xl border bg-white px-5 py-4 shadow-2xs transition-all md:grid-cols-12 ${
        t.needs_action ? 'border-blue-200 hover:border-blue-300' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="col-span-2 min-w-0 md:col-span-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-base font-bold text-slate-900">{t.transfer_number}</span>
          {t.is_urgent && <span className="rounded border border-rose-200 bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-800">Urgent</span>}
        </div>
        <div className="mt-1">
          <span className={`inline-block rounded border px-2.5 py-0.5 text-xs font-bold ${TRANSFER_STATUS_STYLE[t.display_status]}`}>{TRANSFER_STATUS_LABEL[t.display_status]}</span>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">
          Requested {formatDateTime(t.created_at)}
          {t.sent_at && <> · Sent {formatDateTime(t.sent_at)}</>}
        </p>
      </div>

      <div className="min-w-0 md:col-span-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{network ? 'Asked by → from' : toUs ? 'From' : 'Asked'}</p>
        <p className="truncate text-sm font-bold text-slate-800">{network ? `${t.requesting_branch.name} → ${t.supplying_branch.name}` : other}</p>
      </div>

      <div className="md:col-span-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Needed by</p>
        <p className={`text-sm font-bold ${t.late ? 'text-rose-600' : 'text-slate-800'}`}>
          {formatLocalDate(t.needed_before)}
          {t.late && <span className="ml-1.5 text-[10px] uppercase tracking-wider">Late</span>}
        </p>
      </div>

      <div className="md:col-span-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Items</p>
        <p className="text-sm font-bold text-slate-800">
          {t.lines.length} <span className="text-xs font-medium text-slate-500">({formatQty(asked)} units)</span>
        </p>
        {hint && <p className={`text-[11px] font-bold ${hint.tone}`}>{hint.text}</p>}
      </div>

      <div className="col-span-2 flex flex-wrap items-center gap-2 md:col-span-3 md:justify-end">
        {!readOnly && toUs && t.display_status === 'WAITING' && canSend && (
          <button onClick={onSend} className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-700">
            Check & Send
          </button>
        )}
        {!readOnly && !toUs && t.display_status === 'SENT' && (
          <button onClick={onReceive} className="whitespace-nowrap rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700">
            Receive
          </button>
        )}
        {!readOnly &&
          !toUs &&
          t.display_status === 'WAITING' &&
          (confirmingCancel ? (
            <>
              <span className="text-xs font-semibold text-slate-600">Cancel this request?</span>
              <button
                onClick={onConfirmCancel}
                disabled={busy}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
              >
                Yes, cancel
              </button>
              <button onClick={onKeep} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                No
              </button>
            </>
          ) : (
            <button onClick={onAskCancel} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50">
              Cancel
            </button>
          ))}
        {!confirmingCancel && (
          <button
            onClick={onView}
            className="whitespace-nowrap rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            View
          </button>
        )}
      </div>

      {t.display_status === 'REJECTED' && t.reject_reason && (
        <p className="col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 md:col-span-12">
          <strong>Reason:</strong> {t.reject_reason}
        </p>
      )}
    </div>
  );
}
