import { useState } from 'react';
import type { StockAlertQuery } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { MainBadge } from '@/shared/components/MainBadge';
import { SearchInput } from '@/shared/components/SearchInput';
import { SegmentedTabs } from '@/shared/components/SegmentedTabs';
import { useNetworkStockAlerts } from '@/modules/inventory/hooks/useInventory';
import { formatQty } from '@/modules/stock-transfers/lib/transfer';

type Filter = StockAlertQuery['filter'];

/**
 * Head office: what every branch needs to restock, and whether the main branch
 * holds enough to cover it (Docs/decisions/0002). Read-only — branches raise the
 * requests themselves.
 */
export function NetworkStockAlerts() {
  const [filter, setFilter] = useState<Filter>('NEEDS_RESTOCK');
  const [category, setCategory] = useState('');
  const [branchId, setBranchId] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading, isFetching, refetch } = useNetworkStockAlerts({ filter, category: category || undefined, q: search.trim() || undefined });
  const rows = (data?.rows ?? []).filter((r) => !branchId || r.branch.branch_id === branchId);
  const c = data?.counts;
  const mainName = data?.branches.find((b) => b.is_main)?.name ?? 'Main';

  return (
    <div className="-m-8 flex min-h-[calc(100vh-4rem)] flex-col bg-slate-50 text-slate-900 antialiased">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Stock Alerts</h1>
          <span className="text-sm text-slate-500">All branches</span>
          <button type="button" onClick={() => void refetch()} title="Refresh" className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
            <Icon name="refresh" className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
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
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Branch:</span>
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All</option>
                    {(data?.branches ?? []).map((b) => (
                      <option key={b.branch_id} value={b.branch_id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
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
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3.5">Branch</th>
                  <th className="px-4 py-3.5">Item</th>
                  <th className="px-4 py-3.5 text-right">In stock</th>
                  <th className="px-4 py-3.5 text-right">Minimum</th>
                  <th className="px-4 py-3.5 text-right">Short by</th>
                  <th className="px-6 py-3.5 text-right">{mainName} has</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-slate-400">
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-slate-400">
                      <p className="font-semibold text-slate-600">Nothing needs restocking</p>
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={`${r.branch.branch_id}:${r.item_id}`} className={r.severity === 'CRITICAL' ? 'bg-red-50/20' : ''}>
                      <td className="whitespace-nowrap px-6 py-3">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                          {r.branch.name}
                          {r.branch.is_main && <MainBadge />}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <p className="font-semibold text-slate-900">{r.name}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          <span className="font-mono">{r.sku}</span> · {r.category}
                        </p>
                      </td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums ${r.severity === 'CRITICAL' ? 'text-red-600' : 'text-amber-600'}`}>
                        {formatQty(r.stock)} <span className="text-xs font-normal text-slate-400">{r.unit}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-slate-500">{formatQty(r.reorder_level)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-800">{formatQty(r.deficit)}</td>
                      <td className="whitespace-nowrap px-6 py-3 text-right tabular-nums">
                        {r.main_stock === null ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <span className={r.main_stock >= r.deficit ? 'font-semibold text-emerald-700' : 'text-slate-500'}>{formatQty(r.main_stock)}</span>
                        )}
                      </td>
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
