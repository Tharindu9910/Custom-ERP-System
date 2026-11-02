import { useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { toBranchDate } from '@erp/shared';
import { apiError, newRequestId } from '@/shared/api/errors';
import { IdChip } from '@/shared/components/Marks';
import { Notice } from '@/shared/components/Notice';
import { BoardSection, StatusCards } from '@/shared/components/StatusBoard';
import { branchOptionLabel } from '@/shared/lib/branch';
import { useBranchContext } from '@/shared/hooks/useBranchContext';
import { useCanTransact } from '@/shared/hooks/useCanTransact';
import { usePageScope } from '@/shared/hooks/usePageScope';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAuthStore } from '@/shared/stores/auth.store';
import { NetworkStockAlerts } from '@/modules/inventory/components/NetworkStockAlerts';
import { StockLevelBadge, fieldCls, selectCls } from '@/modules/inventory/components/StockBadges';
import { BoardMessageRow, StockPage, TABLE, TBODY, TH, THEAD } from '@/modules/inventory/components/StockPage';
import { useStockAlerts, type AlertRowDto } from '@/modules/inventory/hooks/useInventory';
import { RESTOCK_STEPS, outNote, restockLists, type RestockStep } from '@/modules/inventory/lib/restock';
import { useCreateTransfer, useTransferTargets } from '@/modules/stock-transfers/hooks/useStockTransfers';
import { encodeRequestItems, formatQty } from '@/modules/stock-transfers/lib/transfer';

/** Head office with "All branches" sees every branch's shortages; everyone else one branch. */
export function StockAlertsPage() {
  const { isGlobal } = usePageScope();
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  return isGlobal && !activeBranchId ? <NetworkStockAlerts /> : <BranchStockAlerts />;
}

/**
 * Restock (Docs/decisions/0012): the branch's to-do list of items below their minimum
 * (BR06: own stock only), like Odoo's Replenishment. Tick items, adjust the quantity and
 * send the request from here; asked-for items move on to Requested, then On the way.
 */
