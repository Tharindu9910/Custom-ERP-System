import { useMemo, useRef, useState } from 'react';
import { DEFAULT_BRANCH_SETTINGS, OrderStatus, PaymentMode } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { IdChip } from '@/shared/components/Marks';
import { Modal } from '@/shared/components/Modal';
import { Notice } from '@/shared/components/Notice';
import { SearchInput } from '@/shared/components/SearchInput';
import { apiError, newRequestId } from '@/shared/api/errors';
import { useBranchContext } from '@/shared/hooks/useBranchContext';
import { useCanTransact } from '@/shared/hooks/useCanTransact';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import { centsToInput, formatDateTime, formatRs, parseMoney } from '@/shared/lib/format';
import { useCashierQueue, useRecordPayment, type CashierQueueRow } from '@/modules/orders/hooks/useOrders';

const MODE_LABEL: Record<PaymentMode, string> = { CASH: 'Cash', CARD: 'Card', TRANSFER: 'Transfer' };

/**
 * Minimal Cashier Queue so job cards can reach the workshop (BR05). The full
 * cashier screens from the prototype come in the cashier phase.
 */
export function CashierQueuePage() {
  const { data: all = [], isLoading, isFetching, refetch } = useCashierQueue();
  const canTransact = useCanTransact();
  // The queue is loaded in full (open items only), so searching filters here: no extra requests
  const [search, setSearch] = useState('');
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    const digits = q.replace(/\D/g, '');
    return all.filter(
      (r) =>
        r.order_number.toLowerCase().includes(q) ||
        (r.customer_name ?? '').toLowerCase().includes(q) ||
        (!!digits && (r.customer_phone ?? '').replace(/\D/g, '').includes(digits)),
    );
  }, [all, search]);
  const [paying, setPaying] = useState<CashierQueueRow | null>(null);
  const [done, setDone] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cashier Queue</h1>
          <p className="mt-1 text-sm text-slate-500">Job cards waiting for the advance, and orders with a balance due.</p>
        </div>
        <button onClick={() => void refetch()} className="btn-secondary">
          <Icon name="refresh" className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>
      {done && (
        <Notice tone="success" className="mb-4">
          {done}
        </Notice>
      )}
      <div className="mb-4 flex items-center gap-4">
        <div className="flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder="Search order number, customer name or phone..." />
        </div>
        {search.trim() && (
          <span className="shrink-0 text-sm text-slate-500">
            {rows.length} of {all.length}
          </span>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3 text-left">Order</th>
              <th className="px-5 py-3 text-left">Customer</th>
              <th className="px-5 py-3 text-left">Status</th>
              <th className="px-5 py-3 text-right">Total</th>
              <th className="px-5 py-3 text-right">Paid</th>
              <th className="px-5 py-3 text-right">Due now</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                  {all.length === 0 ? (
                    'Nothing waiting for payment.'
                  ) : (
                    <>
                      No orders match “{search.trim()}”.{' '}
                      <button onClick={() => setSearch('')} className="font-semibold text-blue-600 hover:underline">
                        Clear search
                      </button>
                    </>
                  )}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.order_id} className="hover:bg-slate-50/60">
                <td className="px-5 py-3">
                  <IdChip>{r.order_number}</IdChip>
                  <div className="mt-1 text-xs text-slate-400">
                    {r.order_type === 'JOB_CARD' ? 'Job card' : 'Roofing order'} · {formatDateTime(r.created_at)}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <div className="font-semibold text-slate-900">{r.customer_name ?? 'Walk-in'}</div>
                  <div className="font-mono text-xs text-slate-500">{r.customer_phone}</div>
                </td>
                <td className="px-5 py-3 text-xs font-semibold text-slate-700">{r.display_label}</td>
                <td className="px-5 py-3 text-right">{formatRs(r.total)}</td>
                <td className="px-5 py-3 text-right">{formatRs(r.paid_amount)}</td>
                <td className="px-5 py-3 text-right font-bold text-slate-900">
                  {r.status === OrderStatus.DRAFT ? (
                    <span title="Minimum advance before the job goes to the workshop">{formatRs(r.advance_due)} advance</span>
                  ) : (
                    formatRs(r.balance)
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  {canTransact && (
                    <button onClick={() => setPaying(r)} className="rounded-md bg-[#0033A0] px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800">
                      Record payment
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paying && (
        <PaymentDialog
          row={paying}
          onClose={() => setPaying(null)}
          onPaid={(msg) => {
            setPaying(null);
            setDone(msg);
          }}
        />
      )}
    </div>
  );
}

function PaymentDialog({ row, onClose, onPaid }: { row: CashierQueueRow; onClose: () => void; onPaid: (msg: string) => void }) {
  const { settings } = useBranchContext();
  const general = settings?.general ?? DEFAULT_BRANCH_SETTINGS.general;
  const online = useOnlineStatus();
  const pay = useRecordPayment();
  const requestId = useRef(newRequestId());
  const suggested = row.status === OrderStatus.DRAFT && row.advance_due > 0 ? row.advance_due : row.balance;
  const [amount, setAmount] = useState(centsToInput(suggested));
  const [mode, setMode] = useState<PaymentMode>(general.payment_modes[0] ?? PaymentMode.CASH);
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const needsRef = mode !== PaymentMode.CASH && general.require_payment_reference;

  const submit = async () => {
    setError(null);
    const cents = parseMoney(amount);
    if (cents <= 0) return setError('Enter an amount.');
    if (cents > row.balance) return setError(`The balance is ${formatRs(row.balance)}.`);
    if (needsRef && !reference.trim()) return setError('A reference number is required for card and transfer payments.');
    try {
      const res = await pay.mutateAsync({
        orderId: row.order_id,
        dto: { client_request_id: requestId.current, amount: cents, mode, reference: reference.trim() || undefined },
      });
      onPaid(
        res.status === OrderStatus.IN_QUEUE && row.status === OrderStatus.DRAFT
          ? `${formatRs(cents)} received for ${row.order_number}. It is now in the Workshop Queue.`
          : `${formatRs(cents)} received for ${row.order_number}.`,
      );
    } catch (e) {
      setError(apiError(e).message);
    }
  };

  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={`Record payment · ${row.order_number}`}
      subtitle={`Balance ${formatRs(row.balance)}${row.status === OrderStatus.DRAFT ? ` · minimum advance ${formatRs(row.min_advance)}` : ''}`}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={() => void submit()} disabled={pay.isPending || !online} className="btn-primary">
            {pay.isPending ? 'Saving…' : 'Record payment'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {!online && <Notice tone="warning">Payments can't be recorded offline (BR18). Reconnect to continue.</Notice>}
        <div>
          <label className="field-label">Amount (Rs.)</label>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="field-input" />
          <div className="mt-1.5 flex gap-2">
            {row.status === OrderStatus.DRAFT && row.advance_due > 0 && (
              <button type="button" onClick={() => setAmount(centsToInput(row.advance_due))} className="spec-chip hover:bg-slate-100">
                Minimum advance
              </button>
            )}
            <button type="button" onClick={() => setAmount(centsToInput(row.balance))} className="spec-chip hover:bg-slate-100">
              Full balance
            </button>
          </div>
        </div>
        <div>
          <label className="field-label">Payment method</label>
          <div className="flex gap-2">
            {general.payment_modes.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${mode === m ? 'border-[#0033A0] bg-blue-50 text-[#0033A0]' : 'border-slate-300 text-slate-600'}`}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
        {mode !== PaymentMode.CASH && (
          <div>
            <label className="field-label">Reference {needsRef && <span className="text-red-500">*</span>}</label>
            <input value={reference} onChange={(e) => setReference(e.target.value)} className="field-input" />
          </div>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Modal>
  );
}
