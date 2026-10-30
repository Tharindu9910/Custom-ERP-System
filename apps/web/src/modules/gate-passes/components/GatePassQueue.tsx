import { useState } from 'react';
import type { GatePassFilter } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { IdChip } from '@/shared/components/Marks';
import { SearchInput } from '@/shared/components/SearchInput';
import { SegmentedTabs } from '@/shared/components/SegmentedTabs';
import { formatDateTime } from '@/shared/lib/format';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { useGatePasses, type GatePassDto } from '../hooks/useGatePasses';
import { GatePassStatusBadge } from './GatePassStatusBadge';

const STATUS_TABS: { key: GatePassFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'AVAILABLE', label: 'Available' },
  { key: 'OPEN', label: 'Open' },
  { key: 'RESERVED', label: 'Reserved' },
  { key: 'PARTIALLY_ASSIGNED', label: 'Partially Assigned' },
  { key: 'FULLY_ASSIGNED', label: 'Fully Assigned' },
  { key: 'CLOSED', label: 'Closed' },
];

const dateCls = 'h-10 w-36 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-900 focus:border-[#0033A0] focus:outline-none focus:ring-2 focus:ring-[#0033A0]/20';

/** "MS Plain Sheet ×2, Zinc Coated ×3 +1 more" — what came in, at a glance. */
function materialSummary(gp: GatePassDto): string {
  const shown = gp.items.slice(0, 2).map((i) => `${i.material_type} ×${i.quantity}`);
  const more = gp.items.length - shown.length;
  return `${shown.join(', ')}${more > 0 ? ` +${more} more` : ''}`;
}

/** "Gate Pass Queue" tab: one compact row per pass; the popup has the full breakdown. */
export function GatePassQueue({ onOpen }: { onOpen: (gp: GatePassDto) => void }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<GatePassFilter>('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // One request once typing pauses, not one per key
  const searchQuery = useDebouncedValue(search.trim());
  const { data, isLoading, isFetching, refetch } = useGatePasses({
    search: searchQuery || undefined,
    status,
    from: from || undefined,
    to: to || undefined,
  });
  const rows = data?.rows ?? [];
  const filtered = !!search || status !== 'ALL' || !!from || !!to;
  const reset = () => {
    setSearch('');
    setStatus('ALL');
    setFrom('');
    setTo('');
  };

  return (
    <div>
      <div className="space-y-3 border-b border-slate-200 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder="Search gate pass, customer or phone" />
          </div>
          <div className="flex items-center gap-2">
            <input type="date" aria-label="From" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={dateCls} />
            <span className="text-xs text-slate-400">to</span>
            <input type="date" aria-label="To" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={dateCls} />
            <button
              type="button"
              onClick={() => void refetch()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              title="Refresh"
            >
              <Icon name="refresh" className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedTabs<GatePassFilter>
            tabs={STATUS_TABS.map((t) => (t.key === 'AVAILABLE' ? { ...t, count: data?.counts.available ?? 0 } : t))}
            value={status}
            onChange={setStatus}
          />
          {filtered && (
            <button type="button" onClick={reset} className="text-xs font-semibold text-[#0033A0] hover:underline">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="text-sm font-semibold text-slate-600">No gate passes</p>
          {filtered && (
            <button
              type="button"
              onClick={reset}
              className="mt-3.5 inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">Gate pass</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Materials</th>
                <th className="px-4 py-3 text-right">Available</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((gp) => {
                const s = gp.summary;
                return (
                  <tr
                    key={gp.gate_pass_id}
                    tabIndex={0}
                    onClick={() => onOpen(gp)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpen(gp);
                      }
                    }}
                    className="cursor-pointer transition-colors hover:bg-blue-50/40 focus:outline-none focus-visible:bg-blue-50/40"
                  >
                    <td className="whitespace-nowrap px-5 py-3">
                      <IdChip>#{gp.pass_number}</IdChip>
                      <span className="mt-1 block text-xs text-slate-400">{formatDateTime(gp.created_at)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block max-w-[14rem] truncate font-semibold text-slate-900" title={gp.customer_name}>
                        {gp.customer_name}
                      </span>
                      <span className="block font-mono text-xs text-slate-500">{gp.customer_phone}</span>
                    </td>
                    <td className="max-w-sm px-4 py-3">
                      <span className="block truncate text-slate-700" title={gp.items.map((i) => `${i.material_type} ×${i.quantity}`).join(', ')}>
                        {materialSummary(gp)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <span className={`font-semibold ${s.total_available > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>{s.total_available}</span>
                      <span className="text-slate-400"> of {s.total_received}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <GatePassStatusBadge summary={s} compact />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
