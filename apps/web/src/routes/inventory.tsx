import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { STOCK_LEVEL_LABEL, suggestedRequestQty, type InventoryQuery, type MovementType, type StockLevel } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { Modal } from '@/shared/components/Modal';
import { SearchInput } from '@/shared/components/SearchInput';
import { SegmentedTabs } from '@/shared/components/SegmentedTabs';
import { useBranchContext } from '@/shared/hooks/useBranchContext';
import { useCanTransact } from '@/shared/hooks/useCanTransact';
import { usePageScope } from '@/shared/hooks/usePageScope';
import { useAuthStore } from '@/shared/stores/auth.store';
import { NetworkInventory } from '@/modules/inventory/components/NetworkInventory';
import { usePermission } from '@/shared/hooks/usePermission';
import { formatDateTime } from '@/shared/lib/format';
import { useInventory, useInventoryItem, type StockRowDto } from '@/modules/inventory/hooks/useInventory';
import { encodeRequestItems, formatQty } from '@/modules/stock-transfers/lib/transfer';

const LEVEL_STYLE: Record<StockLevel, string> = {
  OUT: 'bg-red-50 text-red-700 border-red-200',
  LOW: 'bg-amber-50 text-amber-800 border-amber-200',
  HEALTHY: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};
const LEVEL_TEXT: Record<StockLevel, string> = { OUT: 'text-red-600', LOW: 'text-amber-600', HEALTHY: 'text-slate-900' };

const MOVEMENT_LABEL: Record<MovementType, string> = {
  SALE: 'Sold',
  JOB_USAGE: 'Used on a job',
  JOB_REVERSAL: 'Job reversed',
  TRANSFER_OUT: 'Sent to a branch',
  TRANSFER_IN: 'Received from a branch',
  TRANSFER_RETURN: 'Returned',
  ADJUSTMENT: 'Adjustment',
  OVERRIDE: 'Used with override',
  LEGACY_OPENING: 'Opening stock',
};

const selectCls = 'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500';

/** Head office with "All branches" gets the network table; everyone else one branch. */
export function InventoryPage() {
  const { isGlobal } = usePageScope();
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const [inspect, setInspect] = useState<{ itemId: string; branchId: string } | null>(null);
  if (isGlobal && !activeBranchId) {
    return (
      <>
        <NetworkInventory onInspect={(itemId, branchId) => setInspect({ itemId, branchId })} />
        {inspect && (
          <ItemDetailsModal
            itemId={inspect.itemId}
            branchId={inspect.branchId}
            canRequest={false}
            onClose={() => setInspect(null)}
            onRequest={() => {}}
            onViewRequest={() => {}}
          />
        )}
      </>
    );
  }
  return <BranchInventory />;
}

/**
 * Inventory (prototype): this branch's stock only (BR06). Lookup screen;
 * restocking starts from Stock Alerts or the Details popup.
 */
