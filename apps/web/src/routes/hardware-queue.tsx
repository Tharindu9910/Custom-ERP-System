import { useMemo, useRef, useState } from 'react';
import { DEFAULT_BRANCH_SETTINGS, PaymentMode } from '@erp/shared';
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
import { formatDateTime, formatRs } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { FullPaymentFields } from '@/modules/hardware/components/FullPaymentFields';
import { fullPaymentError, type FullPaymentDraft } from '@/modules/hardware/lib/full-payment';
import { HardwareSaleModal } from '@/modules/hardware/components/HardwareSaleModal';
import {
  useCancelHardwareSale,
  useHardwareQueue,
  usePayHardwareSale,
  type HardwareColumn,
  type HardwareQueueRow,
} from '@/modules/hardware/hooks/useHardware';

// The cashier's hardware lifecycle, in order (Docs/decisions/0006)
const STEPS: { key: HardwareColumn; title: string; icon: IconName; empty: string; tone: { ring: string; count: string; icon: string } }[] = [
  {
    key: 'AWAITING_PAYMENT',
    title: 'Awaiting Payment',
    icon: 'wallet',
    empty: 'No hardware orders waiting for payment.',
    tone: { ring: 'border-amber-400 ring-amber-200', count: 'text-amber-600', icon: 'bg-amber-100 text-amber-700' },
  },
  {
    key: 'PAID',
    title: 'Paid Today',
    icon: 'packageCheck',
    empty: 'No hardware orders paid today.',
    tone: { ring: 'border-emerald-400 ring-emerald-200', count: 'text-emerald-600', icon: 'bg-emerald-100 text-emerald-700' },
  },
];

const qty = (n: number | null) => (n === null ? '' : Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, ''));

/**
 * Hardware Queue (Docs/decisions/0006): orders placed in the Hardware Store — by the
 * supervisor, or by another branch's cashier with an advance — wait here until the
 * balance is paid. Paying completes the sale and the goods are handed over.
 */
