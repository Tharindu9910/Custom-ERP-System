import { useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { PAYMENT_STATE_LABEL, type WorkshopQueueFilter } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { Notice } from '@/shared/components/Notice';
import { SearchInput } from '@/shared/components/SearchInput';
import { SegmentedTabs } from '@/shared/components/SegmentedTabs';
import { formatDateTime, formatLocalDate, formatRs } from '@/shared/lib/format';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { WorkOrderModal } from '@/modules/job-cards/components/WorkOrderModal';
import { useWorkshopQueue, type WorkshopQueueRow } from '@/modules/orders/hooks/useOrders';
import { useCanTransact } from '@/shared/hooks/useCanTransact';

const STATUS_PILL: Record<string, string> = {
  AWAITING_PAYMENT: 'bg-slate-100 text-slate-700',
  PENDING: 'bg-amber-100 text-amber-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
};

const PAYMENT_PILL: Record<string, string> = {
  UNPAID: 'bg-red-50 text-red-700',
  FULLY_PAID: 'bg-green-50 text-green-700',
  ADVANCE_PAID: 'bg-blue-50 text-blue-700',
};

/** Workshop Queue — ported from the prototype (KPI ribbon, search, status tabs, date filter). */
export function WorkshopQueuePage() {
  const navigate = useNavigate();
  const canTransact = useCanTransact();
  const { notice } = useSearch({ strict: false }) as { notice?: string };
  const [status, setStatus] = useState<WorkshopQueueFilter>('ALL');
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  // One request once typing pauses, not one per key
  const searchQuery = useDebouncedValue(search.trim());
  const { data, isLoading, isFetching, refetch } = useWorkshopQueue({ status, search: searchQuery || undefined, date: date || undefined });
  const rows = data?.rows ?? [];
  const c = data?.counts;

  const edit = (row: Pick<WorkshopQueueRow, 'order_id'>) => void navigate({ to: '/job-cards/$orderId/edit', params: { orderId: row.order_id } });

  const kpi = (label: string, value: number | undefined, key: WorkshopQueueFilter, tone: string, first = false, last = false) => (
    <button
      type="button"
      onClick={() => setStatus(key)}
      className={`flex min-w-[90px] flex-col items-center px-5 py-1.5 transition-colors hover:bg-slate-100/60 ${last ? 'rounded-r-lg' : 'border-r border-slate-200'} ${first ? 'rounded-l-lg' : ''} ${status === key ? 'bg-white shadow-sm' : ''}`}
    >
      <p className="mb-1 text-[10px] font-semibold uppercase leading-none tracking-wider text-slate-500">{label}</p>
      <span className={`text-lg font-bold leading-none ${value ? tone : 'text-slate-900'}`}>{value ?? '–'}</span>
    </button>
  );

  return (
    <div className="-m-8 flex min-h-[calc(100vh-4rem)] flex-col overflow-hidden bg-slate-50 text-slate-900">
      <header className="shrink-0 border-b border-slate-200 bg-white px-8 py-5">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
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
          <div className="flex items-center overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1.5">
            {kpi('Total Jobs', c?.total, 'ALL', 'text-slate-900', true)}
            {kpi('In Queue', c?.pending, 'PENDING', 'text-amber-600')}
            {kpi('In Progress', c?.in_progress, 'IN_PROGRESS', 'text-blue-600')}
            {kpi('Completed', c?.completed, 'COMPLETED', 'text-emerald-600', false, true)}
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 p-8">
        {notice && <Notice tone="success">{notice}</Notice>}
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-5">
            <SearchInput value={search} onChange={setSearch} placeholder="Search work order, customer name, or phone..." />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <SegmentedTabs
                value={status}
                onChange={setStatus}
                tabs={[
                  { key: 'ALL', label: 'All Jobs', count: c?.total },
                  { key: 'PENDING', label: 'In Queue', count: c?.pending },
                  { key: 'IN_PROGRESS', label: 'In Progress', count: c?.in_progress },
                  { key: 'COMPLETED', label: 'Completed', count: c?.completed },
                  { key: 'AWAITING_PAYMENT', label: 'Awaiting Payment', count: c?.awaiting_payment },
                ]}
              />
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Date:</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {date && (
                  <button onClick={() => setDate('')} className="px-1 text-xs font-semibold text-slate-400 hover:text-slate-700">
                    Clear
                  </button>
                )}
              </div>
            </div>
            {status === 'AWAITING_PAYMENT' && (
              <p className="text-xs text-slate-500">
                These job cards are waiting for the minimum advance at the cashier. They move to the queue once it is paid. You can still edit them, or void one
                the customer cancelled.
              </p>
            )}
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-3.5 text-left">Job Details</th>
                  <th className="px-6 py-3.5 text-left">Date</th>
                  <th className="px-6 py-3.5 text-left">Status</th>
                  <th className="px-6 py-3.5 text-right">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-sm">
                {isLoading && (
                  <tr>
                    <td colSpan={4} className="px-6 py-16 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                )}
                {!isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-16 text-center text-slate-400">
                      No jobs found.
                    </td>
                  </tr>
                )}
                {rows.map((job) => (
                  <tr key={job.order_id} onClick={() => setSelected(job.order_id)} className="cursor-pointer transition-colors hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="text-sm font-bold text-slate-900">{job.order_number}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        Cust: {job.customer_name} ({job.customer_phone})
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">{job.line_count} Sub-job(s)</div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                      {formatLocalDate(job.job_date)}
                      <div className="mt-0.5 text-xs text-slate-400">Created {formatDateTime(job.created_at)}</div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold leading-5 ${STATUS_PILL[job.display_status] ?? ''}`}>
                        {job.display_label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                      <div className="flex flex-col items-end justify-center">
                        <span className={`mb-1 rounded px-2 py-0.5 text-xs font-medium ${PAYMENT_PILL[job.payment_state]}`}>
                          {PAYMENT_STATE_LABEL[job.payment_state]} {job.paid_amount > 0 ? `(${formatRs(job.paid_amount)})` : ''}
                        </span>
                        <div className="flex items-center gap-2">
                          {canTransact && job.can_edit && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                edit(job);
                              }}
                              className="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                            >
                              Edit
                            </button>
                          )}
                          <span className="text-xs text-slate-500">
                            {job.completed_count} / {job.line_count} Completed
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {selected && <WorkOrderModal orderId={selected} onClose={() => setSelected(null)} onEdit={() => edit({ order_id: selected })} />}
    </div>
  );
}
