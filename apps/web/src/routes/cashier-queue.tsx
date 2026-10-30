import { useMemo, useRef, useState } from 'react';
import { DEFAULT_BRANCH_SETTINGS, OrderStatus, OrderType, PaymentMode } from '@erp/shared';
import { Icon, type IconName } from '@/shared/components/Icon';
import { IdChip } from '@/shared/components/Marks';
import { Modal } from '@/shared/components/Modal';
import { Notice } from '@/shared/components/Notice';
import { SearchInput } from '@/shared/components/SearchInput';
import { apiError, newRequestId } from '@/shared/api/errors';
import { useBranchContext } from '@/shared/hooks/useBranchContext';
import { useCanTransact } from '@/shared/hooks/useCanTransact';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import { usePermission } from '@/shared/hooks/usePermission';
import { centsToInput, formatDateTime, formatRs, parseMoney } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { WorkOrderModal } from '@/modules/job-cards/components/WorkOrderModal';
import { useCashierQueue, useJobCardAction, useRecordPayment, type CashierColumn, type CashierQueueRow } from '@/modules/orders/hooks/useOrders';

const MODE_LABEL: Record<PaymentMode, string> = { CASH: 'Cash', CARD: 'Card', TRANSFER: 'Transfer' };

type StepKey = CashierColumn;

// The cashier's area of the lifecycle, in order (Docs/decisions/0005)
const STEPS: { key: StepKey; title: string; icon: IconName; empty: string; tone: { ring: string; count: string; icon: string } }[] = [
  {
    key: 'AWAITING_PAYMENT',
    title: 'Awaiting Payment',
    icon: 'wallet',
    empty: 'No job cards waiting for an advance.',
    tone: { ring: 'border-amber-400 ring-amber-200', count: 'text-amber-600', icon: 'bg-amber-100 text-amber-700' },
  },
  {
    key: 'READY_FOR_COLLECTION',
    title: 'Ready for Collection',
    icon: 'packageCheck',
    empty: 'Nothing ready for collection.',
    tone: { ring: 'border-emerald-400 ring-emerald-200', count: 'text-emerald-600', icon: 'bg-emerald-100 text-emerald-700' },
  },
  {
    key: 'ROOFING_BALANCE',
    title: 'Roofing – Balance Due',
    icon: 'house',
    empty: 'No roofing balances due.',
    tone: { ring: 'border-blue-400 ring-blue-200', count: 'text-blue-600', icon: 'bg-blue-100 text-blue-700' },
  },
];

/**
 * Cashier Queue (Docs/decisions/0005): the cashier's statuses as cards. Awaiting
 * Payment → (take advance) → workshop; the workshop sends completed cards back to
 * Ready for Collection → (collect balance and close). Picking a card shows only its
 * list, full width. Roofing balances have their own card until roofing gets its own flow.
 */
