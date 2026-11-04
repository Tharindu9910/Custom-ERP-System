import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { InventoryQuery, MovementType } from '@erp/shared';
import { SectionTitle, Stat, StatStrip } from '@/shared/components/DetailParts';
import { Icon } from '@/shared/components/Icon';
import { Modal } from '@/shared/components/Modal';
import { Notice } from '@/shared/components/Notice';
import { BoardSection, StatusCards, type StatusStep } from '@/shared/components/StatusBoard';
import { apiError } from '@/shared/api/errors';
import { useBranchContext } from '@/shared/hooks/useBranchContext';
import { useCanTransact } from '@/shared/hooks/useCanTransact';
import { usePageScope } from '@/shared/hooks/usePageScope';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAuthStore } from '@/shared/stores/auth.store';
import { formatDateTime } from '@/shared/lib/format';
import { TONES } from '@/shared/lib/status-tones';
import { NetworkInventory } from '@/modules/inventory/components/NetworkInventory';
import { OpenRequestBadge, StockLevelBadge, fieldCls, selectCls } from '@/modules/inventory/components/StockBadges';
import { LEVEL_TEXT } from '@/modules/inventory/lib/stock-level';
import { BoardMessageRow, StockPage, TABLE, TBODY, TH, THEAD } from '@/modules/inventory/components/StockPage';
import { useInventory, useInventoryItem, useSetMinimum, type StockRowDto } from '@/modules/inventory/hooks/useInventory';
import { ItemForm } from '@/modules/items/components/ItemForm';
import { ItemRequestsModal } from '@/modules/items/components/ItemRequestsModal';
import { useItemRequestCount } from '@/modules/items/hooks/useItemRequests';
import { formatQty } from '@/modules/stock-transfers/lib/transfer';

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
  TRANSIT_SHORTAGE: 'Lost in transit (approved)',
};

/** Head office with "All branches" gets the network table; everyone else one branch. */
export function InventoryPage() {
  const { isGlobal } = usePageScope();
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const [inspect, setInspect] = useState<{ itemId: string; branchId: string } | null>(null);
  if (isGlobal && !activeBranchId) {
    return (
      <>
        <NetworkInventory onInspect={(itemId, branchId) => setInspect({ itemId, branchId })} />
        {inspect && <ItemDetailsModal itemId={inspect.itemId} branchId={inspect.branchId} onClose={() => setInspect(null)} />}
      </>
    );
  }
  return <BranchInventory />;
}

/** Booked = held for open orders + booked beyond stock, so on hand − booked = free. */
const booked = (r: Pick<StockRowDto, 'stock' | 'free'>) => Math.round((r.stock - r.free) * 1000) / 1000;

type LookUp = 'ALL' | 'BOOKED' | 'ON_THE_WAY' | 'BELOW_MIN';

// Look-up views, like the filters on Odoo's Stock report (Docs/decisions/0012). Not lifecycle steps, so no arrows.
const LOOK_UPS: StatusStep<LookUp>[] = [
  { key: 'ALL', title: 'All items', icon: 'package', empty: 'This branch keeps no stock yet.', tone: TONES.slate },
  { key: 'BOOKED', title: 'Booked', icon: 'clipboardList', empty: 'Nothing is held for open orders.', tone: TONES.violet },
  { key: 'ON_THE_WAY', title: 'Requested', icon: 'truck', empty: 'No item is waiting on a stock request.', tone: TONES.blue },
  { key: 'BELOW_MIN', title: 'Below minimum', icon: 'alertTriangle', empty: 'Every item is above its minimum.', tone: TONES.amber },
];

const matchesLookUp: Record<LookUp, (r: StockRowDto) => boolean> = {
  ALL: () => true,
  BOOKED: (r) => booked(r) > 0,
  ON_THE_WAY: (r) => !!r.open_request,
  BELOW_MIN: (r) => r.level !== 'HEALTHY',
};

/**
 * Stock Levels (Docs/decisions/0012): this branch's stock only (BR06). A look-up report,
 * like Odoo's Stock report: what we have, what is booked, what is free. Acting on
 * shortages happens in Restock; moving stock in Stock Requests.
 */
