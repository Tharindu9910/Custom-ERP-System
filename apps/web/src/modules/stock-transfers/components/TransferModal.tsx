import { useState } from 'react';
import { TRANSFER_STATUS_LABEL } from '@erp/shared';
import { Modal } from '@/shared/components/Modal';
import { Notice } from '@/shared/components/Notice';
import { apiError } from '@/shared/api/errors';
import { formatDate, formatLocalDate } from '@/shared/lib/format';
import { useTransferAction, type TransferDto } from '../hooks/useStockTransfers';
import { TRANSFER_STATUS_STYLE, formatQty, unitLabel } from '../lib/transfer';

export type TransferModalMode = 'send' | 'receive' | 'view';

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Check & Send (asked branch), Receive (asking branch) or read-only details (prototype). */
export function TransferModal({
  transfer: t,
  mode,
  ourBranchName,
  onClose,
  onDone,
}: {
  transfer: TransferDto;
  mode: TransferModalMode;
  ourBranchName: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const action = useTransferAction();
  // Send: what was asked, but never more than we have. Receive: what was sent.
  const [qtys, setQtys] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      t.lines.map((l) => [l.transfer_line_id, mode === 'send' ? Math.max(0, Math.min(l.qty_requested, l.own_available)) : (l.qty_sent ?? 0)]),
    ),
  );
  const [receiveNote, setReceiveNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const editable = mode === 'send' || mode === 'receive';
  const incoming = t.side === 'INCOMING';
  const rows = t.lines.map((l) => {
    const value = qtys[l.transfer_line_id] ?? 0;
    const max = mode === 'send' ? Math.min(l.own_available, l.qty_requested) : (l.qty_sent ?? 0);
    const target = mode === 'send' ? l.qty_requested : (l.qty_sent ?? 0);
    return { line: l, value, over: value > max, short: value < target };
  });
  const total = round3(rows.reduce((s, r) => s + r.value, 0));
  const overCount = rows.filter((r) => r.over).length;
  const shortCount = rows.filter((r) => r.short).length;
  const otherName = incoming ? t.requesting_branch.name : t.supplying_branch.name;

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setError(null);
    try {
      await fn();
      onDone(msg);
    } catch (e) {
      setError(apiError(e).message);
    }
  };

  const send = () =>
    run(
      () => action.mutateAsync({ action: 'send', id: t.transfer_id, body: { lines: rows.map((r) => ({ transfer_line_id: r.line.transfer_line_id, qty_sent: r.value })) } }),
      `Sent ${formatQty(total)} units to ${otherName}. Removed from ${ourBranchName} stock.`,
    );
  const receive = () =>
    run(
      () =>
        action.mutateAsync({
          action: 'receive',
          id: t.transfer_id,
          body: { lines: rows.map((r) => ({ transfer_line_id: r.line.transfer_line_id, qty_received: r.value })), notes: receiveNote.trim() || undefined },
        }),
      `${formatQty(total)} units added to ${ourBranchName} stock.`,
    );
  const reject = () =>
    run(() => action.mutateAsync({ action: 'reject', id: t.transfer_id, body: { reason: rejectReason.trim() } }), `Request ${t.transfer_number} rejected.`);

  const title = mode === 'send' ? 'Check & Send' : mode === 'receive' ? 'Receive stock' : 'Request details';
  const btn = 'rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <Modal
      open
      size="md"
      onClose={onClose}
      title={title}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-bold text-slate-800">{t.transfer_number}</span>
          <span className={`inline-block rounded border px-2.5 py-0.5 text-xs font-bold ${TRANSFER_STATUS_STYLE[t.display_status]}`}>{TRANSFER_STATUS_LABEL[t.display_status]}</span>
          {t.is_urgent && <span className="rounded border border-rose-200 bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-800">Urgent</span>}
        </span>
      }
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-3">
          {mode === 'view' && (
            <button onClick={onClose} className={`${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
              Close
            </button>
          )}
          {mode === 'send' && !rejecting && (
            <>
              <button onClick={() => setRejecting(true)} className={`${btn} mr-auto border border-rose-300 bg-white text-rose-700 hover:bg-rose-50`}>
                Reject
              </button>
              <button onClick={onClose} className={`${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
                Close
              </button>
              <button
                disabled={overCount > 0 || total === 0 || action.isPending}
                onClick={() => void send()}
                className={`${btn} bg-blue-600 px-6 font-bold text-white shadow-sm hover:bg-blue-700`}
              >
                {action.isPending ? 'Sending…' : `Send ${formatQty(total)} units`}
              </button>
            </>
          )}
          {mode === 'send' && rejecting && (
            <>
              <button onClick={() => setRejecting(false)} className={`${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
                Back
              </button>
              <button
                disabled={rejectReason.trim().length < 3 || action.isPending}
                onClick={() => void reject()}
                className={`${btn} bg-rose-600 px-6 font-bold text-white shadow-sm hover:bg-rose-700`}
              >
                Reject request
              </button>
            </>
          )}
          {mode === 'receive' && (
            <>
              <button onClick={onClose} className={`${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
                Close
              </button>
              <button
                disabled={overCount > 0 || action.isPending}
                onClick={() => void receive()}
                className={`${btn} bg-emerald-600 px-6 font-bold text-white shadow-sm hover:bg-emerald-700`}
              >
                {action.isPending ? 'Saving…' : 'Add to our stock'}
              </button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-slate-50 p-4 text-sm">
          <span className="text-slate-500">From (sends)</span>
          <span className="text-right font-semibold text-slate-900">
            {t.supplying_branch.name}
            {incoming && ' (you)'}
          </span>
          <span className="text-slate-500">To (receives)</span>
          <span className="text-right font-semibold text-slate-900">
            {t.requesting_branch.name}
            {!incoming && ' (you)'}
          </span>
          <span className="text-slate-500">Needed by</span>
          <span className={`text-right font-semibold ${t.late ? 'text-rose-600' : 'text-slate-900'}`}>
            {formatLocalDate(t.needed_before)}
            {t.late && <span className="ml-1.5 text-[10px] uppercase tracking-wider">Late</span>}
          </span>
        </div>

        {t.notes && (
          <p className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
            <strong className="text-slate-800">Note:</strong> {t.notes}
          </p>
        )}
        {mode === 'send' && <p className="text-sm text-slate-600">Check what you can send. Change the amount if you can't send everything.</p>}
        {mode === 'receive' && <p className="text-sm text-slate-600">Count what arrived. If the count is different from what was sent, change it here.</p>}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="rounded-l-lg px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">Asked</th>
                {mode === 'send' && <th className="px-4 py-3 text-right">We can send</th>}
                {mode === 'send' && <th className="rounded-r-lg px-4 py-3 text-right">We send</th>}
                {mode !== 'send' && <th className="px-4 py-3 text-right">Sent</th>}
                {mode === 'receive' && <th className="px-4 py-3 text-right">We have</th>}
                {mode !== 'send' && <th className={`px-4 py-3 text-right ${mode === 'view' ? 'rounded-r-lg' : ''}`}>Received</th>}
                {mode === 'receive' && <th className="rounded-r-lg px-4 py-3 text-right">New total</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ line: l, value, over, short }) => (
                <tr key={l.transfer_line_id}>
                  <td className="px-4 py-3.5">
                    <div className="font-medium text-slate-900">{l.name}</div>
                    <div className="font-mono text-[10px] text-slate-400">{l.sku}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right font-mono text-slate-700">
                    {formatQty(l.qty_requested)} <span className="text-[11px] text-slate-400">{unitLabel(l.qty_requested, l.unit)}</span>
                  </td>
                  {mode === 'send' && (
                    <td
                      className={`whitespace-nowrap px-4 py-3.5 text-right font-mono ${l.own_available < l.qty_requested ? 'font-bold text-amber-600' : 'text-slate-500'}`}
                      title={l.own_available < l.own_stock ? `${formatQty(l.own_stock)} on hand, ${formatQty(round3(l.own_stock - l.own_available))} held for open orders` : undefined}
                    >
                      {formatQty(l.own_available)}
                    </td>
                  )}
                  {mode === 'receive' && (
                    <td className={`whitespace-nowrap px-4 py-3.5 text-right font-mono ${(l.qty_sent ?? 0) < l.qty_requested ? 'font-bold text-amber-600' : 'text-slate-700'}`}>
                      {formatQty(l.qty_sent ?? 0)}
                    </td>
                  )}
                  {mode === 'receive' && <td className="whitespace-nowrap px-4 py-3.5 text-right font-mono text-slate-500">{formatQty(l.own_stock)}</td>}
                  {editable && (
                    <td className="px-4 py-3.5 text-right">
                      <input
                        type="number"
                        min="0"
                        value={value}
                        onChange={(e) => {
                          setQtys((prev) => ({ ...prev, [l.transfer_line_id]: Math.max(0, Number(e.target.value) || 0) }));
                          setError(null);
                        }}
                        aria-label={`Amount of ${l.name}`}
                        className={`w-20 rounded-lg border px-2.5 py-2 text-right font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          over ? 'border-rose-400 bg-rose-50' : short ? 'border-amber-400 bg-amber-50' : 'border-slate-300'
                        }`}
                      />
                    </td>
                  )}
                  {/* Our stock once this delivery is added */}
                  {mode === 'receive' && (
                    <td className={`whitespace-nowrap px-4 py-3.5 text-right font-mono font-bold ${over ? 'text-slate-300' : 'text-emerald-700'}`}>
                      {formatQty(round3(l.own_stock + value))}{' '}
                      <span className="text-[11px] font-normal text-slate-400">{unitLabel(round3(l.own_stock + value), l.unit)}</span>
                    </td>
                  )}
                  {mode === 'view' && (
                    <>
                      <td
                        className={`whitespace-nowrap px-4 py-3.5 text-right font-mono ${l.qty_sent !== null && l.qty_sent < l.qty_requested ? 'font-bold text-amber-600' : 'text-slate-700'}`}
                      >
                        {l.qty_sent === null ? '—' : formatQty(l.qty_sent)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3.5 text-right font-mono ${
                          l.qty_received !== null && l.qty_received < (l.qty_sent ?? l.qty_requested) ? 'font-bold text-amber-600' : 'text-slate-900'
                        }`}
                      >
                        {l.qty_received === null ? '—' : formatQty(l.qty_received)}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {mode === 'send' &&
          (overCount > 0 ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
              <strong>
                {overCount} item{overCount > 1 ? 's are' : ' is'} more than you have or more than was asked.
              </strong>{' '}
              Lower the amount to send.
            </div>
          ) : (
            <div className={`rounded-lg border p-3 text-xs ${shortCount > 0 ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
              {shortCount > 0 && (
                <>
                  <strong>
                    Sending less than asked for {shortCount} item{shortCount > 1 ? 's' : ''}.
                  </strong>{' '}
                </>
              )}
              Sending will remove <strong>{formatQty(total)} units</strong> from {ourBranchName} stock.
            </div>
          ))}
        {mode === 'receive' &&
          (overCount > 0 ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
              <strong>
                {overCount} item{overCount > 1 ? 's are' : ' is'} more than was sent.
              </strong>{' '}
              Check the count again.
            </div>
          ) : (
            <div className={`rounded-lg border p-3 text-xs ${shortCount > 0 ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
              {shortCount > 0 ? (
                <>
                  <strong>
                    {shortCount} item{shortCount > 1 ? 's are' : ' is'} short.
                  </strong>{' '}
                  This will be recorded.{' '}
                </>
              ) : (
                <>
                  <strong>Everything arrived.</strong>{' '}
                </>
              )}
              <strong>{formatQty(total)} units</strong> will be added to {ourBranchName} stock.
            </div>
          ))}

        {mode === 'receive' && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Note (optional)</label>
            <textarea
              rows={2}
              maxLength={500}
              value={receiveNote}
              onChange={(e) => setReceiveNote(e.target.value)}
              placeholder="e.g. 2 plates bent on arrival."
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {mode === 'view' && (
          <div className="space-y-2 text-xs">
            {t.reject_reason && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800">
                <strong>Rejected:</strong> {t.reject_reason}
              </p>
            )}
            {t.receive_notes && (
              <p className="rounded-lg bg-slate-50 p-3 text-slate-700">
                <strong>Note when received:</strong> {t.receive_notes}
              </p>
            )}
            <ul className="space-y-1 text-slate-500">
              <li>
                Asked on {formatDate(t.created_at)}
                {t.requested_by_name && ` by ${t.requested_by_name}`}
              </li>
              {t.sent_at && (
                <li>
                  Sent on {formatDate(t.sent_at)}
                  {t.sent_by_name && ` by ${t.sent_by_name}`}
                </li>
              )}
              {t.received_at && (
                <li>
                  Received on {formatDate(t.received_at)}
                  {t.received_by_name && ` by ${t.received_by_name}`}
                </li>
              )}
              {t.display_status === 'CANCELLED' && t.closed_at && <li>Cancelled on {formatDate(t.closed_at)}{t.closed_by_name && ` by ${t.closed_by_name}`}</li>}
              {t.display_status === 'REJECTED' && t.closed_at && <li>Rejected on {formatDate(t.closed_at)}{t.closed_by_name && ` by ${t.closed_by_name}`}</li>}
            </ul>
          </div>
        )}

        {mode === 'send' && rejecting && (
          <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/50 p-4">
            <label className="block text-xs font-semibold text-rose-900">
              Why are you rejecting? <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={2}
              autoFocus
              maxLength={500}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={`This will be shown to ${t.requesting_branch.name}.`}
              className="w-full rounded-lg border border-rose-300 bg-white px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
        )}

        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Modal>
  );
}
