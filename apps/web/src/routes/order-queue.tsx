import { useState, type ReactNode } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { DEFAULT_BRANCH_SETTINGS, PAYMENT_STATE_LABEL, type RoofingDisplayStatus } from '@erp/shared';
import type { OrderQueueSearch } from '@/app/search-params';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { Icon } from '@/shared/components/Icon';
import { Notice } from '@/shared/components/Notice';
import { SearchInput } from '@/shared/components/SearchInput';
import { BoardSection, StatusCards, type StatusStep } from '@/shared/components/StatusBoard';
import { StockOverrideDialog, type StockShortageDetails } from '@/shared/components/StockOverrideDialog';
import { apiError } from '@/shared/api/errors';
import { useBranchContext } from '@/shared/hooks/useBranchContext';
import { useCanTransact } from '@/shared/hooks/useCanTransact';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { usePermission } from '@/shared/hooks/usePermission';
import { formatDateTime, formatRs } from '@/shared/lib/format';
import { TONES } from '@/shared/lib/status-tones';
import type { OrderDetailDto } from '@/modules/orders/hooks/useOrders';
import { OrderHistoryModal } from '@/modules/orders/components/OrderHistoryModal';
import { HandOverCheckout } from '@/modules/job-cards/components/HandOverCheckout';
import { CancelDialog, type OrderRef } from '@/modules/roofing/components/OrderDialogs';
import { OrderDetailModal } from '@/modules/roofing/components/OrderDetailModal';
import { useRoofingAction, useRoofingQueue, type RoofingQueueRow } from '@/modules/roofing/hooks/useRoofing';

const PAYMENT_PILL: Record<string, string> = {
  UNPAID: 'bg-red-50 text-red-700',
  FULLY_PAID: 'bg-green-50 text-green-700',
  ADVANCE_PAID: 'bg-blue-50 text-blue-700',
};

// READY splits on the balance, as a finished job card does: Finished while money is owed, then Ready for Release
type StepKey = 'PLACED' | 'IN_PROGRESS' | 'FINISHED' | 'READY_FOR_RELEASE';

// The roofing lifecycle on the floor, in order, the same cards as the Workshop Queue (Docs/decisions/0005)
const STEPS: StatusStep<StepKey>[] = [
  {
    key: 'PLACED',
    title: 'In Queue',
    icon: 'clock',
    empty: 'No orders waiting.',
    tone: TONES.amber,
  },
  {
    key: 'IN_PROGRESS',
    title: 'Ongoing',
    icon: 'wrench',
    empty: 'Nothing ongoing.',
    tone: TONES.blue,
  },
  {
    key: 'FINISHED',
    title: 'Finished',
    icon: 'checkCircle',
    empty: 'No finished orders waiting for payment.',
    tone: TONES.slate,
  },
  {
    key: 'READY_FOR_RELEASE',
    title: 'Ready for Release',
    icon: 'packageCheck',
    empty: 'No orders ready for release.',
    tone: TONES.emerald,
  },
];

const stepOf = (o: { display_status: RoofingDisplayStatus; balance: number }): StepKey | null =>
  o.display_status === 'PLACED' || o.display_status === 'IN_PROGRESS'
    ? o.display_status
    : o.display_status === 'READY'
      ? o.balance > 0
        ? 'FINISHED'
        : 'READY_FOR_RELEASE'
      : null;

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
  has_customer_material: o.customer_materials.length > 0,
  display_status: o.display_status as RoofingDisplayStatus,
});

/**
 * Order Queue (Docs/decisions/0005): the roofing statuses as cards, In Queue → Ongoing →
 * Finished → Ready for Release, the same as the Workshop Queue. Picking a card shows only
 * its orders, full width, each with the button that moves it on. Unpaid orders stay at the
 * cashier; finished orders wait under Finished until the cashier has the full amount (Cashier
 * Queue → Roofing – Balance Due), then under Ready for Release, where Check & Release
 * (?release=<order>) opens in place of the board: the supervisor ticks off each item and
 * releases the order. One board for every role: the buttons follow the user's permissions
 * and the server enforces the same rules. Released and cancelled orders are in History.
 */
