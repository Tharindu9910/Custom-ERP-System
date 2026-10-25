import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { StockAlertQuery } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { SearchInput } from '@/shared/components/SearchInput';
import { SegmentedTabs } from '@/shared/components/SegmentedTabs';
import { useBranchContext } from '@/shared/hooks/useBranchContext';
import { useCanTransact } from '@/shared/hooks/useCanTransact';
import { usePageScope } from '@/shared/hooks/usePageScope';
import { useAuthStore } from '@/shared/stores/auth.store';
import { NetworkStockAlerts } from '@/modules/inventory/components/NetworkStockAlerts';
import { usePermission } from '@/shared/hooks/usePermission';
import { useStockAlerts, type AlertRowDto } from '@/modules/inventory/hooks/useInventory';
import { encodeRequestItems, formatQty } from '@/modules/stock-transfers/lib/transfer';

type Filter = StockAlertQuery['filter'];

/** Head office with "All branches" sees every branch's alerts; everyone else one branch. */
export function StockAlertsPage() {
  const { isGlobal } = usePageScope();
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  return isGlobal && !activeBranchId ? <NetworkStockAlerts /> : <BranchStockAlerts />;
}

/**
 * Stock Alerts (prototype): what this branch needs to restock (BR06: own stock
 * only), with the shortfall worked out, and a quick way to ask another branch.
 */
