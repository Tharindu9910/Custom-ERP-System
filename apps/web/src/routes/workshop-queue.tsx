import { useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { PAYMENT_STATE_LABEL, type WorkshopDisplayStatus } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { Notice } from '@/shared/components/Notice';
import { SearchInput } from '@/shared/components/SearchInput';
import { BoardSection, StatusCards, type StatusStep } from '@/shared/components/StatusBoard';
import { TONES } from '@/shared/lib/status-tones';
import { formatDateTime, formatLocalDate, formatRs } from '@/shared/lib/format';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { HandOverCheckout } from '@/modules/job-cards/components/HandOverCheckout';
import { CompleteJobDialog, StartJobDialog } from '@/modules/job-cards/components/JobCardMoveDialogs';
import { WorkOrderModal } from '@/modules/job-cards/components/WorkOrderModal';
import { OrderHistoryModal } from '@/modules/orders/components/OrderHistoryModal';
import { useWorkshopQueue, type WorkshopQueueRow } from '@/modules/orders/hooks/useOrders';
import { useCanTransact } from '@/shared/hooks/useCanTransact';
import { usePermission } from '@/shared/hooks/usePermission';

const PAYMENT_PILL: Record<string, string> = {
  UNPAID: 'bg-red-50 text-red-700',
  FULLY_PAID: 'bg-green-50 text-green-700',
  ADVANCE_PAID: 'bg-blue-50 text-blue-700',
};

type StepKey = Extract<WorkshopDisplayStatus, 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'READY_FOR_COLLECTION'>;

// The supervisor's area of the lifecycle, in order (Docs/decisions/0005)
const STEPS: StatusStep<StepKey>[] = [
  {
    key: 'PENDING',
    title: 'In Workshop Queue',
    icon: 'clock',
    empty: 'No job cards waiting.',
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
    key: 'COMPLETED',
    title: 'Finished',
    icon: 'checkCircle',
    empty: 'No finished job cards waiting for payment.',
    tone: TONES.slate,
  },
  {
    key: 'READY_FOR_COLLECTION',
    title: 'Ready for Collection',
    icon: 'packageCheck',
    empty: 'Nothing ready for collection.',
    tone: TONES.emerald,
  },
];

/**
 * Workshop Queue (Docs/decisions/0005): the supervisor's statuses as cards, In Queue →
 * Ongoing → Finished → Ready for Collection. Picking a card shows only its job cards,
 * full width, each with the button that moves it on. Unpaid drafts stay at the cashier;
 * finished cards wait under Finished until the cashier has the full amount, then under
 * Ready for Collection, where Check & Hand Over (?handover=<order>) opens in place of the
 * board: the supervisor ticks off each item and closes the card.
 */
export function WorkshopQueuePage() {
  const navigate = useNavigate();
  const canTransact = useCanTransact();
  const { can } = usePermission();
  const canStart = canTransact && can('update', 'job_card_status');
  const canComplete = canTransact && can('complete', 'work_order');
  const canEdit = canTransact && can('create', 'job_card');
  const canHandOver = canTransact && can('close', 'job_card');
  const { notice, handover } = useSearch({ strict: false }) as { notice?: string; handover?: string };
  const [step, setStep] = useState<StepKey>('PENDING');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ orderId: string; to: 'start' | 'complete' } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyOrderId, setHistoryOrderId] = useState<string | null>(null);
  // One request once typing pauses, not one per key
  const searchQuery = useDebouncedValue(search.trim());
  const { data, isLoading, isFetching, refetch } = useWorkshopQueue({ search: searchQuery || undefined });
  const rows = data?.rows ?? [];
  const current = STEPS.find((s) => s.key === step)!;
  const list = rows.filter((r) => r.display_status === step);
  const handOverRow = handover ? rows.find((r) => r.order_id === handover && r.display_status === 'READY_FOR_COLLECTION') : undefined;
  const openHandOver = (orderId: string) => void navigate({ to: '/workshop-queue', search: { handover: orderId } });
  const closeHandOver = () => void navigate({ to: '/workshop-queue', search: {} });

  const edit = (orderId: string) => void navigate({ to: '/job-cards/$orderId/edit', params: { orderId } });
  const finish = (msg: string) => {
    setMoving(null);
    setDone(msg);
  };

  const actionFor = (job: WorkshopQueueRow) => {
    if (job.display_status === 'PENDING' && canStart) {
      return (
        <button onClick={() => setMoving({ orderId: job.order_id, to: 'start' })} className="btn-primary whitespace-nowrap">
          <Icon name="play" className="h-4 w-4" /> Start Job
        </button>
      );
    }
    if (job.display_status === 'IN_PROGRESS' && canComplete) {
      const waiting = job.line_count - job.started_count;
      return (
        <button
          onClick={() => setMoving({ orderId: job.order_id, to: 'complete' })}
          disabled={waiting > 0}
          title={waiting > 0 ? `${waiting} sub-job(s) not started yet — open the card to start them` : undefined}
          className="btn-primary whitespace-nowrap bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
        >
          <Icon name="checkCircle" className="h-4 w-4" /> Mark Finished
        </button>
      );
    }
    if (job.display_status === 'COMPLETED') {
      return <span className="whitespace-nowrap text-xs font-semibold text-slate-500">Waiting for cashier · {formatRs(job.balance)} due</span>;
    }
    if (job.display_status === 'READY_FOR_COLLECTION') {
      return canHandOver ? (
        <button onClick={() => openHandOver(job.order_id)} className="btn-primary whitespace-nowrap bg-emerald-600 hover:bg-emerald-700">
          <Icon name="packageCheck" className="h-4 w-4" /> Check & Hand Over
        </button>
      ) : (
        <span className="whitespace-nowrap text-xs font-semibold text-slate-500">Waiting for supervisor to hand over</span>
      );
    }
    return null;
  };

  return (
    <div className="-m-8 flex min-h-[calc(100vh-4rem)] flex-col bg-slate-50 text-slate-900">
      <header className="shrink-0 border-b border-slate-200 bg-white px-8 py-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Workshop Queue</h1>
            <button
              type="button"
              onClick={() => void refetch()}
              title="Refresh"
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <Icon name="refresh" className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {!handover && (
            <div className="flex w-full items-center gap-2 lg:max-w-xl">
              <div className="min-w-0 flex-1">
                <SearchInput value={search} onChange={setSearch} placeholder="Search work order, customer name, or phone..." />
              </div>
              {/* Closed and voided job cards leave the board (Docs/decisions/0005) */}
              <button type="button" onClick={() => setHistoryOpen(true)} className="btn-secondary inline-flex shrink-0 items-center gap-1.5">
                <Icon name="clock" className="h-4 w-4" />
                History
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 p-8">
        {notice && <Notice tone="success">{notice}</Notice>}
        {done && <Notice tone="success">{done}</Notice>}

        {handover ? (
          handOverRow ? (
            <HandOverCheckout
              key={handOverRow.order_id}
              row={handOverRow}
              onBack={closeHandOver}
              onClosed={(msg) => {
                setDone(msg);
                closeHandOver();
              }}
            />
          ) : isLoading ? (
            <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
          ) : (
            <Notice tone="warning">
              This job card is no longer ready for collection.{' '}
              <button onClick={closeHandOver} className="font-semibold underline">
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
              counts={Object.fromEntries(STEPS.map((s) => [s.key, rows.filter((r) => r.display_status === s.key).length]))}
            />

            <BoardSection title={current.title} count={list.length}>
              <div className="flex-1 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-6 py-3 text-left">Job Card</th>
                      <th className="px-6 py-3 text-left">Date</th>
                      <th className="px-6 py-3 text-left">Sub-jobs</th>
                      <th className="px-6 py-3 text-left">Payment</th>
                      <th className="px-6 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {isLoading && (
                      <tr>
                        <td colSpan={5} className="px-6 py-16 text-center text-slate-400">
                          Loading…
                        </td>
                      </tr>
                    )}
                    {!isLoading && list.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-16 text-center text-slate-400">
                          {search.trim() ? `No ${current.title.toLowerCase()} job cards match “${search.trim()}”.` : current.empty}
                        </td>
                      </tr>
                    )}
                    {list.map((job) => (
                      <tr key={job.order_id} onClick={() => setSelected(job.order_id)} className="cursor-pointer transition-colors hover:bg-slate-50/70">
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="font-bold text-slate-900">{job.order_number}</div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {job.customer_name} ({job.customer_phone})
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-slate-700">
                          {formatLocalDate(job.job_date)}
                          <div className="mt-0.5 text-xs text-slate-400">Created {formatDateTime(job.created_at)}</div>
                        </td>
                        <td className="min-w-[10rem] px-6 py-4">
                          <Progress done={job.completed_count} started={job.started_count} total={job.line_count} />
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${PAYMENT_PILL[job.payment_state]}`}>
                            {PAYMENT_STATE_LABEL[job.payment_state]} {job.paid_amount > 0 ? `(${formatRs(job.paid_amount)})` : ''}
                          </span>
                        </td>
                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            {canEdit && job.can_edit && (
                              <button
                                onClick={() => edit(job.order_id)}
                                className="rounded bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800"
                              >
                                Edit
                              </button>
                            )}
                            {actionFor(job)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </BoardSection>
          </>
        )}
      </main>

      {selected && <WorkOrderModal orderId={selected} onClose={() => setSelected(null)} onEdit={() => edit(selected)} onMoved={finish} />}
      {moving?.to === 'start' && <StartJobDialog orderId={moving.orderId} onClose={() => setMoving(null)} onDone={finish} />}
      {moving?.to === 'complete' && <CompleteJobDialog orderId={moving.orderId} onClose={() => setMoving(null)} onDone={finish} />}
      {historyOpen && (
        <OrderHistoryModal types={['job-cards']} hidden={!!historyOrderId} onClose={() => setHistoryOpen(false)} onOpenOrder={setHistoryOrderId} />
      )}
      {historyOrderId && <WorkOrderModal readOnly orderId={historyOrderId} onClose={() => setHistoryOrderId(null)} />}
    </div>
  );
}

function Progress({ done, started, total }: { done: number; started: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {done} / {total} done{started > done ? ` · ${started - done} in progress` : ''}
      </p>
    </div>
  );
}
