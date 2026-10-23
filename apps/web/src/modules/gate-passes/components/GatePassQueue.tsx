import { useState } from 'react';
import { formatGatePassLength, type GatePassFilter } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { ColorDot, IdChip } from '@/shared/components/Marks';
import { formatDateTime } from '@/shared/lib/format';
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { statusTone } from '@/shared/lib/tones';
import { useGatePasses, type GatePassDto } from '../hooks/useGatePasses';
import { gatePassStatusLabel } from '../lib/labels';
import { GatePassStatusBadge } from './GatePassStatusBadge';

const STATUS_OPTIONS: { value: GatePassFilter; label: string }[] = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'AVAILABLE', label: 'Available Materials' },
  { value: 'OPEN', label: 'Open' },
  { value: 'RESERVED', label: 'Reserved' },
  { value: 'PARTIALLY_ASSIGNED', label: 'Partially Assigned' },
  { value: 'FULLY_ASSIGNED', label: 'Fully Assigned' },
  { value: 'CLOSED', label: 'Closed' },
];

const filterCls =
  'block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-[#0033A0] focus:outline-none focus:ring-2 focus:ring-[#0033A0]/20';

/** "Gate Pass Queue" tab — ported from the prototype GatePassView. */
export function GatePassQueue({ hideColor, onOpen }: { hideColor: boolean; onOpen: (gp: GatePassDto) => void }) {
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
      <div className="grid grid-cols-1 items-end gap-3.5 border-b border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-12">
        <div className="relative sm:col-span-2 lg:col-span-5">
          <Icon name="search" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search gate pass, customer or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${filterCls} pl-9`}
          />
        </div>
        <div className="lg:col-span-3">
          <label className="field-label">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as GatePassFilter)} className={`${filterCls} cursor-pointer`}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.value === 'AVAILABLE' ? `${o.label} (${data?.counts.available ?? 0})` : o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <label className="field-label">Date Range</label>
          <div className="flex items-center gap-2">
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={`${filterCls} min-w-0`} />
            <span className="text-xs text-slate-400">to</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={`${filterCls} min-w-0`} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50/70 px-5 py-2 text-xs">
        <span className="spec-chip">{rows.length}</span>
        <span className="status-pill" style={{ color: '#047857', background: '#04785718', borderColor: '#04785740' }}>
          {data?.counts.available ?? 0} available
        </span>
        {filtered && (
          <button type="button" onClick={reset} className="text-xs font-semibold text-[#0033A0]">
            Reset
          </button>
        )}
        <button
          type="button"
          onClick={() => void refetch()}
          className="ml-auto flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
          title="Refresh"
        >
          <Icon name="refresh" className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="text-sm font-semibold text-slate-600">None</p>
          {filtered && (
            <button
              type="button"
              onClick={reset}
              className="mt-3.5 inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50">
              <tr className="text-left font-bold uppercase tracking-wider text-slate-600">
                <th className="w-36 px-5 py-3">Gate Pass ID</th>
                <th className="w-44 px-4 py-3">Created</th>
                <th className="w-48 px-5 py-3">Customer</th>
                <th className="px-5 py-3">Materials &amp; Balances</th>
                <th className="w-32 px-4 py-3">Status</th>
                <th className="w-44 px-4 py-3">Closed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((gp) => {
                const balances = gp.summary.item_balances;
                const remaining = balances.length - 2;
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
                    className="group cursor-pointer transition-colors hover:bg-blue-50/30 focus:outline-none focus-visible:bg-blue-50/40"
                    style={{ boxShadow: `inset 4px 0 0 ${statusTone(gatePassStatusLabel(gp.summary.status))}` }}
                  >
                    <td className="whitespace-nowrap px-5 py-3.5 align-top">
                      <IdChip>#{gp.pass_number}</IdChip>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 align-top font-medium text-slate-600">{formatDateTime(gp.created_at)}</td>
                    <td className="px-5 py-3.5 align-top">
                      <span className="block truncate text-sm font-bold text-slate-900" title={gp.customer_name}>
                        {gp.customer_name}
                      </span>
                      <span className="mt-0.5 block font-mono text-xs text-slate-500">{gp.customer_phone}</span>
                    </td>
                    <td className="px-5 py-3.5 align-top">
                      <div className="max-w-md space-y-2">
                        {balances.slice(0, 2).map((bal) => {
                          const item = gp.items.find((i) => i.gp_item_id === bal.gp_item_id)!;
                          return (
                            <div key={bal.gp_item_id}>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-slate-900">{item.material_type}</span>
                                <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">
                                  Total: {bal.received}
                                </span>
                                <span
                                  className={`rounded border px-1.5 py-0.5 text-[11px] font-bold ${
                                    bal.available > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-100 text-slate-400'
                                  }`}
                                >
                                  {bal.available} avail
                                </span>
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                                {[
                                  item.thickness ? `${item.thickness} mm` : null,
                                  item.length ? formatGatePassLength(item.length, item.length_unit) : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                                {!hideColor && item.color && (
                                  <span className="inline-flex items-center gap-1">
                                    <ColorDot color={item.color} />
                                    {item.color}
                                  </span>
                                )}
                                {bal.committed > 0 && <span className="font-semibold text-blue-700">· {bal.committed} allocated</span>}
                                {bal.reserved > 0 && <span className="font-medium text-purple-700">· {bal.reserved} in draft</span>}
                              </div>
                              {item.condition_note && (
                                <div className="mt-0.5 max-w-sm truncate text-[11px] italic text-slate-500" title={item.condition_note}>
                                  Note: {item.condition_note}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {remaining > 0 && (
                          <span className="inline-flex items-center text-[11px] font-semibold text-[#0033A0] group-hover:underline">
                            +{remaining} more item{remaining !== 1 ? 's' : ''} (click to view)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 align-top">
                      <GatePassStatusBadge summary={gp.summary} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 align-top font-mono text-slate-600">
                      {gp.summary.closed_at ? formatDateTime(gp.summary.closed_at) : <span className="font-normal italic text-slate-400">—</span>}
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