function BranchStockAlerts() {
  const navigate = useNavigate();
  const { can } = usePermission();
  const { featureOn } = useBranchContext();
  const canTransact = useCanTransact();
  const mayRequest = canTransact && can('request', 'stock') && featureOn('stockRequest');

  const [step, setStep] = useState<RestockStep>('TODO');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  /** item_id → quantity to ask for */
  const [picked, setPicked] = useState<Map<string, number>>(new Map());
  const [done, setDone] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useStockAlerts({ filter: 'NEEDS_RESTOCK', category: category || undefined, q: search.trim() || undefined });
  const lists = restockLists(data?.rows ?? [], data?.requested ?? []);
  const rows = lists[step];
  const current = RESTOCK_STEPS.find((s) => s.key === step)!;
  const todo = step === 'TODO';
  const selectable = todo && mayRequest;
  const filtered = !!category || !!search.trim();

  const suggested = (r: AlertRowDto) => Math.max(1, r.deficit);
  const allPicked = lists.TODO.length > 0 && lists.TODO.every((r) => picked.has(r.item_id));
  const pickedRows = lists.TODO.filter((r) => picked.has(r.item_id));

  const toggle = (r: AlertRowDto) =>
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(r.item_id)) next.delete(r.item_id);
      else next.set(r.item_id, suggested(r));
      return next;
    });
  const toggleAll = () => setPicked(allPicked ? new Map() : new Map(lists.TODO.map((r) => [r.item_id, suggested(r)])));
  const setQty = (id: string, qty: number) => setPicked((prev) => new Map(prev).set(id, qty));

  const openRequests = (r: AlertRowDto) => void navigate({ to: '/stock-requests', search: { tab: r.open_request?.status === 'SENT' ? 'toReceive' : 'waiting' } });
  // "More options": the New Request popup with the ticked items, for a note or more items
  const openFullForm = () =>
    void navigate({
      to: '/stock-requests',
      search: { tab: 'waiting', new: true, items: encodeRequestItems(pickedRows.map((r) => ({ item_id: r.item_id, quantity: picked.get(r.item_id) ?? suggested(r) }))) },
    });

  const colSpan = 6;

  return (
    <StockPage
      title="Restock"
      refreshing={isFetching}
      onRefresh={() => void refetch()}
      search={search}
      onSearch={setSearch}
      placeholder="Search items by name, SKU, or category..."
    >
      {done && <Notice tone="success">{done}</Notice>}

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
        }
      >
        <div className="flex-1 overflow-x-auto">
          <table className={TABLE}>
            <thead className={THEAD}>
              <tr>
                {selectable ? (
                  <th className="w-10 py-3 pl-6 pr-2">
                    <input
                      type="checkbox"
                      checked={allPicked}
                      disabled={lists.TODO.length === 0}
                      onChange={toggleAll}
                      aria-label="Select all items to restock"
                      className="h-4 w-4 rounded border-slate-300 accent-blue-600 disabled:opacity-30"
                    />
                  </th>
                ) : (
                  <th className="w-0 p-0" />
                )}
                <th className={TH}>Item</th>
                <th className={`${TH} text-right`}>Free</th>
                <th className={`${TH} text-right`}>Minimum</th>
                <th className={`${TH} text-right`}>{todo ? (mayRequest ? 'Ask for' : 'Need') : 'Requested'}</th>
                <th className={TH}>{todo ? 'Status' : 'Request'}</th>
              </tr>
            </thead>
            <tbody className={TBODY}>
              {isLoading && <BoardMessageRow colSpan={colSpan}>Loading…</BoardMessageRow>}
              {!isLoading && rows.length === 0 && (
                <BoardMessageRow colSpan={colSpan}>
                  {filtered ? (
                    <>
                      No items match.{' '}
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
                  const on = picked.has(row.item_id);
                  return (
                    <tr
                      key={row.item_id}
                      onClick={selectable ? () => toggle(row) : todo ? undefined : () => openRequests(row)}
                      className={`transition-colors ${selectable || !todo ? 'cursor-pointer' : ''} ${on ? 'bg-blue-50/50' : 'hover:bg-slate-50/70'}`}
                    >
                      {selectable ? (
                        <td className="py-4 pl-6 pr-2">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(row)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select ${row.name}`}
                            className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                          />
                        </td>
                      ) : (
                        <td className="w-0 p-0" />
                      )}
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="font-bold text-slate-900">{row.name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          <span className="font-mono">{row.sku}</span> · {row.category}
                        </div>
                      </td>
                      <td className={`whitespace-nowrap px-6 py-4 text-right font-bold tabular-nums ${row.severity === 'CRITICAL' ? 'text-red-600' : 'text-amber-600'}`}>
                        {formatQty(row.free)} <span className="text-xs font-normal text-slate-400">{row.unit}</span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right text-slate-500">{formatQty(row.reorder_level)}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-right" onClick={(e) => on && e.stopPropagation()}>
                        {!todo ? (
                          <span className="font-bold text-slate-900">{formatQty(row.open_request?.qty ?? 0)}</span>
                        ) : mayRequest && on ? (
                          <input
                            type="number"
                            min={0.001}
                            step="any"
                            value={picked.get(row.item_id)}
                            onChange={(e) => setQty(row.item_id, Math.max(0, Number(e.target.value) || 0))}
                            aria-label={`Quantity of ${row.name}`}
                            className={`${fieldCls} w-24 py-1 text-right font-bold`}
                          />
                        ) : (
                          <span className="font-bold text-slate-900">{formatQty(suggested(row))}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        {todo ? (
                          <StockLevelBadge level={row.level} />
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {row.open_request?.transfer_numbers.map((n) => (
                              <IdChip key={n}>{n}</IdChip>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

      </BoardSection>

      {/* Outside the board (its frame clips overflow), so it stays pinned to the bottom of the screen while scrolling */}
      {selectable && pickedRows.length > 0 && (
        <SendBar
          rows={pickedRows.map((r) => ({ item_id: r.item_id, quantity: picked.get(r.item_id) ?? 0 }))}
          onMoreOptions={openFullForm}
          onClear={() => setPicked(new Map())}
          onSent={(message) => {
            setPicked(new Map());
            setDone(message);
          }}
        />
      )}
    </StockPage>
  );
}

/**
 * Sends the picked items as one request, without leaving Restock. The supplier defaults to
 * the main branch (targets come main first); notes and extra items are in the full form.
 */
function SendBar({
  rows,
  onMoreOptions,
  onClear,
  onSent,
}: {
  rows: { item_id: string; quantity: number }[];
  onMoreOptions: () => void;
  onClear: () => void;
  onSent: (message: string) => void;
}) {
  const { data: targets = [] } = useTransferTargets();
  const create = useCreateTransfer();
  const requestId = useRef(newRequestId());
  const [askBranch, setAskBranch] = useState('');
  const [neededBefore, setNeededBefore] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const asked = targets.find((t) => t.branch_id === askBranch) ?? targets[0];
  const lines = rows.filter((r) => r.quantity > 0);
  const units = lines.reduce((s, r) => s + r.quantity, 0);
  const missing = [!asked && 'no branch takes requests', !neededBefore && 'pick a "needed by" date', lines.length === 0 && 'enter a quantity'].filter(Boolean) as string[];

  const send = async () => {
    if (missing.length > 0 || !asked) return;
    try {
      const t = await create.mutateAsync({
        client_request_id: requestId.current,
        supplying_branch_id: asked.branch_id,
        needed_before: neededBefore,
        is_urgent: urgent,
        lines,
      });
      requestId.current = newRequestId();
      setError(null);
      onSent(`Request ${t.transfer_number} sent to ${t.supplying_branch.name}.`);
    } catch (e) {
      setError(apiError(e).message);
    }
  };

  const small = `${fieldCls} py-1.5 text-xs font-semibold`;
  return (
    <div className="sticky bottom-4 z-20 rounded-xl border border-slate-200 bg-white/95 px-6 py-3 shadow-lg backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-700">
          <strong>
            {rows.length} item{rows.length > 1 ? 's' : ''}
          </strong>
          <span className="text-slate-400"> · {formatQty(units)} units</span>
          <button onClick={onClear} className="ml-3 text-xs font-semibold text-slate-500 hover:text-slate-800">
            Clear
          </button>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500">Ask</span>
            <select value={asked?.branch_id ?? ''} onChange={(e) => setAskBranch(e.target.value)} className={small}>
              {targets.length === 0 && <option value="">No branch takes requests</option>}
              {targets.map((b) => (
                <option key={b.branch_id} value={b.branch_id}>
                  {branchOptionLabel(b)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500">
              Needed by <span className="text-red-500">*</span>
            </span>
            <input type="date" value={neededBefore} min={toBranchDate()} onChange={(e) => setNeededBefore(e.target.value)} aria-label="Needed by date" className={small} />
          </label>
          <label
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${urgent ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-300 text-slate-600'}`}
          >
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="h-3.5 w-3.5 accent-red-600" />
            Urgent
          </label>
          <button onClick={onMoreOptions} className="btn-secondary" title="Add a note or more items">
            More options
          </button>
          <button
            onClick={() => void send()}
            disabled={missing.length > 0 || create.isPending}
            title={missing.length > 0 ? `To send: ${missing.join(', ')}` : undefined}
            className="btn-primary"
          >
            {create.isPending ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </div>
      {error && (
        <Notice tone="error" className="mt-2">
          {error}
        </Notice>
      )}
    </div>
  );
}