export function HardwareQueuePage() {
  const { data, isLoading, isFetching, refetch } = useHardwareQueue();
  const all = useMemo(() => data?.rows ?? [], [data]);
  const canTransact = useCanTransact();
  const { can } = usePermission();
  const canPay = canTransact && can('process', 'payment');
  const canCancel = canTransact && can('cancel', 'hardware_sale');

  // The board is loaded in full, so searching filters here: no extra requests
  const [search, setSearch] = useState('');
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    const digits = q.replace(/\D/g, '');
    return all.filter(
      (r) =>
        r.order_number.toLowerCase().includes(q) ||
        (r.customer_name ?? '').toLowerCase().includes(q) ||
        (!!digits && (r.customer_phone ?? '').replace(/\D/g, '').includes(digits)) ||
        r.item_skus.some((s) => s.toLowerCase().includes(q)) ||
        r.item_names.some((n) => n.toLowerCase().includes(q)),
    );
  }, [all, search]);

  const [step, setStep] = useState<HardwareColumn>('AWAITING_PAYMENT');
  const [paying, setPaying] = useState<HardwareQueueRow | null>(null);
  const [cancelling, setCancelling] = useState<HardwareQueueRow | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const current = STEPS.find((s) => s.key === step) ?? STEPS[0];
  const list = rows.filter((r) => r.column === current.key);

  const actionFor = (r: HardwareQueueRow) => {
    if (r.column === 'PAID') {
      return (
        <button onClick={() => setSelected(r.order_id)} className="btn-secondary whitespace-nowrap">
          <Icon name="eye" className="h-4 w-4" /> View
        </button>
      );
    }
    return (
      <div className="flex gap-2">
        {canCancel && (
          <button onClick={() => setCancelling(r)} className="btn-secondary whitespace-nowrap" title="Cancel order">
            <Icon name="ban" className="h-4 w-4" />
          </button>
        )}
        {canPay && (
          <button onClick={() => setPaying(r)} className="btn-primary whitespace-nowrap bg-emerald-600 hover:bg-emerald-700">
            <Icon name="banknote" className="h-4 w-4" /> Collect Payment
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="-m-8 flex min-h-[calc(100vh-4rem)] flex-col bg-slate-50 text-slate-900">
      <header className="shrink-0 border-b border-slate-200 bg-white px-8 py-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Hardware Queue</h1>
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
            <SearchInput value={search} onChange={setSearch} placeholder="Search order no, customer, phone or item SKU..." />
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 p-8">
        {done && <Notice tone="success">{done}</Notice>}

        {/* One card per status, in lifecycle order; the picked one shows its list below */}
        <div className="grid gap-4 sm:grid-cols-2">
          {STEPS.map((s) => {
            const on = s.key === current.key;
            const count = rows.filter((r) => r.column === s.key).length;
            const amount = s.key === 'AWAITING_PAYMENT' ? data?.counts.awaiting_balance : data?.counts.paid_today_total;
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
                  {!search.trim() && amount !== undefined && (
                    <span className="block text-xs font-semibold text-slate-500">
                      {s.key === 'AWAITING_PAYMENT' ? 'To collect' : 'Sold'} {formatRs(amount)}
                    </span>
                  )}
                </span>
                <span className={cn('text-3xl font-bold leading-none', count ? s.tone.count : 'text-slate-300')}>{isLoading ? '–' : count}</span>
                {s.key === 'AWAITING_PAYMENT' && (
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
                  <th className="px-6 py-3 text-left">Items</th>
                  <th className="px-6 py-3 text-right">Total</th>
                  <th className="px-6 py-3 text-right">{current.key === 'AWAITING_PAYMENT' ? 'Balance' : 'Paid'}</th>
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
                {list.map((r) => (
                  <tr key={r.order_id} onClick={() => setSelected(r.order_id)} className="cursor-pointer transition-colors hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-6 py-4">
                      <IdChip>{r.order_number}</IdChip>
                      <div className="mt-1 text-xs text-slate-400">
                        {r.column === 'PAID' && r.paid_at ? `Paid ${formatDateTime(r.paid_at)}` : formatDateTime(r.created_at)}
                        {r.created_by_name ? ` · ${r.created_by_name}` : ''}
                      </div>
                      {r.origin_branch_name && (
                        <span className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200">
                          From {r.origin_branch_name}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="font-semibold text-slate-900">{r.customer_name ?? 'Walk-in'}</div>
                      <div className="font-mono text-xs text-slate-500">{r.customer_phone}</div>
                    </td>
                    <td className="px-6 py-4" title={r.item_names.join(', ')}>
                      <div className="text-slate-800">
                        {qty(r.first_item_qty)}× {r.first_item_name}
                        {r.line_count > 1 && (
                          <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">+{r.line_count - 1} more</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">
                        {r.line_count} line{r.line_count === 1 ? '' : 's'} · {qty(r.total_qty)} units
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-slate-700">{formatRs(r.total)}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-right font-bold text-slate-900">
                      {r.column === 'AWAITING_PAYMENT' ? (
                        <>
                          {formatRs(r.balance)}
                          {r.paid_amount > 0 && <div className="text-xs font-normal text-slate-500">Advance {formatRs(r.paid_amount)}</div>}
                        </>
                      ) : (
                        <span className="text-emerald-600">{formatRs(r.paid_amount)}</span>
                      )}
                    </td>
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end">{actionFor(r)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {selected && <HardwareSaleModal orderId={selected} onClose={() => setSelected(null)} />}
      {paying && (
        <CollectPaymentDialog
          row={paying}
          onClose={() => setPaying(null)}
          onPaid={(msg) => {
            setPaying(null);
            setDone(msg);
          }}
        />
      )}
      {cancelling && (
        <CancelDialog
          row={cancelling}
          onClose={() => setCancelling(null)}
          onCancelled={(msg) => {
            setCancelling(null);
            setDone(msg);
          }}
        />
      )}
    </div>
  );
}

/** Collect the full balance: the order is paid, stock leaves and the goods are handed over. */
function CollectPaymentDialog({ row, onClose, onPaid }: { row: HardwareQueueRow; onClose: () => void; onPaid: (msg: string) => void }) {
  const { settings } = useBranchContext();
  const general = settings?.general ?? DEFAULT_BRANCH_SETTINGS.general;
  const online = useOnlineStatus();
  const pay = usePayHardwareSale();
  const requestId = useRef(newRequestId());
  const [draft, setDraft] = useState<FullPaymentDraft>({ mode: general.payment_modes[0] ?? PaymentMode.CASH, reference: '' });
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const invalid = fullPaymentError(draft, general);
    if (invalid) return setError(invalid);
    try {
      await pay.mutateAsync({
        orderId: row.order_id,
        dto: {
          client_request_id: requestId.current,
          version: row.version,
          amount: row.balance,
          mode: draft.mode,
          reference: draft.mode !== PaymentMode.CASH ? draft.reference.trim() || undefined : undefined,
        },
      });
      onPaid(`${formatRs(row.balance)} received for ${row.order_number}. Hand over the goods.`);
    } catch (e) {
      setError(apiError(e).message);
    }
  };

  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={`Collect payment · ${row.order_number}`}
      subtitle={`${row.customer_name ?? 'Walk-in'}${row.paid_amount > 0 ? ` · advance ${formatRs(row.paid_amount)} already paid${row.origin_branch_name ? ` at ${row.origin_branch_name}` : ''}` : ''}`}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={() => void submit()} disabled={pay.isPending || !online} className="btn-primary bg-emerald-600 hover:bg-emerald-700">
            {pay.isPending ? 'Saving…' : 'Confirm & Mark Paid'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {!online && <Notice tone="warning">Payments can't be recorded offline (BR18). Reconnect to continue.</Notice>}
        <FullPaymentFields amount={row.balance} value={draft} onChange={setDraft} general={general} disabled={pay.isPending} />
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Modal>
  );
}

/** Cancel an unpaid order: held stock is freed; an advance already taken is not refunded (BR16). */
function CancelDialog({ row, onClose, onCancelled }: { row: HardwareQueueRow; onClose: () => void; onCancelled: (msg: string) => void }) {
  const cancel = useCancelHardwareSale();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (reason.trim().length < 3) return setError('Give a reason for cancelling.');
    try {
      await cancel.mutateAsync({ orderId: row.order_id, dto: { version: row.version, reason: reason.trim() } });
      onCancelled(`${row.order_number} cancelled. The items are back in stock.`);
    } catch (e) {
      setError(apiError(e).message);
    }
  };

  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={`Cancel order · ${row.order_number}`}
      subtitle="The held items go back to available stock"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Keep order
          </button>
          <button onClick={() => void submit()} disabled={cancel.isPending} className="btn-primary bg-red-600 hover:bg-red-700">
            {cancel.isPending ? 'Cancelling…' : 'Cancel order'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {row.paid_amount > 0 && (
          <Notice tone="warning">
            An advance of {formatRs(row.paid_amount)} was paid{row.origin_branch_name ? ` at ${row.origin_branch_name}` : ''}. It is not refunded — it is
            recorded as a loss.
          </Notice>
        )}
        <div>
          <label className="field-label">Reason</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="field-input" autoFocus />
        </div>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Modal>
  );
}
