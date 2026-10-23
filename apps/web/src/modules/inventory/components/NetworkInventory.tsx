import { useState } from 'react';
import type { InventoryQuery, StockLevel } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { MainBadge } from '@/shared/components/MainBadge';
import { SearchInput } from '@/shared/components/SearchInput';
import { SegmentedTabs } from '@/shared/components/SegmentedTabs';
import { useNetworkInventory } from '@/modules/inventory/hooks/useInventory';
import { formatQty } from '@/modules/stock-transfers/lib/transfer';

const CELL_STYLE: Record<StockLevel, string> = {
  OUT: 'bg-red-50 text-red-700',
  LOW: 'bg-amber-50 text-amber-800',
  HEALTHY: 'text-slate-900',
};

const selectCls = 'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500';

/**
 * Head office: every branch's stock in one table (Docs/decisions/0002). Main branch
 * is the first column. A row's status is its worst branch, so a shortage anywhere
 * shows up under Low / Out. Read-only: clicking a cell opens that branch's details.
 */
export function NetworkInventory({ onInspect }: { onInspect: (itemId: string, branchId: string) => void }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<InventoryQuery['status']>('ALL');
  const [sort, setSort] = useState<InventoryQuery['sort']>('NAME');

  const { data, isLoading, isFetching, refetch } = useNetworkInventory({ q: search.trim() || undefined, category: category || undefined, status, sort });
  const branches = data?.branches ?? [];
  const rows = data?.rows ?? [];
  const c = data?.counts;
  const colSpan = branches.length + 2;

  return (
    <div className="-m-8 flex min-h-[calc(100vh-4rem)] flex-col bg-slate-50 text-slate-900 antialiased">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Inventory</h1>
          <span className="text-sm text-slate-500">All branches</span>
          <button type="button" onClick={() => void refetch()} title="Refresh" className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
            <Icon name="refresh" className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 p-4 sm:p-8">
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-5">
            <SearchInput value={search} onChange={setSearch} placeholder="Search items by name, SKU, or category..." />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="max-w-full overflow-x-auto">
                <SegmentedTabs
                  value={status}
                  onChange={setStatus}
                  tabs={[
                    { key: 'ALL', label: 'All items', count: c?.all },
                    { key: 'HEALTHY', label: 'Healthy everywhere', count: c?.healthy },
                    { key: 'LOW', label: 'Low somewhere', count: c?.low },
                    { key: 'OUT', label: 'Out somewhere', count: c?.out },
                  ]}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Category:</span>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
                    <option value="">All Categories</option>
                    {(data?.categories ?? []).map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Sort by:</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value as InventoryQuery['sort'])} className={selectCls}>
                    <option value="NAME">Name (A – Z)</option>
                    <option value="STOCK_DESC">Total (High to Low)</option>
                    <option value="STOCK_ASC">Total (Low to High)</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3.5">Item</th>
                  {branches.map((b) => (
                    <th key={b.branch_id} className={`px-4 py-3.5 text-right ${b.is_main ? 'bg-amber-50/60' : ''}`}>
                      <span className="inline-flex items-center gap-1.5">
                        {b.name}
                        {b.is_main && <MainBadge />}
                      </span>
                    </th>
                  ))}
                  <th className="px-6 py-3.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {isLoading ? (
                  <tr>
                    <td colSpan={colSpan} className="py-16 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className="py-16 text-center text-slate-400">
                      <p className="font-semibold text-slate-600">No items found</p>
                      <p className="mt-1 text-xs text-slate-400">Try a different search or clear the filters.</p>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.item_id} className="transition-colors hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-6 py-3">
                        <p className="font-semibold text-slate-900">{row.name}</p>
                        <div className="mt-0.5 text-xs text-slate-400">
                          <span className="font-mono">{row.sku}</span> · {row.category} · {row.unit}
                        </div>
                      </td>
                      {branches.map((b) => {
                        const cell = row.stocks[b.branch_id];
                        return (
                          <td key={b.branch_id} className={`whitespace-nowrap px-2 py-2 text-right ${b.is_main ? 'bg-amber-50/30' : ''}`}>
                            {cell ? (
                              <button
                                onClick={() => onInspect(row.item_id, b.branch_id)}
                                title={`Min ${formatQty(cell.reorder_level)} — open ${b.name} details`}
                                className={`rounded-md px-2 py-1 font-bold tabular-nums hover:ring-1 hover:ring-slate-300 ${CELL_STYLE[cell.level]}`}
                              >
                                {formatQty(cell.stock)}
                              </button>
                            ) : (
                              <span className="px-2 text-slate-300" title={`${b.name} doesn't keep this item`}>
                                —
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="whitespace-nowrap px-6 py-3 text-right font-bold tabular-nums text-slate-900">{formatQty(row.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