function BranchInventory() {
  const navigate = useNavigate();
  const { can } = usePermission();
  const { featureOn } = useBranchContext();
  const canTransact = useCanTransact();
  const canRestock = can('view', 'stock_alerts') && featureOn('stockAlerts');
  const canSetMinimum = canTransact && can('configure', 'stock_minimum');
  // New catalogue products (Docs/decisions/0013): a supervisor asks, the branch manager decides
  const canAskItem = canTransact && can('request', 'new_item');
  const canApproveItems = canTransact && can('approve', 'item_request');
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const pendingItems = useItemRequestCount(canApproveItems, activeBranchId).data ?? 0;
  const [itemDialog, setItemDialog] = useState<'new' | 'requests' | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<InventoryQuery['sort']>('NAME');
  const [lookUp, setLookUp] = useState<LookUp>('ALL');
  const [inspectId, setInspectId] = useState<string | null>(null);

  // One call; the cards and their lists are worked out here (no call per card)
  const { data, isLoading, isFetching, refetch } = useInventory({ q: search.trim() || undefined, category: category || undefined, status: 'ALL', sort });
  const all = data?.rows ?? [];
  const rows = all.filter(matchesLookUp[lookUp]);
  const current = LOOK_UPS.find((l) => l.key === lookUp)!;
  const filtered = !!category || !!search.trim();

  const pick = (key: LookUp) => {
    // Shortages are acted on in Restock, the one to-do list
    if (key === 'BELOW_MIN' && canRestock) return void navigate({ to: '/stock-alerts' });
    setLookUp(key);
  };
  const openRequests = () => void navigate({ to: '/stock-requests', search: { tab: 'waiting' } });

  return (
    <StockPage
      title="Stock Levels"
      refreshing={isFetching}
      onRefresh={() => void refetch()}
      search={search}
      onSearch={setSearch}
      placeholder="Search items by name, SKU, or category..."
      actions={
        <>
          <button onClick={() => setItemDialog('requests')} className="btn-secondary whitespace-nowrap">
            Item requests
            {pendingItems > 0 && <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{pendingItems}</span>}
          </button>
          {canAskItem && (
            <button onClick={() => setItemDialog('new')} className="btn-primary whitespace-nowrap">
              <Icon name="plus" className="h-4 w-4" />
              New item
            </button>
          )}
        </>
      }
    >
      {done && <Notice tone="success">{done}</Notice>}

      <StatusCards
        steps={LOOK_UPS}
        value={lookUp}
        onChange={pick}
        loading={isLoading}
        counts={Object.fromEntries(LOOK_UPS.map((l) => [l.key, all.filter(matchesLookUp[l.key]).length]))}
        sub={canRestock ? { BELOW_MIN: 'Open Restock →' } : undefined}
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
                <option value="STOCK_DESC">Free (High to Low)</option>
                <option value="STOCK_ASC">Free (Low to High)</option>
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
                <th className={`${TH} text-right`}>On hand</th>
                <th className={`${TH} text-right`} title="Held for open orders, plus anything booked beyond stock">
                  Booked
                </th>
                <th className={`${TH} text-right`} title="On hand minus booked: what new work can use. The status follows it.">
                  Free
                </th>
                <th className={`${TH} text-right`}>Minimum</th>
                <th className={TH}>Status</th>
                <th className="w-10 px-6 py-3" />
              </tr>
            </thead>
            <tbody className={TBODY}>
              {isLoading && <BoardMessageRow colSpan={7}>Loading…</BoardMessageRow>}
              {!isLoading && rows.length === 0 && (
                <BoardMessageRow colSpan={7}>
                  {filtered ? (
                    <>
                      No items found.{' '}
                      <button
                        onClick={() => {
                          setSearch('');
                          setCategory('');
                        }}
                        className="font-semibold text-blue-600 hover:underline"
                      >
                        Clear filters
                      </button>
                    </>
                  ) : (
                    current.empty
                  )}
                </BoardMessageRow>
              )}
              {!isLoading &&
                rows.map((row) => {
                  const b = booked(row);
                  return (
                    <tr key={row.item_id} onClick={() => setInspectId(row.item_id)} className="cursor-pointer transition-colors hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="font-bold text-slate-900">{row.name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          <span className="font-mono">{row.sku}</span> · {row.category}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-slate-700">
                        {formatQty(row.stock)} <span className="text-xs text-slate-400">{row.unit}</span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-slate-500">{b !== 0 ? formatQty(b) : '—'}</td>
                      <td className={`whitespace-nowrap px-6 py-4 text-right font-bold tabular-nums ${LEVEL_TEXT[row.level]}`}>{formatQty(row.free)}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-slate-500">{formatQty(row.reorder_level)}</td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <StockLevelBadge level={row.level} />
                          {row.open_request && (
                            <OpenRequestBadge status={row.open_request.status}>
                              {row.open_request.status === 'SENT' ? `+${formatQty(row.open_request.qty)} on the way` : 'Requested'}
                            </OpenRequestBadge>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-slate-300">
                        <Icon name="chevronRight" className="inline h-4 w-4" />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </BoardSection>

      {itemDialog === 'new' && (
        <ItemForm
          mode={canApproveItems ? 'direct' : 'request'}
          onClose={() => setItemDialog(null)}
          onDone={(message) => {
            setItemDialog(null);
            setDone(message);
          }}
        />
      )}
      {itemDialog === 'requests' && (
        <ItemRequestsModal
          canApprove={canApproveItems}
          canCancel={canAskItem}
          onClose={() => setItemDialog(null)}
          onDone={(message) => {
            setItemDialog(null);
            setDone(message);
          }}
        />
      )}
      {inspectId && (
        <ItemDetailsModal
          itemId={inspectId}
          canSetMinimum={canSetMinimum}
          onClose={() => setInspectId(null)}
          onRestock={canRestock ? () => void navigate({ to: '/stock-alerts' }) : undefined}
          onViewRequest={openRequests}
        />
      )}
    </StockPage>
  );
}

function ItemDetailsModal({
  itemId,
  branchId,
  canSetMinimum = false,
  onClose,
  onRestock,
  onViewRequest,
}: {
  itemId: string;
  /** Head office looking at one branch's cell; omitted = the active branch */
  branchId?: string;
  /** Branch manager (Docs/decisions/0012) */
  canSetMinimum?: boolean;
  onClose: () => void;
  /** Shortages are acted on in Restock, the one place requests start from */
  onRestock?: () => void;
  onViewRequest?: () => void;
}) {
  const { data: item, isLoading } = useInventoryItem(itemId, branchId);
  const open = item?.open_request;
  const needsRestock = !!item && item.level !== 'HEALTHY' && !open;

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
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
          {open && onViewRequest && (
            <button onClick={onViewRequest} className="btn-secondary">
              View request
            </button>
          )}
          {needsRestock && onRestock && (
            <button onClick={onRestock} className="btn-primary">
              Go to Restock
            </button>
          )}
        </>
      }
    >
      {isLoading || !item ? (
        <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <div className="space-y-5 text-sm">
          <StatStrip>
            <Stat label="On hand" value={formatQty(item.stock)} />
            <Stat label="Booked" value={formatQty(booked(item))} />
            <Stat label="Free" value={formatQty(item.free)} tone={LEVEL_TEXT[item.level]} />
            <Stat label="Status" value={<StockLevelBadge level={item.level} />} />
          </StatStrip>

          <MinimumRow itemId={itemId} unit={item.unit} value={item.reorder_level} editable={canSetMinimum} />

          {open && (
            <Notice tone={open.status === 'SENT' ? 'info' : 'warning'}>
              {open.status === 'SENT' ? (
                <>
                  <strong>{formatQty(open.qty)} on the way</strong> to {branchId ? 'this branch' : 'your branch'} ({open.transfer_numbers.join(', ')}). Receive it in Stock Requests when it arrives.
                </>
              ) : (
                <>
                  <strong>Already requested ({formatQty(open.qty)})</strong> and waiting for the other branch to send ({open.transfer_numbers.join(', ')}).
                </>
              )}
            </Notice>
          )}

          {item.reservations.length > 0 && (
            <div>
              <SectionTitle title="Held for open orders" count={item.reservations.length} />
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
            <SectionTitle title="Recent movements" />
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

/** The minimum Restock works from. The branch manager changes it here (Docs/decisions/0012). */
function MinimumRow({ itemId, unit, value, editable }: { itemId: string; unit: string; value: number; editable: boolean }) {
  const save = useSetMinimum(itemId);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const next = draft === null || draft.trim() === '' ? NaN : Number(draft);
  const valid = Number.isFinite(next) && next >= 0;

  const submit = async () => {
    if (!valid) return;
    try {
      await save.mutateAsync({ reorder_level: next });
      setDraft(null);
      setError(null);
    } catch (e) {
      setError(apiError(e).message);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Minimum</p>
          <p className="text-xs text-slate-400">Restock lists the item when free stock (on hand − booked) falls to this.</p>
        </div>
        {draft === null ? (
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold tabular-nums text-slate-900">
              {formatQty(value)} <span className="text-xs font-normal text-slate-400">{unit}</span>
            </span>
            {editable && (
              <button onClick={() => setDraft(String(value))} className="btn-secondary">
                Change
              </button>
            )}
          </div>
        ) : (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input
              type="number"
              min={0}
              step="any"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="New minimum"
              className={`${fieldCls} w-24 text-right font-bold`}
            />
            <button type="button" onClick={() => {
                setDraft(null);
                setError(null);
              }} className="px-2 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800">
              Cancel
            </button>
            <button type="submit" disabled={!valid || save.isPending} className="btn-primary">
              {save.isPending ? 'Saving…' : 'Save'}
            </button>
          </form>
        )}
      </div>
      {error && (
        <Notice tone="error" className="mt-2">
          {error}
        </Notice>
      )}
    </div>
  );
}
