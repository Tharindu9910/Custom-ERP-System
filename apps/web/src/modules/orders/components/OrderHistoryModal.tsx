import { useEffect, useState } from 'react';
import { HISTORY_MAX_DAYS, toBranchDate } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { Modal } from '@/shared/components/Modal';
import { Notice } from '@/shared/components/Notice';
import { apiError } from '@/shared/api/errors';
import { formatLocalDate, formatRs } from '@/shared/lib/format';
import { useOrderHistory } from '@/modules/orders/hooks/useOrders';

/** Shift a YYYY-MM-DD date by whole days (calendar maths, no timezone involved). */
const shift = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

type Range = { from: string; to: string };

function quickRanges(today: string): { label: string; range: Range }[] {
  return [
    { label: 'Today', range: { from: today, to: today } },
    { label: 'Last 7 days', range: { from: shift(today, -6), to: today } },
    { label: 'Last 30 days', range: { from: shift(today, -29), to: today } },
    { label: 'This month', range: { from: `${today.slice(0, 8)}01`, to: today } },
  ];
}

const STATUS_STYLE: Record<string, string> = {
  VOIDED: 'bg-slate-100 text-slate-500',
  CLOSED: 'bg-emerald-50 text-emerald-700',
  DRAFT: 'bg-amber-50 text-amber-700',
};

/**
 * History popup on Create Job Card / Create Order: this branch's job cards or roofing
 * orders whose form date is in From–To (branch time), newest first, 25 a page.
 * Requests are kept to one per change: nothing loads until the popup is open, the
 * search waits until typing pauses, pages are cached, and the list doesn't poll.
 */
export function OrderHistoryModal({
  type,
  hidden = false,
  onClose,
  onOpenOrder,
}: {
  type: 'job-cards' | 'roofing-orders';
  /** Hidden while an order's details are open on top; filters and the loaded page are kept */
  hidden?: boolean;
  onClose: () => void;
  onOpenOrder: (orderId: string) => void;
}) {
  const today = toBranchDate();
  const quick = quickRanges(today);
  const [range, setRange] = useState<Range>(quick[1].range);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const rangeError =
    !range.from || !range.to
      ? 'Pick both dates.'
      : range.from > range.to
        ? '"From" must be on or before "To".'
        : shift(range.from, HISTORY_MAX_DAYS) <= range.to
          ? `Pick at most ${HISTORY_MAX_DAYS} days.`
          : null;
  const query = { from: range.from, to: range.to, search: search || undefined, page };
  const { data, isFetching, isLoading, error } = useOrderHistory(type, query, !rangeError);

  const setDates = (next: Partial<Range>) => {
    setRange((r) => ({ ...r, ...next }));
    setPage(1);
  };
  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? 25;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const noun = type === 'job-cards' ? 'job card' : 'order';

  return (
    <Modal
      open={!hidden}
      size="xl"
      onClose={onClose}
      title={type === 'job-cards' ? 'Job Card History' : 'Order History'}
      subtitle={`Every ${noun} at this branch by its ${type === 'job-cards' ? 'job' : 'order'} date. Click one to see its details.`}
      footer={
        <>
          <span className="mr-auto text-xs text-slate-500">
            {total > 0 ? `Showing ${first}–${last} of ${total}` : ''}
            {isFetching && !isLoading ? ' · Updating…' : ''}
          </span>
          <button type="button" className="btn-secondary" disabled={page <= 1 || isFetching} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <button type="button" className="btn-secondary" disabled={page >= pages || isFetching} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {quick.map((q) => {
            const active = q.range.from === range.from && q.range.to === range.to;
            return (
              <button
                key={q.label}
                type="button"
                onClick={() => setDates(q.range)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                {q.label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_2fr]">
          <div>
            <label className="field-label">From</label>
            <input type="date" value={range.from} max={today} onChange={(e) => setDates({ from: e.target.value })} className="field-input" />
          </div>
          <div>
            <label className="field-label">To</label>
            <input type="date" value={range.to} max={today} onChange={(e) => setDates({ to: e.target.value })} className="field-input" />
          </div>
          <div>
            <label className="field-label">Search</label>
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={`${type === 'job-cards' ? 'Job card' : 'Order'} no., customer name or phone`}
              className="field-input"
            />
          </div>
        </div>

        {rangeError && <Notice tone="warning">{rangeError}</Notice>}
        {error && <Notice tone="error">{apiError(error).message}</Notice>}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">{type === 'job-cards' ? 'Job card' : 'Order'}</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Customer</th>
                <th className="px-3 py-2 text-left">Created by</th>
                <th className="px-3 py-2 text-right">Items</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : !data || data.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    No {noun}s in this period{search ? ' match the search' : ''}.
                  </td>
                </tr>
              ) : (
                data.rows.map((r) => (
                  <tr key={r.order_id} onClick={() => onOpenOrder(r.order_id)} className="cursor-pointer hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold text-blue-700">{r.order_number}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatLocalDate(r.date)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{r.customer_name ?? '—'}</div>
                      <div className="text-xs text-slate-400">{r.customer_phone}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{r.created_by_name ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.item_count}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatRs(r.total)}</td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${r.balance > 0 && r.status !== 'VOIDED' ? 'font-semibold text-amber-700' : 'text-slate-400'}`}>
                      {formatRs(r.balance)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[r.status] ?? 'bg-blue-50 text-blue-700'}`}>
                        {r.display_label}
                        <Icon name="chevronRight" className="h-3 w-3 opacity-50" />
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