function BranchInventory() {
  const navigate = useNavigate();
  const { can } = usePermission();
  const { featureOn } = useBranchContext();
  const canTransact = useCanTransact();
  const canRequest = canTransact && can('request', 'stock') && featureOn('stockRequest');

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<InventoryQuery['status']>('ALL');
  const [sort, setSort] = useState<InventoryQuery['sort']>('NAME');
  const [inspectId, setInspectId] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useInventory({ q: search.trim() || undefined, category: category || undefined, status, sort });
  const rows = data?.rows ?? [];
  const c = data?.counts;
  const filtered = status !== 'ALL' || !!category || !!search;

  const openRequests = () => void navigate({ to: '/stock-requests', search: { tab: 'ours' } });
  const requestItem = (row: StockRowDto) =>
    void navigate({
      to: '/stock-requests',
      search: { tab: 'create', items: encodeRequestItems([{ item_id: row.item_id, quantity: suggestedRequestQty(row.stock, row.reorder_level) }]) },
    });

  return (
    <div className="-m-8 flex min-h-[calc(100vh-4rem)] flex-col bg-slate-50 text-slate-900 antialiased">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Inventory</h1>
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
                    { key: 'HEALTHY', label: 'Healthy', count: c?.healthy },
                    { key: 'LOW', label: 'Low', count: c?.low },
                    { key: 'OUT', label: 'Out of stock', count: c?.out },
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
                    <option value="STOCK_DESC">Stock (High to Low)</option>
                    <option value="STOCK_ASC">Stock (Low to High)</option>
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
                  <th className="px-4 py-3.5 text-right">On hand</th>
                  <th className="px-4 py-3.5 text-right">Reserved</th>
                  <th className="px-4 py-3.5 text-right">Available</th>
                  <th className="px-4 py-3.5 text-right">Minimum</th>
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
                      <p className="font-semibold text-slate-600">No items found</p>
                      <p className="mt-1 text-xs text-slate-400">Try a different search or clear the filters.</p>
                      {filtered && (
                        <button
                          onClick={() => {
                            setStatus('ALL');
                            setCategory('');
                            setSearch('');
                          }}
                          className="mt-3 rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Clear Filters
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.item_id} className={`transition-colors hover:bg-slate-50/70 ${row.level === 'OUT' ? 'bg-red-50/20' : ''}`}>
                      <td className="whitespace-nowrap px-6 py-3.5">
                        <button onClick={() => setInspectId(row.item_id)} className="text-left font-semibold text-slate-900 hover:text-blue-600">
                          {row.name}
                        </button>
                        <div className="mt-0.5 text-xs text-slate-400">
                          <span className="font-mono">{row.sku}</span> · {row.category}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right">
                        <span className={`text-base font-bold ${LEVEL_TEXT[row.level]}`}>{formatQty(row.stock)}</span>
                        <span className="ml-1 text-xs text-slate-400">{row.unit}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right text-xs text-slate-500">{row.reserved > 0 ? formatQty(row.reserved) : '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold text-slate-700">{formatQty(row.available)}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right text-xs text-slate-500">{formatQty(row.reorder_level)}</td>
                      <td className="whitespace-nowrap px-4 py-3.5">
                        <span className={`inline-block rounded border px-2.5 py-0.5 text-xs font-bold ${LEVEL_STYLE[row.level]}`}>{STOCK_LEVEL_LABEL[row.level]}</span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {row.open_request && (
                            <button
                              onClick={openRequests}
                              title="Open Stock Requests"
                              className={`text-xs font-bold hover:underline ${row.open_request.status === 'SENT' ? 'text-blue-700' : 'text-amber-700'}`}
                            >
                              {row.open_request.status === 'SENT'
                                ? `+${formatQty(row.open_request.qty)} on the way`
                                : `Requested ${formatQty(row.open_request.qty)} · Waiting`}
                            </button>
                          )}
                          <button
                            onClick={() => setInspectId(row.item_id)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {inspectId && (
        <ItemDetailsModal
          itemId={inspectId}
          canRequest={canRequest}
          onClose={() => setInspectId(null)}
          onRequest={requestItem}
          onViewRequest={openRequests}
        />
      )}
    </div>
  );
}

function ItemDetailsModal({
  itemId,
  branchId,
  canRequest,
  onClose,
  onRequest,
  onViewRequest,
}: {
  itemId: string;
  /** Head office looking at one branch's cell; omitted = the active branch */
  branchId?: string;
  canRequest: boolean;
  onClose: () => void;
  onRequest: (row: StockRowDto) => void;
  onViewRequest: () => void;
}) {
  const { data: item, isLoading } = useInventoryItem(itemId, branchId);
  const open = item?.open_request;

  return (
    <Modal
      open
      size="md"
      onClose={onClose}
      title={item?.name ?? 'Item'}
      subtitle={
        item ? (
          <>
            <span className="font-mono">{item.sku}</span> · {item.category} · per {item.unit}
          </>
        ) : undefined
      }
      footer={
        <>
          <button onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
            Close
          </button>
          {item && canRequest &&
            (open ? (
              <button onClick={onViewRequest} className="rounded-lg border border-blue-300 bg-white px-5 py-2.5 text-sm font-bold text-blue-700 transition-colors hover:bg-blue-50">
                View request
              </button>
            ) : (
              <button onClick={() => onRequest(item)} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700">
                Request from another branch
              </button>
            ))}
        </>
      }
    >
      {isLoading || !item ? (
        <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <div className="space-y-5 text-sm">
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-center sm:grid-cols-5">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">On hand</span>
              <span className={`mt-1 block text-lg font-bold ${LEVEL_TEXT[item.level]}`}>{formatQty(item.stock)}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Reserved</span>
              <span className="mt-1 block text-lg font-bold text-slate-900">{formatQty(item.reserved)}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Available</span>
              <span className="mt-1 block text-lg font-bold text-slate-900">{formatQty(item.available)}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Minimum</span>
              <span className="mt-1 block text-lg font-bold text-slate-900">{formatQty(item.reorder_level)}</span>
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</span>
              <span className={`mt-1.5 inline-block rounded border px-2 py-0.5 text-xs font-bold ${LEVEL_STYLE[item.level]}`}>{STOCK_LEVEL_LABEL[item.level]}</span>
            </div>
          </div>

          {open && (
            <p className={`rounded-lg border p-3 text-xs ${open.status === 'SENT' ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
              {open.status === 'SENT' ? (
                <>
                  <strong>{formatQty(open.qty)} on the way</strong> to {branchId ? 'this branch' : 'your branch'} ({open.transfer_numbers.join(', ')}). Receive it in Stock Requests when it arrives.
                </>
              ) : (
                <>
                  <strong>Already requested ({formatQty(open.qty)})</strong> and waiting for the other branch to send ({open.transfer_numbers.join(', ')}).
                </>
              )}
            </p>
          )}

          {item.reservations.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Held for open orders</h4>
              <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                {item.reservations.map((r) => (
                  <div key={r.reservation_id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {r.order_number}
                        <span className="ml-1.5 font-mono text-xs font-normal text-slate-500">{r.line_number}</span>
                      </p>
                      <p className="truncate text-[11px] text-slate-400">
                        Since {formatDateTime(r.created_at)}
                        {r.shortfall > 0 && ` · ${formatQty(r.shortfall)} short (override)`}
                      </p>
                    </div>
                    <span className="shrink-0 font-bold tabular-nums text-slate-700">{formatQty(r.quantity)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Recent movements</h4>
            {item.movements.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">No stock movements yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                {item.movements.map((m) => (
                  <div key={m.movement_id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {MOVEMENT_LABEL[m.movement_type]}
                        {m.document_number && <span className="ml-1.5 font-mono text-xs font-normal text-slate-500">{m.document_number}</span>}
                      </p>
                      <p className="truncate text-[11px] text-slate-400">
                        {formatDateTime(m.moved_at)}
                        {m.created_by_name && ` · ${m.created_by_name}`}
                        {m.reason && ` · ${m.reason}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`font-bold tabular-nums ${m.quantity < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        {m.quantity > 0 ? '+' : ''}
                        {formatQty(m.quantity)}
                      </span>
                      <p className="text-[11px] text-slate-400">left {formatQty(m.quantity_after)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