function BranchStockAlerts() {
  const navigate = useNavigate();
  const { can } = usePermission();
  const { featureOn } = useBranchContext();
  const canTransact = useCanTransact();
  const mayRequest = canTransact && can('request', 'stock') && featureOn('stockRequest');

  const [filter, setFilter] = useState<Filter>('NEEDS_RESTOCK');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading, isFetching, refetch } = useStockAlerts({ filter, category: category || undefined, q: search.trim() || undefined });
  const rows = data?.rows ?? [];
  const c = data?.counts;

  // Items already asked for (still open) can't be asked for twice
  const canRequest = (r: AlertRowDto) => mayRequest && r.deficit > 0 && !r.open_request;
  const selectable = rows.filter(canRequest);
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.item_id));
  const selectedRows = rows.filter((r) => selected.has(r.item_id) && canRequest(r));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectable.map((r) => r.item_id)));

  const requestItems = (list: AlertRowDto[]) => {
    if (list.length === 0) return;
    void navigate({ to: '/stock-requests', search: { tab: 'create', items: encodeRequestItems(list.map((r) => ({ item_id: r.item_id, quantity: r.deficit }))) } });
  };
  const openRequests = () => void navigate({ to: '/stock-requests', search: { tab: 'ours' } });

  const kpis: { label: string; value?: number; tone: string; filter?: Filter }[] = [
    { label: 'Total Alerts', value: c?.needs_restock, tone: 'text-rose-600', filter: 'NEEDS_RESTOCK' },
    { label: 'Critical', value: c?.critical, tone: 'text-rose-600', filter: 'CRITICAL' },
    { label: 'Low Stock', value: c?.low, tone: 'text-amber-500', filter: 'LOW' },
    // Reassurance only; healthy items live in Inventory
    { label: 'Healthy', value: c?.healthy, tone: 'text-emerald-600' },
  ];
  const untouched = filter === 'NEEDS_RESTOCK' && !category && !search;

  return (
    <div className="-m-8 flex min-h-[calc(100vh-4rem)] flex-col bg-slate-50 text-slate-900 antialiased">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Stock Alerts</h1>
            <button type="button" onClick={() => void refetch()} title="Refresh" className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
              <Icon name="refresh" className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex items-center overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1.5">
            {kpis.map((k, i) => {
              const Comp = k.filter ? 'button' : 'div';
              return (
                <Comp
                  key={k.label}
                  type={k.filter ? 'button' : undefined}
                  onClick={k.filter ? () => setFilter(k.filter!) : undefined}
                  className={`flex min-w-[90px] flex-col items-center px-5 py-1.5 transition-colors ${k.filter ? 'cursor-pointer hover:bg-slate-100/60' : ''} ${i < kpis.length - 1 ? 'border-r border-slate-200' : ''}`}
                >
                  <span className="mb-1 whitespace-nowrap text-[10px] font-semibold uppercase leading-none tracking-wider text-slate-500">{k.label}</span>
                  <span className={`text-lg font-bold leading-none ${k.tone}`}>{k.value ?? '–'}</span>
                </Comp>
              );
            })}
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-8">
        <div className="flex flex-1 flex-col overflow-clip rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-5">
            <SearchInput value={search} onChange={setSearch} placeholder="Search items by name, SKU, or category..." />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="max-w-full overflow-x-auto">
                <SegmentedTabs
                  value={filter}
                  onChange={setFilter}
                  tabs={[
                    { key: 'NEEDS_RESTOCK', label: 'Needs restock', count: c?.needs_restock },
                    { key: 'CRITICAL', label: 'Out of stock', count: c?.critical },
                    { key: 'LOW', label: 'Low', count: c?.low },
                  ]}
                />
              </div>
              <label className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Category:</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Categories</option>
                  {(data?.categories ?? []).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="w-10 py-3.5 pl-6 pr-2">
                    {mayRequest && (
                      <input
                        type="checkbox"
                        checked={allSelected}
                        disabled={selectable.length === 0}
                        onChange={toggleAll}
                        aria-label="Select all items that need restock"
                        className="h-4 w-4 rounded border-slate-300 accent-blue-600 disabled:opacity-30"
                      />
                    )}
                  </th>
                  <th className="px-4 py-3.5">Item</th>
                  <th className="px-4 py-3.5 text-right">In stock</th>
                  <th className="px-4 py-3.5 text-right">Minimum</th>
                  <th className="px-4 py-3.5 text-right">Need</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-400">
                      <p className="font-semibold text-slate-600">{untouched ? 'All stock is healthy' : 'No items found'}</p>
                      <p className="mt-1 text-xs text-slate-400">No items match the current filters.</p>
                      {!untouched && (
                        <button
                          onClick={() => {
                            setFilter('NEEDS_RESTOCK');
                            setCategory('');
                            setSearch('');
                          }}
                          className="mt-3 rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Reset Filters
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const critical = row.severity === 'CRITICAL';
                    return (
                      <tr key={row.item_id} className={`transition-colors hover:bg-slate-50/70 ${selected.has(row.item_id) ? 'bg-blue-50/40' : critical ? 'bg-red-50/20' : ''}`}>
                        <td className="py-4 pl-6 pr-2">
                          {canRequest(row) && (
                            <input
                              type="checkbox"
                              checked={selected.has(row.item_id)}
                              onChange={() => toggle(row.item_id)}
                              aria-label={`Select ${row.name}`}
                              className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                            />
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">
                          <div className="font-semibold text-slate-900">{row.name}</div>
                          <div className="mt-0.5 text-xs text-slate-400">
                            <span className="font-mono">{row.sku}</span> · {row.category}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-right">
                          <span className={`text-base font-bold ${critical ? 'text-red-600' : 'text-amber-600'}`}>{formatQty(row.stock)}</span>
                          <span className="ml-1 text-xs text-slate-400">{row.unit}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-right text-xs text-slate-600">{formatQty(row.reorder_level)}</td>
                        <td className="whitespace-nowrap px-4 py-4 text-right">
                          {row.deficit > 0 ? <span className="font-bold text-slate-900">{formatQty(row.deficit)}</span> : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">
                          {critical ? (
                            <span className="inline-block rounded border border-red-200 bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-800">Out of Stock</span>
                          ) : (
                            <span className="inline-block rounded border border-amber-200 bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">Low Stock</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          {row.open_request ? (
                            <button
                              onClick={openRequests}
                              title="Open Stock Requests"
                              className={`text-xs font-bold hover:underline ${row.open_request.status === 'SENT' ? 'text-blue-700' : 'text-amber-700'}`}
                            >
                              {row.open_request.status === 'SENT' ? 'On the way' : 'Requested · Waiting'}
                            </button>
                          ) : canRequest(row) ? (
                            <button
                              onClick={() => requestItems([row])}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-blue-700"
                            >
                              Request {formatQty(row.deficit)}
                            </button>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {selectedRows.length > 0 && (
            <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-6 py-3 backdrop-blur">
              <p className="text-sm text-slate-700">
                <strong>
                  {selectedRows.length} item{selectedRows.length > 1 ? 's' : ''}
                </strong>{' '}
                selected
                <span className="text-slate-400"> · {formatQty(selectedRows.reduce((s, r) => s + r.deficit, 0))} units needed</span>
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelected(new Set())} className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800">
                  Clear
                </button>
                <button
                  onClick={() => requestItems(selectedRows)}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
                >
                  Request selected ({selectedRows.length})
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
