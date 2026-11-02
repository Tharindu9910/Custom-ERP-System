import { useState } from 'react';
import { IdChip } from '@/shared/components/Marks';
import { MainBadge } from '@/shared/components/MainBadge';
import { BoardSection, StatusCards } from '@/shared/components/StatusBoard';
import { useNetworkStockAlerts } from '@/modules/inventory/hooks/useInventory';
import { formatQty } from '@/modules/stock-transfers/lib/transfer';
import { RESTOCK_STEPS, outNote, restockLists, type RestockStep } from '../lib/restock';
import { StockLevelBadge, selectCls } from './StockBadges';
import { BoardMessageRow, StockPage, TABLE, TBODY, TH, THEAD } from './StockPage';

/**
 * Head office: what every branch still has to restock, what is asked for and what is on
 * the way, and whether the main branch holds enough to cover it (Docs/decisions/0002,
 * 0012). Same cards as a branch's Restock; read-only, the branches raise the requests.
 */
export function NetworkStockAlerts() {
  const [step, setStep] = useState<RestockStep>('TODO');
  const [category, setCategory] = useState('');
  const [branchId, setBranchId] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading, isFetching, refetch } = useNetworkStockAlerts({ filter: 'NEEDS_RESTOCK', category: category || undefined, q: search.trim() || undefined });
  const inBranch = <T extends { branch: { branch_id: string } }>(rows: T[]) => rows.filter((r) => !branchId || r.branch.branch_id === branchId);
  const lists = restockLists(inBranch(data?.rows ?? []), inBranch(data?.requested ?? []));
  const rows = lists[step];
  const current = RESTOCK_STEPS.find((s) => s.key === step)!;
  const mainName = data?.branches.find((b) => b.is_main)?.name ?? 'Main';
  const todo = step === 'TODO';

  return (
    <StockPage
      title="Restock"
      scope="All branches"
      refreshing={isFetching}
      onRefresh={() => void refetch()}
      search={search}
      onSearch={setSearch}
      placeholder="Search items by name, SKU, or category..."
    >
      <StatusCards
        steps={RESTOCK_STEPS}
        value={step}
        onChange={setStep}
        loading={isLoading}
        counts={{ TODO: lists.TODO.length, REQUESTED: lists.REQUESTED.length, ON_THE_WAY: lists.ON_THE_WAY.length }}
        sub={{ TODO: outNote(lists.TODO) }}
      />

      <BoardSection
        title={current.title}
        count={rows.length}
        actions={
          <>
            <label className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Branch:</span>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={selectCls}>
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
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
                <option value="">All Categories</option>
                {(data?.categories ?? []).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
      >
        <div className="flex-1 overflow-x-auto">
          <table className={TABLE}>
            <thead className={THEAD}>
              <tr>
                <th className={TH}>Branch</th>
                <th className={TH}>Item</th>
                <th className={`${TH} text-right`}>Free</th>
                <th className={`${TH} text-right`}>Minimum</th>
                <th className={`${TH} text-right`}>{todo ? 'Short by' : 'Requested'}</th>
                {todo ? <th className={`${TH} text-right`}>{mainName} has</th> : <th className={TH}>Request</th>}
                {todo && <th className={TH}>Status</th>}
              </tr>
            </thead>
            <tbody className={TBODY}>
              {isLoading && <BoardMessageRow colSpan={7}>Loading…</BoardMessageRow>}
              {!isLoading && rows.length === 0 && <BoardMessageRow colSpan={7}>{search.trim() || category || branchId ? 'No items match.' : current.empty}</BoardMessageRow>}
              {!isLoading &&
                rows.map((r) => (
                  <tr key={`${r.branch.branch_id}:${r.item_id}`} className="transition-colors hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 font-bold text-slate-900">
                        {r.branch.name}
                        {r.branch.is_main && <MainBadge />}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="font-bold text-slate-900">{r.name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        <span className="font-mono">{r.sku}</span> · {r.category}
                      </div>
                    </td>
                    <td className={`whitespace-nowrap px-6 py-4 text-right font-bold tabular-nums ${r.severity === 'CRITICAL' ? 'text-red-600' : 'text-amber-600'}`}>
                      {formatQty(r.free)} <span className="text-xs font-normal text-slate-400">{r.unit}</span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-slate-500">{formatQty(r.reorder_level)}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-right font-bold tabular-nums text-slate-900">
                      {formatQty(todo ? r.deficit : (r.open_request?.qty ?? 0))}
                    </td>
                    {todo ? (
                      <td className="whitespace-nowrap px-6 py-4 text-right tabular-nums">
                        {r.main_stock === null ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <span className={r.main_stock >= r.deficit ? 'font-semibold text-emerald-700' : 'text-slate-500'}>{formatQty(r.main_stock)}</span>
                        )}
                      </td>
                    ) : (
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {r.open_request?.transfer_numbers.map((n) => (
                            <IdChip key={n}>{n}</IdChip>
                          ))}
                        </div>
                      </td>
                    )}
                    {todo && (
                      <td className="whitespace-nowrap px-6 py-4">
                        <StockLevelBadge level={r.level} />
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </BoardSection>
    </StockPage>
  );
}