export function OrderQueuePage() {
  const navigate = useNavigate();
  const { notice, release } = useSearch({ strict: false }) as OrderQueueSearch;
  const { can } = usePermission();
  const { settings } = useBranchContext();
  const policy = settings?.orders ?? DEFAULT_BRANCH_SETTINGS.orders;

  // Head office views the queue but never acts on it (Docs/decisions/0002)
  const canTransact = useCanTransact();
  const canEdit = canTransact && can('edit', 'order') && policy.allow_cashier_edit_before_start;
  const canCancel = canTransact && can('cancel', 'order');
  const canWork = canTransact && can('update', 'order_status');
  const canRelease = canTransact && can('release', 'order');

  const [step, setStep] = useState<StepKey>('PLACED');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{
    kind: 'cancel';
    order: Target;
  } | null>(null);
  const [moving, setMoving] = useState<{
    order: Target;
    to: 'start' | 'complete';
  } | null>(null);
  const [override, setOverride] = useState<{
    order: Target;
    details: StockShortageDetails;
    error: string | null;
  } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyOrderId, setHistoryOrderId] = useState<string | null>(null);

  // One request once typing pauses, not one per key; ACTIVE is every In Queue, Ongoing and Ready order
  const searchQuery = useDebouncedValue(search.trim());
  const { data, isLoading, isFetching, refetch } = useRoofingQueue({
    tab: 'ACTIVE',
    search: searchQuery || undefined,
  });
  const rows = data?.rows ?? [];
  const current = STEPS.find((s) => s.key === step)!;
  const list = rows.filter((r) => stepOf(r) === step);
  const action = useRoofingAction();
  const releaseRow = release ? rows.find((r) => r.order_id === release && stepOf(r) === 'READY_FOR_RELEASE') : undefined;
  const openRelease = (orderId: string) => {
    setSelectedId(null);
    void navigate({ to: '/order-queue', search: { release: orderId } });
  };
  const closeRelease = () => void navigate({ to: '/order-queue', search: {} });

  const finish = (msg: string) => {
    setDialog(null);
    setMoving(null);
    setOverride(null);
    setSelectedId(null);
    setError(null);
    setDone(msg);
  };

  const run = async (o: Target, to: 'start' | 'complete', overrideBody?: { password: string; reason: string }) => {
    try {
      if (to === 'start')
        await action.mutateAsync({
          orderId: o.order_id,
          action: 'start',
          version: o.version,
          override: overrideBody,
        });
      else
        await action.mutateAsync({
          orderId: o.order_id,
          action: 'complete',
          version: o.version,
        });
      finish(to === 'start' ? `Order ${o.order_number} started.` : `Order ${o.order_number} is finished.`);
    } catch (e) {
      const info = apiError(e);
      setMoving(null);
      // Not enough coil to start: authorise a stock override (Docs/decisions/0003)
      if (info.code === 'STK_001')
        return setOverride({
          order: o,
          details: info.details as StockShortageDetails,
          error: null,
        });
      if (override) return setOverride({ ...override, error: info.message });
      setDone(null);
      setError(info.message);
    }
  };

  const btn = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50';

  /** Edit / Cancel and the one button that moves the order on, for this user. */
  const actionsFor = (o: Target): ReactNode => {
    const items: ReactNode[] = [];
    if (o.display_status === 'PLACED') {
      if (canEdit) {
        items.push(
          <button
            key="edit"
            onClick={() =>
              void navigate({
                to: '/orders/$orderId/edit',
                params: { orderId: o.order_id },
              })
            }
            className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50`}
          >
            <Icon name="edit" className="h-3.5 w-3.5" /> Edit
          </button>,
        );
      }
      if (canCancel) {
        items.push(
          <button key="cancel" onClick={() => setDialog({ kind: 'cancel', order: o })} className={`${btn} border border-red-200 text-red-600 hover:bg-red-50`}>
            <Icon name="ban" className="h-3.5 w-3.5" /> Cancel
          </button>,
        );
      }
      if (canWork) {
        items.push(
          <button key="start" onClick={() => setMoving({ order: o, to: 'start' })} className="btn-primary whitespace-nowrap">
            <Icon name="play" className="h-4 w-4" /> Start Job
          </button>,
        );
      }
    }
    if (o.display_status === 'IN_PROGRESS' && canWork) {
      items.push(
        <button
          key="complete"
          onClick={() => setMoving({ order: o, to: 'complete' })}
          className="btn-primary whitespace-nowrap bg-emerald-600 hover:bg-emerald-700"
        >
          <Icon name="checkCircle" className="h-4 w-4" /> Mark Finished
        </button>,
      );
    }
    // The cashier collects the balance on the Cashier Queue; the board only shows it is owed
    if (o.display_status === 'READY' && o.balance > 0) {
      items.push(
        <span key="waiting" className="whitespace-nowrap text-xs font-semibold text-slate-500">
          Waiting for cashier · {formatRs(o.balance)} due
        </span>,
      );
    } else if (o.display_status === 'READY') {
      items.push(
        canRelease ? (
          <button key="release" onClick={() => openRelease(o.order_id)} className="btn-primary whitespace-nowrap bg-emerald-600 hover:bg-emerald-700">
            <Icon name="packageCheck" className="h-4 w-4" /> Check & Release
          </button>
        ) : (
          <span key="waiting" className="whitespace-nowrap text-xs font-semibold text-slate-500">
            Waiting for supervisor to release
          </span>
        ),
      );
    }
    if (items.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
        {items}
      </div>
    );
  };

  const emptyText = search.trim() ? `No ${current.title.toLowerCase()} orders match “${search.trim()}”.` : current.empty;

  return (
    <div className="-m-8 flex min-h-[calc(100vh-4rem)] flex-col bg-slate-50 text-slate-900">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
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
          {!release && (
            <div className="flex w-full items-center gap-2 lg:max-w-xl">
              <div className="min-w-0 flex-1">
                <SearchInput value={search} onChange={setSearch} placeholder="Search order number, customer name or phone..." />
              </div>
              {/* Released and cancelled orders leave the board (Docs/decisions/0005) */}
              <button type="button" onClick={() => setHistoryOpen(true)} className="btn-secondary inline-flex shrink-0 items-center gap-1.5">
                <Icon name="clock" className="h-4 w-4" />
                History
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-8">
        {notice && !done && <Notice tone="success">{notice}</Notice>}
        {done && <Notice tone="success">{done}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}

        {release ? (
          releaseRow ? (
            <HandOverCheckout
              key={releaseRow.order_id}
              roofing
              row={releaseRow}
              onBack={closeRelease}
              onClosed={(msg) => {
                finish(msg);
                closeRelease();
              }}
            />
          ) : isLoading ? (
            <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
          ) : (
            <Notice tone="warning">
              This order is no longer ready for release.{' '}
              <button onClick={closeRelease} className="font-semibold underline">
                Back to queue
              </button>
            </Notice>
          )
        ) : (
          <>
            {/* One card per status, in lifecycle order; the picked one shows its list below */}
            <StatusCards
              steps={STEPS}
              value={step}
              onChange={setStep}
              loading={isLoading}
              counts={Object.fromEntries(STEPS.map((s) => [s.key, rows.filter((r) => stepOf(r) === s.key).length]))}
            />

            <BoardSection title={current.title} count={list.length}>
              {/* Table from md up; stacked cards on phones */}
              <div className="hidden flex-1 overflow-x-auto md:block">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-6 py-3 text-left">Order</th>
                      <th className="px-6 py-3 text-left">Placed</th>
                      <th className="px-6 py-3 text-left">Items</th>
                      <th className="px-6 py-3 text-left">Payment</th>
                      <th className="px-6 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {(isLoading || list.length === 0) && (
                      <tr>
                        <td colSpan={5} className="px-6 py-16 text-center text-slate-400">
                          {isLoading ? 'Loading…' : emptyText}
                        </td>
                      </tr>
                    )}
                    {list.map((o) => (
                      <tr key={o.order_id} onClick={() => setSelectedId(o.order_id)} className="cursor-pointer transition-colors hover:bg-slate-50/70">
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="font-bold text-slate-900">{o.order_number}</div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {o.customer_name || '—'} ({o.customer_phone})
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-slate-700">
                          {formatDateTime(o.created_at)}
                          {o.technician && <div className="mt-0.5 text-xs text-slate-400">Worker: {o.technician}</div>}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          <Items row={o} />
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <Payment row={o} />
                        </td>
                        <td className="px-6 py-4">{actionsFor(fromRow(o))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-slate-100 md:hidden">
                {(isLoading || list.length === 0) && <p className="px-4 py-12 text-center text-sm text-slate-400">{isLoading ? 'Loading…' : emptyText}</p>}
                {list.map((o) => (
                  <div key={o.order_id} onClick={() => setSelectedId(o.order_id)} className="cursor-pointer space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900">{o.order_number}</div>
                        <div className="truncate text-xs text-slate-500">
                          {o.customer_name || '—'} ({o.customer_phone})
                        </div>
                      </div>
                      <Payment row={o} />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <Items row={o} />
                      <span>{formatDateTime(o.created_at)}</span>
                    </div>
                    <div className="pt-1">{actionsFor(fromRow(o))}</div>
                  </div>
                ))}
              </div>
            </BoardSection>
          </>
        )}
      </main>

      {selectedId && <OrderDetailModal orderId={selectedId} onClose={() => setSelectedId(null)} actions={(o) => actionsFor(fromDetail(o))} />}

      {historyOpen && (
        <OrderHistoryModal type="roofing-orders" hidden={!!historyOrderId} onClose={() => setHistoryOpen(false)} onOpenOrder={setHistoryOrderId} />
      )}
      {historyOrderId && <OrderDetailModal orderId={historyOrderId} onClose={() => setHistoryOrderId(null)} actions={() => null} />}

      {dialog?.kind === 'cancel' && <CancelDialog order={dialog.order} onClose={() => setDialog(null)} onDone={finish} />}

      <ConfirmDialog
        open={!!moving}
        title={moving?.to === 'start' ? `Start ${moving.order.order_number}?` : `Mark ${moving?.order.order_number ?? ''} finished?`}
        message={
          moving?.to === 'start'
            ? 'The order moves to Ongoing and its coil is taken from stock now.'
            : 'The order moves to Finished. It is ready for release once the cashier has the full amount.'
        }
        confirmLabel={moving?.to === 'start' ? 'Start Job' : 'Mark Finished'}
        isLoading={action.isPending}
        onConfirm={() => moving && void run(moving.order, moving.to)}
        onCancel={() => setMoving(null)}
      />

      {override && (
        <StockOverrideDialog
          details={override.details}
          pending={action.isPending}
          error={override.error}
          onClose={() => setOverride(null)}
          onConfirm={(body) => void run(override.order, 'start', body)}
        />
      )}
    </div>
  );
}

function Items({ row }: { row: RoofingQueueRow }) {
  return (
    <span>
      {row.item_count} item{row.item_count !== 1 && 's'}
      {row.running_ft > 0 && <span className="text-slate-400"> · {row.running_ft.toLocaleString()} ft</span>}
      {row.has_customer_material && <span className="mt-0.5 block text-[11px] font-semibold text-violet-700">Customer material</span>}
    </span>
  );
}

function Payment({ row }: { row: RoofingQueueRow }) {
  return (
    <div className="text-right md:text-left">
      <span className={`rounded px-2 py-0.5 text-xs font-medium ${PAYMENT_PILL[row.payment_state]}`}>
        {PAYMENT_STATE_LABEL[row.payment_state]} {row.paid_amount > 0 ? `(${formatRs(row.paid_amount)})` : ''}
      </span>
      <div className="mt-1 text-xs tabular-nums text-slate-500">
        Total {formatRs(row.total)}
        {row.balance > 0 && <span className="font-semibold text-red-600"> · {formatRs(row.balance)} due</span>}
      </div>
    </div>
  );
}
