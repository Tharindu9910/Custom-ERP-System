import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { DEFAULT_BRANCH_SETTINGS, type RoofingDisplayStatus, type RoofingQueueTab } from '@erp/shared';
import type { OrderQueueSearch } from '@/app/search-params';
import { Icon } from '@/shared/components/Icon';
import { IdChip } from '@/shared/components/Marks';
import { SearchInput } from '@/shared/components/SearchInput';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { SegmentedTabs } from '@/shared/components/SegmentedTabs';
import { StatusPill } from '@/shared/components/StatusPill';
import { StockOverrideDialog, type StockShortageDetails } from '@/shared/components/StockOverrideDialog';
import { apiError } from '@/shared/api/errors';
import { useBranchContext } from '@/shared/hooks/useBranchContext';
import { usePermission } from '@/shared/hooks/usePermission';
import { useCanTransact } from '@/shared/hooks/useCanTransact';
import { formatDateTime, formatRs } from '@/shared/lib/format';
import type { OrderDetailDto } from '@/modules/orders/hooks/useOrders';
import { CancelDialog, CollectPaymentModal, ReleaseDialog, type OrderRef } from '@/modules/roofing/components/OrderDialogs';
import { OrderDetailModal } from '@/modules/roofing/components/OrderDetailModal';
import { useRoofingAction, useRoofingQueue, type RoofingQueueRow } from '@/modules/roofing/hooks/useRoofing';

const ACTIVE: RoofingDisplayStatus[] = ['PLACED', 'IN_PROGRESS', 'READY'];

/** Everything an action needs, from a queue row or the open detail. */
interface Target extends OrderRef {
  display_status: RoofingDisplayStatus;
}

const fromRow = (r: RoofingQueueRow): Target => ({ ...r });
const fromDetail = (o: OrderDetailDto): Target => ({
  order_id: o.order_id,
  order_number: o.order_number,
  customer_name: o.customer?.name ?? null,
  total: o.total,
  paid_amount: o.paid_amount,
  balance: o.balance,
  version: o.version,
  has_customer_material: !!o.gate_pass,
  display_status: o.display_status as RoofingDisplayStatus,
});

/**
 * Order Queue (prototype). Cashier places and collects payment → Supervisor/Chief
 * start and complete → Supervisor releases a fully paid order to the customer.
 * Buttons follow the user's permissions; the server enforces the same rules.
 */
