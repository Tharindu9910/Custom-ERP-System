import { Fragment, useState } from 'react';
import { SHORTAGE_REASON_LABEL, ShortageReason } from '@erp/shared';
import { Modal } from '@/shared/components/Modal';
import { Notice } from '@/shared/components/Notice';
import { apiError } from '@/shared/api/errors';
import { formatDate, formatLocalDate } from '@/shared/lib/format';
import { useTransferAction, type TransferDto } from '../hooks/useStockTransfers';
import { TransferStatusBadge, UrgentBadge, fieldCls } from '@/modules/inventory/components/StockBadges';
import { formatQty, unitLabel } from '../lib/transfer';

/** shortage = the asking branch's manager reviews a short delivery (Docs/decisions/0014) */
export type TransferModalMode = 'send' | 'receive' | 'shortage' | 'view';

const REASONS = Object.values(ShortageReason);

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Check & Send (asked branch), Receive (asking branch), Review shortage (asking branch's
 * manager) or read-only details (prototype).
 */
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
  // Send: what was asked, but never more than we have. Receive: what was sent. Shortage: what was counted.
  const initial = (l: TransferDto['lines'][number]) =>
    mode === 'send' ? Math.max(0, Math.min(l.qty_requested, l.own_available)) : mode === 'shortage' ? (l.qty_received ?? 0) : (l.qty_sent ?? 0);
  const [qtys, setQtys] = useState<Record<string, number>>(() => Object.fromEntries(t.lines.map((l) => [l.transfer_line_id, initial(l)])));
  // Why each short line is short (receive)
  const [reasons, setReasons] = useState<Record<string, { reason?: ShortageReason; note: string }>>({});
  const [receiveNote, setReceiveNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const editable = mode === 'send' || mode === 'receive' || mode === 'shortage';
  const incoming = t.side === 'INCOMING';
  const rows = t.lines.map((l) => {
    const value = qtys[l.transfer_line_id] ?? 0;
    const max = mode === 'send' ? Math.min(l.own_available, l.qty_requested) : (l.qty_sent ?? 0);
    const target = mode === 'send' ? l.qty_requested : (l.qty_sent ?? 0);
    // A corrected count can only go up from what was counted
    const under = mode === 'shortage' && value < (l.qty_received ?? 0);
    return { line: l, value, over: value > max || under, short: value < target };
  });
  const total = round3(rows.reduce((s, r) => s + r.value, 0));
  const overCount = rows.filter((r) => r.over).length;
  const shortCount = rows.filter((r) => r.short).length;
  const missingReason = mode === 'receive' && rows.some((r) => r.short && (!reasons[r.line.transfer_line_id]?.reason ||
    (reasons[r.line.transfer_line_id]?.reason === ShortageReason.OTHER && !reasons[r.line.transfer_line_id]?.note.trim())));
  // Shortage review: what the manager is about to accept as lost, and what they found extra
  const lostUnits = round3(rows.reduce((s, r) => s + Math.max(0, (r.line.qty_sent ?? 0) - r.value), 0));
  const foundUnits = round3(rows.reduce((s, r) => s + Math.max(0, r.value - (r.line.qty_received ?? 0)), 0));
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
          body: {
            lines: rows.map((r) => ({
              transfer_line_id: r.line.transfer_line_id,
              qty_received: r.value,
              ...(r.short
                ? { shortage_reason: reasons[r.line.transfer_line_id]?.reason, shortage_note: reasons[r.line.transfer_line_id]?.note.trim() || undefined }
                : {}),
            })),
            notes: receiveNote.trim() || undefined,
          },
        }),
      shortCount > 0
        ? `${formatQty(total)} units added to ${ourBranchName} stock. The shortage is waiting for the manager.`
        : `${formatQty(total)} units added to ${ourBranchName} stock.`,
    );
  const correct = () =>
    run(
      () =>
        action.mutateAsync({
          action: 'shortage/correct',
          id: t.transfer_id,
          body: { lines: rows.map((r) => ({ transfer_line_id: r.line.transfer_line_id, qty_received: r.value })) },
        }),
      `Count corrected: ${formatQty(foundUnits)} more units added to ${ourBranchName} stock.`,
    );
  const approve = () =>
    run(
      () => action.mutateAsync({ action: 'shortage/approve', id: t.transfer_id }),
      `Shortage on ${t.transfer_number} approved: ${formatQty(lostUnits)} units recorded as lost in transit.`,
    );
  const reject = () =>
    run(() => action.mutateAsync({ action: 'reject', id: t.transfer_id, body: { reason: rejectReason.trim() } }), `Request ${t.transfer_number} rejected.`);

  const title = mode === 'send' ? 'Check & Send' : mode === 'receive' ? 'Receive stock' : mode === 'shortage' ? 'Review shortage' : 'Request details';

  return (
    <Modal
      open
      size="md"
      onClose={onClose}
      title={title}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-bold text-slate-800">{t.transfer_number}</span>
          <TransferStatusBadge status={t.display_status} />
          {t.is_urgent && <UrgentBadge />}
        </span>
      }
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-3">
          {mode === 'view' && (
            <button onClick={onClose} className="btn-secondary">
              Close
            </button>
          )}
          {mode === 'send' && !rejecting && (
            <>
              <button onClick={() => setRejecting(true)} className="btn-secondary mr-auto border-red-300 text-red-700 hover:bg-red-50">
                Reject
              </button>
              <button onClick={onClose} className="btn-secondary">
                Close
              </button>
              <button
                disabled={overCount > 0 || total === 0 || action.isPending}
                onClick={() => void send()}
                className="btn-primary"
              >
                {action.isPending ? 'Sending…' : `Send ${formatQty(total)} units`}
              </button>
            </>
          )}
          {mode === 'send' && rejecting && (
            <>
              <button onClick={() => setRejecting(false)} className="btn-secondary">
                Back
              </button>
              <button
                disabled={rejectReason.trim().length < 3 || action.isPending}
                onClick={() => void reject()}
                className="btn-primary bg-red-600 hover:bg-red-700"
              >
                Reject request
              </button>
            </>
          )}
          {mode === 'receive' && (
            <>
              <button onClick={onClose} className="btn-secondary">
                Close
              </button>
              <button
                disabled={overCount > 0 || missingReason || action.isPending}
                onClick={() => void receive()}
                className="btn-primary bg-emerald-600 hover:bg-emerald-700"
              >
                {action.isPending ? 'Saving…' : 'Add to our stock'}
              </button>
            </>
          )}
          {mode === 'shortage' && (
            <>
              <button onClick={onClose} className="btn-secondary mr-auto">
                Close
              </button>
              {foundUnits > 0 ? (
                <button disabled={overCount > 0 || action.isPending} onClick={() => void correct()} className="btn-primary">
                  {action.isPending ? 'Saving…' : `Add ${formatQty(foundUnits)} found units`}
                </button>
              ) : (
                <button disabled={action.isPending} onClick={() => void approve()} className="btn-primary bg-orange-600 hover:bg-orange-700">
                  {action.isPending ? 'Saving…' : `Approve loss of ${formatQty(lostUnits)} units`}
                </button>
              )}
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
          <span className={`text-right font-semibold ${t.late ? 'text-red-600' : 'text-slate-900'}`}>
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
        {mode === 'receive' && <p className="text-sm text-slate-600">Count what arrived. If the count is different from what was sent, change it here and say why.</p>}
        {mode === 'shortage' && (
          <p className="text-sm text-slate-600">
            {t.received_by_name ?? 'Your branch'} counted less than {t.supplying_branch.name} sent. Approve the missing units as lost, or raise the count if more turned up.
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="rounded-l-lg px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">Asked</th>
                {mode === 'send' && <th className="px-4 py-3 text-right">We can send</th>}
                {mode === 'send' && <th className="rounded-r-lg px-4 py-3 text-right">We send</th>}
                {mode !== 'send' && <th className="px-4 py-3 text-right">Sent</th>}
                {mode === 'receive' && <th className="px-4 py-3 text-right">We have</th>}
                {mode !== 'send' && (
                  <th className={`px-4 py-3 text-right ${mode === 'view' ? 'rounded-r-lg' : ''}`}>{mode === 'shortage' ? 'Counted' : 'Received'}</th>
                )}
                {mode === 'receive' && <th className="rounded-r-lg px-4 py-3 text-right">New total</th>}
                {mode === 'shortage' && <th className="rounded-r-lg px-4 py-3 text-right">Short</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ line: l, value, over, short }) => (
                <Fragment key={l.transfer_line_id}>
                <tr>
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
                  {(mode === 'receive' || mode === 'shortage') && (
                    <td className={`whitespace-nowrap px-4 py-3.5 text-right font-mono ${(l.qty_sent ?? 0) < l.qty_requested ? 'font-bold text-amber-600' : 'text-slate-700'}`}>
                      {formatQty(l.qty_sent ?? 0)}
                    </td>
                  )}
                  {mode === 'receive' && <td className="whitespace-nowrap px-4 py-3.5 text-right font-mono text-slate-500">{formatQty(l.own_stock)}</td>}
                  {editable && (
                    <td className="px-4 py-3.5 text-right">
                      <input
                        type="number"
                        min={mode === 'shortage' ? (l.qty_received ?? 0) : 0}
                        max={mode === 'send' ? undefined : (l.qty_sent ?? 0)}
                        disabled={mode === 'shortage' && (l.qty_received ?? 0) >= (l.qty_sent ?? 0)}
                        value={value}
                        onChange={(e) => {
                          setQtys((prev) => ({ ...prev, [l.transfer_line_id]: Math.max(0, Number(e.target.value) || 0) }));
                          setError(null);
                        }}
                        aria-label={`Amount of ${l.name}`}
                        className={`w-20 rounded-lg border px-2.5 py-2 text-right font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          over ? 'border-red-400 bg-red-50' : short ? 'border-amber-400 bg-amber-50' : 'border-slate-300'
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
                  {mode === 'shortage' && (
                    <td className={`whitespace-nowrap px-4 py-3.5 text-right font-mono font-bold ${short ? 'text-orange-600' : 'text-emerald-700'}`}>
                      {short ? formatQty(round3((l.qty_sent ?? 0) - value)) : '—'}
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
                {/* Receive: why this line is short. Review / view: the reason given */}
                {mode === 'receive' && short && !over && (
                  <tr className="bg-amber-50/40">
                    <td colSpan={8} className="px-4 pb-3 pt-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-amber-700">{formatQty(round3((l.qty_sent ?? 0) - value))} short — why?</span>
                        <select
                          aria-label={`Why ${l.name} is short`}
                          value={reasons[l.transfer_line_id]?.reason ?? ''}
                          onChange={(e) =>
                            setReasons((prev) => ({ ...prev, [l.transfer_line_id]: { note: prev[l.transfer_line_id]?.note ?? '', reason: (e.target.value || undefined) as ShortageReason | undefined } }))
                          }
                          className={`${fieldCls} py-1.5 text-xs`}
                        >
                          <option value="">Choose a reason…</option>
                          {REASONS.map((r) => (
                            <option key={r} value={r}>
                              {SHORTAGE_REASON_LABEL[r]}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          maxLength={500}
                          aria-label={`Note about ${l.name}`}
                          value={reasons[l.transfer_line_id]?.note ?? ''}
                          onChange={(e) => setReasons((prev) => ({ ...prev, [l.transfer_line_id]: { reason: prev[l.transfer_line_id]?.reason, note: e.target.value } }))}
                          placeholder={reasons[l.transfer_line_id]?.reason === ShortageReason.OTHER ? 'Say what happened (required)' : 'Note (optional)'}
                          className={`${fieldCls} min-w-[12rem] flex-1 py-1.5 text-xs`}
                        />
                      </div>
                    </td>
                  </tr>
                )}
                {mode !== 'receive' && l.shortage_reason && (
                  <tr>
                    <td colSpan={8} className="px-4 pb-3 pt-0 text-xs text-orange-700">
                      Short: {SHORTAGE_REASON_LABEL[l.shortage_reason]}
                      {l.shortage_note && <span className="text-slate-600"> — {l.shortage_note}</span>}
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {mode === 'send' &&
          (overCount > 0 ? (
            <Notice tone="error">
              <strong>
                {overCount} item{overCount > 1 ? 's are' : ' is'} more than you have or more than was asked.
              </strong>{' '}
              Lower the amount to send.
            </Notice>
          ) : (
            <Notice tone={shortCount > 0 ? 'warning' : 'info'}>
              {shortCount > 0 && (
                <>
                  <strong>
                    Sending less than asked for {shortCount} item{shortCount > 1 ? 's' : ''}.
                  </strong>{' '}
                </>
              )}
              Sending will remove <strong>{formatQty(total)} units</strong> from {ourBranchName} stock.
            </Notice>
          ))}
        {mode === 'receive' &&
          (overCount > 0 ? (
            <Notice tone="error">
              <strong>
                {overCount} item{overCount > 1 ? 's are' : ' is'} more than was sent.
              </strong>{' '}
              Check the count again.
            </Notice>
          ) : (
            <Notice tone={shortCount > 0 ? 'warning' : 'success'}>
              {shortCount > 0 ? (
                <>
                  <strong>
                    {shortCount} item{shortCount > 1 ? 's are' : ' is'} short.
                  </strong>{' '}
                  {missingReason ? 'Choose why for each short item. ' : 'Your manager will review the missing units. '}
                </>
              ) : (
                <>
                  <strong>Everything arrived.</strong>{' '}
                </>
              )}
              <strong>{formatQty(total)} units</strong> will be added to {ourBranchName} stock.
            </Notice>
          ))}

        {mode === 'shortage' &&
          (overCount > 0 ? (
            <Notice tone="error">
              <strong>A count can only go up from what was counted, and not above what was sent.</strong>
            </Notice>
          ) : foundUnits > 0 ? (
            <Notice tone="info">
              <strong>{formatQty(foundUnits)} more units</strong> will be added to {ourBranchName} stock.
              {lostUnits > 0 ? ` ${formatQty(lostUnits)} would still be short and wait for approval.` : ' Nothing will be short, so the request closes.'}
            </Notice>
          ) : (
            <Notice tone="warning">
              Approving records <strong>{formatQty(lostUnits)} units</strong> as lost in transit. {ourBranchName} stock does not change — they never arrived.
            </Notice>
          ))}

        {mode === 'receive' && (
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Note (optional)</label>
            <textarea
              rows={2}
              maxLength={500}
              value={receiveNote}
              onChange={(e) => setReceiveNote(e.target.value)}
              placeholder="e.g. 2 plates bent on arrival."
              className={`${fieldCls} w-full`}
            />
          </div>
        )}

        {mode === 'view' && (
          <div className="space-y-2 text-xs">
            {t.reject_reason && (
              <Notice tone="error">
                <strong>Rejected:</strong> {t.reject_reason}
              </Notice>
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
              {t.display_status === 'SHORT' && <li className="font-semibold text-orange-700">Arrived short — waiting for {t.requesting_branch.name}'s manager</li>}
              {t.shortage_approved_at && (
                <li>
                  Shortage approved on {formatDate(t.shortage_approved_at)}
                  {t.shortage_approved_by_name && ` by ${t.shortage_approved_by_name}`}
                </li>
              )}
              {t.display_status === 'CANCELLED' && t.closed_at && <li>Cancelled on {formatDate(t.closed_at)}{t.closed_by_name && ` by ${t.closed_by_name}`}</li>}
              {t.display_status === 'REJECTED' && t.closed_at && <li>Rejected on {formatDate(t.closed_at)}{t.closed_by_name && ` by ${t.closed_by_name}`}</li>}
            </ul>
          </div>
        )}

        {mode === 'send' && rejecting && (
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Why are you rejecting? <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={2}
              autoFocus
              maxLength={500}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={`This will be shown to ${t.requesting_branch.name}.`}
              className={`${fieldCls} w-full`}
            />
          </div>
        )}

        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Modal>
  );
}
