import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { InventoryQuery, StockLevel } from '@erp/shared';
import { MainBadge } from '@/shared/components/MainBadge';
import { BoardSection, StatusCards, type StatusStep } from '@/shared/components/StatusBoard';
import { TONES } from '@/shared/lib/status-tones';
import { useNetworkInventory, type NetworkStockRowDto } from '@/modules/inventory/hooks/useInventory';
import { selectCls } from './StockBadges';
import { BoardMessageRow, StockPage, TABLE, TBODY, TH, THEAD } from './StockPage';
import { formatQty } from '@/modules/stock-transfers/lib/transfer';

const CELL_STYLE: Record<StockLevel, string> = {
  OUT: 'bg-red-50 text-red-700',
  LOW: 'bg-amber-50 text-amber-800',
  HEALTHY: 'text-slate-900',
};

type LookUp = 'ALL' | 'BOOKED' | 'BELOW_MIN';

// Same look-up cards as one branch's Stock Levels, across the network (Docs/decisions/0012)
const LOOK_UPS: StatusStep<LookUp>[] = [
  { key: 'ALL', title: 'All items', icon: 'package', empty: 'No branch keeps stock yet.', tone: TONES.slate },
  { key: 'BOOKED', title: 'Booked somewhere', icon: 'clipboardList', empty: 'Nothing is held for open orders.', tone: TONES.violet },
  { key: 'BELOW_MIN', title: 'Below minimum somewhere', icon: 'alertTriangle', empty: 'Every branch is above its minimums.', tone: TONES.amber },
];

const matchesLookUp: Record<LookUp, (r: NetworkStockRowDto) => boolean> = {
  ALL: () => true,
  BOOKED: (r) => Object.values(r.stocks).some((s) => s.reserved > 0),
  BELOW_MIN: (r) => r.level !== 'HEALTHY',
};

/**
 * Head office: every branch's stock in one table (Docs/decisions/0002). Main branch
 * is the first column. A row's status is its worst branch, so a shortage anywhere
 * shows up under Below minimum. Read-only: clicking a cell opens that branch's details.
 */
export function NetworkInventory({ onInspect }: { onInspect: (itemId: string, branchId: string) => void }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<InventoryQuery['sort']>('NAME');
  const [lookUp, setLookUp] = useState<LookUp>('ALL');

  const { data, isLoading, isFetching, refetch } = useNetworkInventory({ q: search.trim() || undefined, category: category || undefined, status: 'ALL', sort });
  const branches = data?.branches ?? [];
  const all = data?.rows ?? [];
  const rows = all.filter(matchesLookUp[lookUp]);
  const current = LOOK_UPS.find((l) => l.key === lookUp)!;
  const colSpan = branches.length + 2;

  return (
    <StockPage
      title="Stock Levels"
      scope="All branches"
      refreshing={isFetching}
      onRefresh={() => void refetch()}
      search={search}
      onSearch={setSearch}
      placeholder="Search items by name, SKU, or category..."
    >
      <StatusCards
        steps={LOOK_UPS}
        value={lookUp}
        onChange={(key) => (key === 'BELOW_MIN' ? void navigate({ to: '/stock-alerts' }) : setLookUp(key))}
        loading={isLoading}
        counts={Object.fromEntries(LOOK_UPS.map((l) => [l.key, all.filter(matchesLookUp[l.key]).length]))}
        sub={{ BELOW_MIN: 'Open Restock →' }}
        arrowAfter={() => false}
      />

      <BoardSection
        title={current.title}
        count={rows.length}
        actions={
          <>
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
          </>
        }
      >
        <div className="flex-1 overflow-x-auto">
        <table className={TABLE}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Item</th>
              {branches.map((b) => (
                <th key={b.branch_id} className={`px-4 py-3 text-right ${b.is_main ? 'bg-amber-50/60' : ''}`}>
                  <span className="inline-flex items-center gap-1.5">
                    {b.name}
                    {b.is_main && <MainBadge />}
                  </span>
                </th>
              ))}
              <th className="px-6 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className={TBODY}>
            {isLoading ? (
              <BoardMessageRow colSpan={colSpan}>Loading…</BoardMessageRow>
            ) : rows.length === 0 ? (
              <BoardMessageRow colSpan={colSpan}>{search.trim() || category ? 'No items found.' : current.empty}</BoardMessageRow>
            ) : (
              rows.map((row) => (
                <tr key={row.item_id} className="transition-colors hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-6 py-4">
                    <p className="font-bold text-slate-900">{row.name}</p>
                    <div className="mt-0.5 text-xs text-slate-500">
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
                  <td className="whitespace-nowrap px-6 py-4 text-right font-bold tabular-nums text-slate-900">{formatQty(row.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </BoardSection>
    </StockPage>
  );
}