export function CashierQueuePage() {
  const { data: all = [], isLoading, isFetching, refetch } = useCashierQueue();
  const canTransact = useCanTransact();
  const { can } = usePermission();
  const canClose = canTransact && can('close', 'job_card');
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
  const [step, setStep] = useState<StepKey>('AWAITING_PAYMENT');
  const [paying, setPaying] = useState<CashierQueueRow | null>(null);
  const [closing, setClosing] = useState<CashierQueueRow | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // The roofing card shows only where there is roofing work
  const steps = STEPS.filter((s) => s.key !== 'ROOFING_BALANCE' || all.some((r) => r.column === 'ROOFING_BALANCE'));
  const current = steps.find((s) => s.key === step) ?? steps[0];
  const list = rows.filter((r) => r.column === current.key);

  const actionFor = (r: CashierQueueRow) => {
    if (!canTransact) return null;
    if (r.column === 'AWAITING_PAYMENT') {
      return (
        <button onClick={() => setPaying(r)} className="btn-primary whitespace-nowrap">
          <Icon name="banknote" className="h-4 w-4" /> Take Advance
        </button>
      );
    }
    if (r.column === 'READY_FOR_COLLECTION') {
      if (r.balance > 0) {
        return (
          <button onClick={() => setPaying(r)} className="btn-primary whitespace-nowrap bg-emerald-600 hover:bg-emerald-700">
            <Icon name="banknote" className="h-4 w-4" /> {canClose ? 'Collect & Close' : 'Collect Balance'}
          </button>
        );
      }
      return canClose ? (
        <button onClick={() => setClosing(r)} className="btn-primary whitespace-nowrap bg-emerald-600 hover:bg-emerald-700">
          <Icon name="packageCheck" className="h-4 w-4" /> Close & Hand Over
        </button>
      ) : null;
    }
    return (
      <button onClick={() => setPaying(r)} className="btn-secondary whitespace-nowrap">
        Record payment
      </button>
    );
  };

  return (
    <div className="-m-8 flex min-h-[calc(100vh-4rem)] flex-col bg-slate-50 text-slate-900">
      <header className="shrink-0 border-b border-slate-200 bg-white px-8 py-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cashier Queue</h1>
            <button
              type="button"
              onClick={() => void refetch()}
              title="Refresh"
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <Icon name="refresh" className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="w-full lg:max-w-md">
            <SearchInput value={search} onChange={setSearch} placeholder="Search order number, customer name or phone..." />
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 p-8">
        {done && <Notice tone="success">{done}</Notice>}

        {/* One card per status, in lifecycle order; the picked one shows its list below */}
        <div className={cn('grid gap-4', steps.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
          {steps.map((s) => {
            const on = s.key === current.key;
            const count = rows.filter((r) => r.column === s.key).length;
            // The arrow joins the job card steps; roofing is a separate flow
            const arrow = s.key === 'AWAITING_PAYMENT';
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setStep(s.key)}
                aria-pressed={on}
                className={cn(
                  'relative flex items-center gap-4 rounded-xl border bg-white p-5 text-left shadow-sm transition-all hover:shadow-md',
                  on ? cn('ring-2', s.tone.ring) : 'border-slate-200',
                )}
              >
                <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', s.tone.icon)}>
                  <Icon name={s.icon} className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold text-slate-900">{s.title}</span>
                </span>
                <span className={cn('text-3xl font-bold leading-none', count ? s.tone.count : 'text-slate-300')}>{isLoading ? '–' : count}</span>
                {arrow && (
                  <Icon name="chevronRight" className="absolute -right-3.5 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 rounded-full bg-slate-50 text-slate-300 sm:block" />
                )}
              </button>
            );
          })}
        </div>

        <section className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              {current.title} <span className="ml-1 font-semibold text-slate-400">({list.length})</span>
            </h2>
          </header>
          <div className="flex-1 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-3 text-left">Order</th>
                  <th className="px-6 py-3 text-left">Customer</th>
                  <th className="px-6 py-3 text-right">Total</th>
                  <th className="px-6 py-3 text-right">Paid</th>
                  <th className="px-6 py-3 text-right">{current.key === 'AWAITING_PAYMENT' ? 'Advance due' : 'Balance'}</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                )}
                {!isLoading && list.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-slate-400">
                      {search.trim() ? (
                        <>
                          No orders match “{search.trim()}”.{' '}
                          <button onClick={() => setSearch('')} className="font-semibold text-blue-600 hover:underline">
                            Clear search
                          </button>
                        </>
                      ) : (
                        current.empty
                      )}
                    </td>
                  </tr>
                )}
                {list.map((r) => {
                  const isJobCard = r.order_type === OrderType.JOB_CARD;
                  return (
                    <tr
                      key={r.order_id}
                      onClick={isJobCard ? () => setSelected(r.order_id) : undefined}
                      className={cn('transition-colors hover:bg-slate-50/70', isJobCard && 'cursor-pointer')}
                    >
                      <td className="whitespace-nowrap px-6 py-4">
                        <IdChip>{r.order_number}</IdChip>
                        <div className="mt-1 text-xs text-slate-400">
                          {isJobCard ? 'Job card' : 'Roofing order'} · {formatDateTime(r.created_at)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="font-semibold text-slate-900">{r.customer_name ?? 'Walk-in'}</div>
                        <div className="font-mono text-xs text-slate-500">{r.customer_phone}</div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-slate-700">{formatRs(r.total)}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-slate-700">{formatRs(r.paid_amount)}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-right font-bold text-slate-900">
                        {r.column === 'AWAITING_PAYMENT' ? (
                          <span title="Minimum advance before the job goes to the workshop">{formatRs(r.advance_due)}</span>
                        ) : r.balance > 0 ? (
                          formatRs(r.balance)
                        ) : (
                          <span className="text-emerald-600">Paid in full</span>
                        )}
                      </td>
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end">{actionFor(r)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {selected && <WorkOrderModal readOnly orderId={selected} onClose={() => setSelected(null)} />}
      {paying && (
        <PaymentDialog
          row={paying}
          canClose={canClose}
          onClose={() => setPaying(null)}
          onPaid={(msg) => {
            setPaying(null);
            setDone(msg);
          }}
        />
      )}
      {closing && (
        <CloseJobDialog
          row={closing}
          onClose={() => setClosing(null)}
          onClosed={(msg) => {
            setClosing(null);
            setDone(msg);
          }}
        />
      )}
    </div>
  );
}

/** Close & Hand Over: a completed job card with nothing owed leaves the board. */
function CloseJobDialog({ row, onClose, onClosed }: { row: CashierQueueRow; onClose: () => void; onClosed: (msg: string) => void }) {
  const action = useJobCardAction();
  const [releasedTo, setReleasedTo] = useState(row.customer_name ?? '');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      await action.mutateAsync({
        orderId: row.order_id,
        action: 'close',
        version: row.version,
        released_to: releasedTo.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onClosed(`${row.order_number} closed and handed over.`);
    } catch (e) {
      setError(apiError(e).message);
    }
  };

  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={`Close & Hand Over · ${row.order_number}`}
      subtitle="Paid in full — the job card is closed"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={() => void submit()} disabled={action.isPending} className="btn-primary">
            {action.isPending ? 'Closing…' : 'Close job card'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="field-label">Handed over to</label>
          <input value={releasedTo} onChange={(e) => setReleasedTo(e.target.value)} maxLength={120} className="field-input" />
        </div>
        <div>
          <label className="field-label">Note (optional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} className="field-input" />
        </div>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Modal>
  );
}

function PaymentDialog({
  row,
  canClose,
  onClose,
  onPaid,
}: {
  row: CashierQueueRow;
  canClose: boolean;
  onClose: () => void;
  onPaid: (msg: string) => void;
}) {
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
  // Collect & Close: a completed card is handed over once this payment clears the balance
  const collecting = row.column === 'READY_FOR_COLLECTION' && canClose;
  const [closeAfter, setCloseAfter] = useState(collecting);
  const [releasedTo, setReleasedTo] = useState(row.customer_name ?? '');
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
        dto: {
          client_request_id: requestId.current,
          amount: cents,
          mode,
          reference: reference.trim() || undefined,
          ...(collecting && closeAfter ? { close: true, released_to: releasedTo.trim() || undefined } : {}),
        },
      });
      onPaid(
        res.status === OrderStatus.IN_QUEUE && row.status === OrderStatus.DRAFT
          ? `${formatRs(cents)} received for ${row.order_number}. It is now in the Workshop Queue.`
          : res.status === OrderStatus.CLOSED
            ? `${formatRs(cents)} received for ${row.order_number}. The job card is closed and handed over.`
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
        {collecting && (
          <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input type="checkbox" checked={closeAfter} onChange={(e) => setCloseAfter(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Close job card after payment
            </label>
            {closeAfter && (
              <>
                <p className="text-xs text-slate-500">Closes only if this payment clears the full balance.</p>
                <div>
                  <label className="field-label">Handed over to</label>
                  <input value={releasedTo} onChange={(e) => setReleasedTo(e.target.value)} maxLength={120} className="field-input" />
                </div>
              </>
            )}
          </div>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Modal>
  );
}
