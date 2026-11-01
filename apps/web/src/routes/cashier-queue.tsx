import { useMemo, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { OrderType } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { IdChip } from '@/shared/components/Marks';
import { Notice } from '@/shared/components/Notice';
import { SearchInput } from '@/shared/components/SearchInput';
import { BoardSection, StatusCards, type StatusStep } from '@/shared/components/StatusBoard';
import { TONES } from '@/shared/lib/status-tones';
import { useCanTransact } from '@/shared/hooks/useCanTransact';
import { formatDateTime, formatRs } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { WorkOrderModal } from '@/modules/job-cards/components/WorkOrderModal';
import { CashierCheckout } from '@/modules/orders/components/CashierCheckout';
import { useCashierQueue, type CashierColumn, type CashierQueueRow } from '@/modules/orders/hooks/useOrders';

type StepKey = CashierColumn;

// The cashier's area of the lifecycle, in order (Docs/decisions/0005)
const STEPS: StatusStep<StepKey>[] = [
  {
    key: 'AWAITING_PAYMENT',
    title: 'Awaiting Payment',
    icon: 'wallet',
    empty: 'No orders waiting for payment.',
    tone: TONES.amber,
  },
  {
    key: 'IN_WORKSHOP',
    title: 'In Workshop',
    icon: 'wrench',
    empty: 'No jobs in the workshop.',
    tone: TONES.blue,
  },
  {
    key: 'FINISHED_BALANCE_DUE',
    title: 'Finished – Balance Due',
    icon: 'checkCircle',
    empty: 'No balances due on finished jobs.',
    tone: TONES.emerald,
  },
  {
    key: 'ROOFING_BALANCE',
    title: 'Roofing – Balance Due',
    icon: 'house',
    empty: 'No roofing balances due.',
    tone: TONES.violet,
  },
];

/**
 * Cashier Queue (Docs/decisions/0005): the cashier's statuses as cards. Awaiting
 * Payment → (take advance) → workshop; while the job is there the customer can pay more
 * (In Workshop lists every job there, paid or not; the card does not move); finished cards that still owe money
 * wait under Finished – Balance Due. Once a card is paid in full it leaves for the
 * supervisor, who checks the items and hands them over. Picking a card shows only its
 * list, full width. Roofing balances have their own card until roofing gets its own flow.
 * Every payment button opens the checkout (?checkout=<order>) in place of the board:
 * the cashier ticks off each item, then takes the payment.
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
  const [step, setStep] = useState<StepKey>('AWAITING_PAYMENT');
  const navigate = useNavigate();
  const { checkout } = useSearch({ strict: false }) as { checkout?: string };
  const checkoutRow = checkout ? all.find((r) => r.order_id === checkout) : undefined;
  const openCheckout = (r: CashierQueueRow) => void navigate({ to: '/cashier-queue', search: { checkout: r.order_id } });
  const closeCheckout = () => void navigate({ to: '/cashier-queue', search: {} });
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
        <button onClick={() => openCheckout(r)} className="btn-primary whitespace-nowrap">
          <Icon name="banknote" className="h-4 w-4" /> Take Advance
        </button>
      );
    }
    if (r.column === 'IN_WORKSHOP') {
      // Paid in full while the job runs: nothing to collect, it waits for the workshop to finish
      if (r.balance === 0) return <span className="whitespace-nowrap text-xs font-semibold text-slate-500">Waiting for workshop</span>;
      return (
        <button onClick={() => openCheckout(r)} className="btn-primary whitespace-nowrap">
          <Icon name="banknote" className="h-4 w-4" /> Take Payment
        </button>
      );
    }
    if (r.column === 'FINISHED_BALANCE_DUE') {
      return (
        <button onClick={() => openCheckout(r)} className="btn-primary whitespace-nowrap bg-emerald-600 hover:bg-emerald-700">
          <Icon name="banknote" className="h-4 w-4" /> Collect Balance
        </button>
      );
    }
    return (
      <button onClick={() => openCheckout(r)} className="btn-secondary whitespace-nowrap">
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
          {!checkout && (
            <div className="w-full lg:max-w-md">
              <SearchInput value={search} onChange={setSearch} placeholder="Search order number, customer name or phone..." />
            </div>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 p-8">
        {done && <Notice tone="success">{done}</Notice>}

        {checkout ? (
          checkoutRow ? (
            <CashierCheckout
              key={checkoutRow.order_id}
              row={checkoutRow}
              onBack={closeCheckout}
              onPaid={(msg) => {
                setDone(msg);
                closeCheckout();
              }}
            />
          ) : isLoading ? (
            <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
          ) : (
            <Notice tone="warning">
              This order is no longer waiting for payment.{' '}
              <button onClick={closeCheckout} className="font-semibold underline">
                Back to queue
              </button>
            </Notice>
          )
        ) : (
          <>
            {/* One card per status, in lifecycle order; the picked one shows its list below */}
            <StatusCards
              steps={steps}
              value={current.key}
              onChange={setStep}
              loading={isLoading}
              counts={Object.fromEntries(steps.map((s) => [s.key, rows.filter((r) => r.column === s.key).length]))}
              // The arrow joins the job card steps; roofing is a separate flow
              arrowAfter={(key) => key === 'AWAITING_PAYMENT' || key === 'IN_WORKSHOP'}
            />

            <BoardSection title={current.title} count={list.length}>
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
                            {r.column === 'IN_WORKSHOP' && (
                              <span className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                                Workshop: {r.display_label}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4">
                            <div className="font-semibold text-slate-900">{r.customer_name ?? 'Walk-in'}</div>
                            <div className="font-mono text-xs text-slate-500">{r.customer_phone}</div>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-right text-slate-700">{formatRs(r.total)}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-right text-slate-700">{formatRs(r.paid_amount)}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-right font-bold text-slate-900">
                            {r.column === 'AWAITING_PAYMENT' ? (
                              r.advance_due > 0 ? (
                                <span title="Minimum before the order goes to the Workshop or Order Queue">{formatRs(r.advance_due)}</span>
                              ) : (
                                <span className="text-slate-500" title="Nothing due: take a payment or send it to the workshop">
                                  No advance
                                </span>
                              )
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
            </BoardSection>
          </>
        )}
      </main>

      {selected && <WorkOrderModal readOnly orderId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
