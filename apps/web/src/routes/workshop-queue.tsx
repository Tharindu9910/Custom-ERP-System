import { useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { PAYMENT_STATE_LABEL, type WorkshopDisplayStatus } from '@erp/shared';
import { Icon, type IconName } from '@/shared/components/Icon';
import { Notice } from '@/shared/components/Notice';
import { SearchInput } from '@/shared/components/SearchInput';
import { formatDateTime, formatLocalDate, formatRs } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { CompleteJobDialog, StartJobDialog } from '@/modules/job-cards/components/JobCardMoveDialogs';
import { WorkOrderModal } from '@/modules/job-cards/components/WorkOrderModal';
import { useWorkshopQueue, type WorkshopQueueRow } from '@/modules/orders/hooks/useOrders';
import { useCanTransact } from '@/shared/hooks/useCanTransact';
import { usePermission } from '@/shared/hooks/usePermission';

const PAYMENT_PILL: Record<string, string> = {
  UNPAID: 'bg-red-50 text-red-700',
  FULLY_PAID: 'bg-green-50 text-green-700',
  ADVANCE_PAID: 'bg-blue-50 text-blue-700',
};

type StepKey = Extract<WorkshopDisplayStatus, 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'>;

// The supervisor's area of the lifecycle, in order (Docs/decisions/0005)
const STEPS: { key: StepKey; title: string; icon: IconName; empty: string; tone: { ring: string; count: string; icon: string } }[] = [
  {
    key: 'PENDING',
    title: 'In Queue',
    icon: 'clock',
    empty: 'No job cards waiting.',
    tone: { ring: 'border-amber-400 ring-amber-200', count: 'text-amber-600', icon: 'bg-amber-100 text-amber-700' },
  },
  {
    key: 'IN_PROGRESS',
    title: 'Ongoing',
    icon: 'wrench',
    empty: 'Nothing ongoing.',
    tone: { ring: 'border-blue-400 ring-blue-200', count: 'text-blue-600', icon: 'bg-blue-100 text-blue-700' },
  },
  {
    key: 'COMPLETED',
    title: 'Finished',
    icon: 'checkCircle',
    empty: 'No finished job cards.',
    tone: { ring: 'border-emerald-400 ring-emerald-200', count: 'text-emerald-600', icon: 'bg-emerald-100 text-emerald-700' },
  },
];

/**
 * Workshop Queue (Docs/decisions/0005): the supervisor's statuses as cards, In Queue →
 * Ongoing → Finished. Picking a card shows only its job cards, full width, each
 * with the button that moves it on. Unpaid cards stay at the cashier and completed
 * ones wait there for collection.
 */
export function WorkshopQueuePage() {
  const navigate = useNavigate();
  const canTransact = useCanTransact();
  const { can } = usePermission();
  const canStart = canTransact && can('update', 'job_card_status');
  const canComplete = canTransact && can('complete', 'work_order');
  const canEdit = canTransact && can('create', 'job_card');
  const { notice } = useSearch({ strict: false }) as { notice?: string };
  const [step, setStep] = useState<StepKey>('PENDING');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ orderId: string; to: 'start' | 'complete' } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // One request once typing pauses, not one per key
  const searchQuery = useDebouncedValue(search.trim());
  const { data, isLoading, isFetching, refetch } = useWorkshopQueue({ search: searchQuery || undefined });
  const rows = data?.rows ?? [];
  const current = STEPS.find((s) => s.key === step)!;
  const list = rows.filter((r) => r.display_status === step);

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
      return (
        <span className="whitespace-nowrap text-xs font-semibold text-slate-500">
          {job.balance > 0 ? `Waiting for cashier · ${formatRs(job.balance)} due` : 'Waiting for cashier to hand over'}
        </span>
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
          <div className="w-full lg:max-w-md">
            <SearchInput value={search} onChange={setSearch} placeholder="Search work order, customer name, or phone..." />
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 p-8">
        {notice && <Notice tone="success">{notice}</Notice>}
        {done && <Notice tone="success">{done}</Notice>}

        {/* One card per status, in lifecycle order; the picked one shows its list below */}
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => {
            const on = s.key === step;
            const count = rows.filter((r) => r.display_status === s.key).length;
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
                {i < STEPS.length - 1 && (
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
                          <button onClick={() => edit(job.order_id)} className="rounded bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800">
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
        </section>
      </main>

      {selected && <WorkOrderModal orderId={selected} onClose={() => setSelected(null)} onEdit={() => edit(selected)} onMoved={finish} />}
      {moving?.to === 'start' && <StartJobDialog orderId={moving.orderId} onClose={() => setMoving(null)} onDone={finish} />}
      {moving?.to === 'complete' && <CompleteJobDialog orderId={moving.orderId} onClose={() => setMoving(null)} onDone={finish} />}
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