export function OrderQueuePage() {
  const navigate = useNavigate();
  const { notice } = useSearch({ strict: false }) as OrderQueueSearch;
  const { can } = usePermission();
  const { settings } = useBranchContext();
  const policy = settings?.orders ?? DEFAULT_BRANCH_SETTINGS.orders;

  // Head office views the queue but never acts on it (Docs/decisions/0002)
  const canTransact = useCanTransact();
  const canCollect = canTransact && can('process', 'payment');
  const canEdit = canTransact && can('edit', 'order') && policy.allow_cashier_edit_before_start;
  const canCancel = canTransact && can('cancel', 'order');
  const canWork = canTransact && can('update', 'order_status');
  const canRelease = canTransact && can('release', 'order');

  const [tab, setTab] = useState<RoofingQueueTab>('ACTIVE');
  const [search, setSearch] = useState('');
  const [placedOn, setPlacedOn] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: 'pay' | 'release' | 'cancel'; order: Target } | null>(null);
  const [override, setOverride] = useState<{ order: Target; details: StockShortageDetails; error: string | null } | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(notice ? { type: 'success', message: notice } : null);

  // One request once typing pauses, not one per key
  const searchQuery = useDebouncedValue(search.trim());
  const { data, isLoading, isFetching, refetch } = useRoofingQueue({ tab, search: searchQuery || undefined, placed_on: placedOn || undefined });
  const rows = data?.rows ?? [];
  const c = data?.counts;
  const action = useRoofingAction();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (type: 'success' | 'error', message: string) => setToast({ type, message });

  const run = async (o: Target, kind: 'start' | 'complete', overrideBody?: { password: string; reason: string }) => {
    try {
      if (kind === 'start') await action.mutateAsync({ orderId: o.order_id, action: 'start', version: o.version, override: overrideBody });
      else await action.mutateAsync({ orderId: o.order_id, action: 'complete', version: o.version });
      setOverride(null);
      showToast('success', kind === 'start' ? `Order ${o.order_number} started.` : `Order ${o.order_number} is ready for release.`);
    } catch (e) {
      const info = apiError(e);
      if (info.code === 'STK_001') return setOverride({ order: o, details: info.details as StockShortageDetails, error: null });
      if (override) return setOverride({ ...override, error: info.message });
      showToast('error', info.message);
    }
  };

  const done = (msg: string) => {
    setDialog(null);
    showToast('success', msg);
  };

  const renderActions = (o: Target, compact = false): ReactNode => {
    const btn = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50';
    const active = ACTIVE.includes(o.display_status);
    const items: ReactNode[] = [];
    if (canCollect && active && o.balance > 0) {
      items.push(
        <button key="pay" onClick={() => setDialog({ kind: 'pay', order: o })} className={`${btn} bg-[#0033A0] text-white hover:bg-blue-800`}>
          <Icon name="wallet" className="h-3.5 w-3.5" /> Collect {compact ? '' : formatRs(o.balance)}
        </button>,
      );
    }
    if (canEdit && o.display_status === 'PLACED') {
      items.push(
        <button
          key="edit"
          onClick={() => void navigate({ to: '/orders/$orderId/edit', params: { orderId: o.order_id } })}
          className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50`}
          title="Edit order"
        >
          <Icon name="edit" className="h-3.5 w-3.5" />
          {!compact && ' Edit'}
        </button>,
      );
    }
    if (canCancel && o.display_status === 'PLACED') {
      items.push(
        <button key="cancel" onClick={() => setDialog({ kind: 'cancel', order: o })} className={`${btn} border border-red-200 text-red-600 hover:bg-red-50`} title="Cancel order">
          <Icon name="ban" className="h-3.5 w-3.5" />
          {!compact && ' Cancel'}
        </button>,
      );
    }
    if (canWork && o.display_status === 'PLACED') {
      items.push(
        <button key="start" disabled={action.isPending} onClick={() => void run(o, 'start')} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
          <Icon name="playCircle" className="h-3.5 w-3.5" /> Start
        </button>,
      );
    }
    if (canWork && o.display_status === 'IN_PROGRESS') {
      items.push(
        <button key="complete" disabled={action.isPending} onClick={() => void run(o, 'complete')} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
          <Icon name="checkCircle" className="h-3.5 w-3.5" /> Complete
        </button>,
      );
    }
    if (canRelease && o.display_status === 'READY') {
      items.push(
        o.balance > 0 ? (
          <span key="release" className={`${btn} cursor-not-allowed bg-slate-100 text-slate-400`} title={`${formatRs(o.balance)} balance - collect it at the cashier first`}>
            <Icon name="lock" className="h-3.5 w-3.5" /> Release
          </span>
        ) : (
          <button key="release" onClick={() => setDialog({ kind: 'release', order: o })} className={`${btn} bg-teal-600 text-white hover:bg-teal-700`}>
            <Icon name="packageCheck" className="h-3.5 w-3.5" /> Release
          </button>
        ),
      );
    }
    if (items.length === 0) {
      return (
        <button onClick={() => setSelectedId(o.order_id)} className="text-xs font-semibold text-slate-500 hover:text-[#0033A0]">
          View
        </button>
      );
    }
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
        {items}
      </div>
    );
  };

  const kpis: { label: string; value: ReactNode; tone: string; tab: RoofingQueueTab; sub?: string }[] = [
    { label: 'Placed', value: c?.placed ?? '–', tone: c?.placed ? 'text-amber-600' : 'text-slate-900', tab: 'PLACED' },
    { label: 'In Progress', value: c?.in_progress ?? '–', tone: c?.in_progress ? 'text-blue-600' : 'text-slate-900', tab: 'IN_PROGRESS' },
    { label: 'Ready', value: c?.ready ?? '–', tone: c?.ready ? 'text-emerald-600' : 'text-slate-900', tab: 'READY', sub: c?.ready_unpaid ? `${c.ready_unpaid} unpaid` : undefined },
    { label: 'Released today', value: c?.released_today ?? '–', tone: 'text-teal-700', tab: 'RELEASED' },
    { label: 'Balance due', value: formatRs(c?.balance_due ?? 0), tone: c?.balance_due ? 'text-red-600' : 'text-slate-900', tab: 'ACTIVE' },
  ];

  return (
    <div className="-m-8 flex min-h-[calc(100vh-4rem)] flex-col bg-slate-50 text-slate-900 antialiased">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Order Queue</h1>
              <button
                type="button"
                onClick={() => void refetch()}
                title="Refresh"
                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <Icon name="refresh" className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              {canCollect
                ? 'Collect balances, edit or cancel orders that have not started.'
                : canRelease
                  ? 'Start and complete orders, then release paid orders to the customer.'
                  : canWork
                    ? 'Start and complete orders on the floor.'
                    : 'All roofing orders for this branch.'}
            </p>
          </div>
          <div className="flex items-center overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1.5">
            {kpis.map((k, i) => (
              <button
                key={k.label}
                type="button"
                onClick={() => setTab(k.tab)}
                className={`flex min-w-[96px] flex-col items-center rounded-lg px-4 py-1.5 transition-colors hover:bg-slate-100/60 sm:px-5 ${i < kpis.length - 1 ? 'rounded-none border-r border-slate-200' : ''}`}
              >
                <span className="mb-1 whitespace-nowrap text-[10px] font-semibold uppercase leading-none tracking-wider text-slate-500">{k.label}</span>
                <span className={`whitespace-nowrap text-lg font-bold tabular-nums leading-none ${k.tone}`}>{k.value}</span>
                {k.sub && <span className="mt-0.5 text-[10px] font-semibold text-red-500">{k.sub}</span>}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-8">
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-5">
            <SearchInput value={search} onChange={setSearch} placeholder="Search order number, customer name or phone..." />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="max-w-full overflow-x-auto">
                <SegmentedTabs
                  value={tab}
                  onChange={setTab}
                  tabs={[
                    { key: 'ACTIVE', label: 'Active', count: c?.active },
                    { key: 'PLACED', label: 'Placed', count: c?.placed },
                    { key: 'IN_PROGRESS', label: 'In Progress', count: c?.in_progress },
                    { key: 'READY', label: 'Ready', count: c?.ready },
                    { key: 'RELEASED', label: 'Released', count: c?.released },
                    { key: 'CANCELLED', label: 'Cancelled', count: c?.cancelled },
                    { key: 'ALL', label: 'All', count: c?.all },
                  ]}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Placed on:</span>
                <input
                  type="date"
                  value={placedOn}
                  onChange={(e) => setPlacedOn(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {placedOn && (
                  <button onClick={() => setPlacedOn('')} className="px-1 text-xs font-semibold text-slate-400 hover:text-slate-700">
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-1 items-center justify-center py-16 text-sm text-slate-400">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-16 text-center text-slate-500">
              <Icon name="clock" className="mb-2 h-8 w-8 text-slate-300" />
              <p className="text-sm font-semibold">No orders here.</p>
              <p className="mt-1 text-xs">Orders placed from Create Order appear here.</p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-3">Order</th>
                      <th className="px-5 py-3">Customer</th>
                      <th className="px-5 py-3">Items</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Payment</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((o) => (
                      <tr key={o.order_id} onClick={() => setSelectedId(o.order_id)} className="cursor-pointer align-top hover:bg-slate-50/80">
                        <td className="px-5 py-3.5">
                          <IdChip>#{o.order_number}</IdChip>
                          <p className="mt-1 text-[11px] text-slate-500">{formatDateTime(o.created_at)}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-slate-900">{o.customer_name || '—'}</p>
                          <p className="font-mono text-xs text-slate-500">{o.customer_phone}</p>
                        </td>
                        <td className="px-5 py-3.5 text-slate-700">
                          {o.item_count} item{o.item_count !== 1 && 's'}
                          {o.running_ft > 0 && <span className="text-slate-400"> · {o.running_ft.toLocaleString()} ft</span>}
                          {o.has_customer_material && <p className="mt-0.5 text-[11px] font-semibold text-violet-700">Customer material</p>}
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusPill label={o.display_label} />
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <p className="font-bold tabular-nums text-slate-900">{formatRs(o.total)}</p>
                          <PaymentNote row={o} />
                        </td>
                        <td className="px-5 py-3.5 text-right">{renderActions(fromRow(o))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-slate-100 md:hidden">
                {rows.map((o) => (
                  <div key={o.order_id} onClick={() => setSelectedId(o.order_id)} className="cursor-pointer space-y-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <IdChip>#{o.order_number}</IdChip>
                      <StatusPill label={o.display_label} />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-semibold text-slate-900">{o.customer_name || '—'}</span>
                      <span className="font-bold tabular-nums">{formatRs(o.total)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>
                        {o.item_count} item{o.item_count !== 1 && 's'} · {formatDateTime(o.created_at)}
                      </span>
                      <PaymentNote row={o} />
                    </div>
                    <div className="pt-1">{renderActions(fromRow(o), true)}</div>
                  </div>
                ))}
              </div>
              {data?.has_more && (
                <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Showing the latest {rows.length} orders. Search or pick a date to find older ones.</p>
              )}
            </>
          )}
        </div>
      </main>

      {selectedId && <OrderDetailModal orderId={selectedId} onClose={() => setSelectedId(null)} actions={(o) => renderActions(fromDetail(o))} />}

      {dialog?.kind === 'pay' && <CollectPaymentModal order={dialog.order} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'release' && <ReleaseDialog order={dialog.order} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'cancel' && <CancelDialog order={dialog.order} onClose={() => setDialog(null)} onDone={done} />}

      {override && (
        <StockOverrideDialog
          details={override.details}
          pending={action.isPending}
          error={override.error}
          onClose={() => setOverride(null)}
          onConfirm={(body) => void run(override.order, 'start', body)}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}
        >
          <Icon name={toast.type === 'success' ? 'check' : 'alertCircle'} className="h-4 w-4" />
          {toast.message}
        </div>
      )}
    </div>
  );
}

function PaymentNote({ row }: { row: RoofingQueueRow }) {
  if (row.display_status === 'CANCELLED') {
    return <p className="text-[11px] text-slate-400">{row.paid_amount ? `${formatRs(row.paid_amount)} paid` : 'No payment'}</p>;
  }
  if (row.balance > 0) return <p className="text-[11px] font-semibold tabular-nums text-red-600">{formatRs(row.balance)} due</p>;
  return <p className="text-[11px] font-semibold text-emerald-600">Fully paid</p>;
}
