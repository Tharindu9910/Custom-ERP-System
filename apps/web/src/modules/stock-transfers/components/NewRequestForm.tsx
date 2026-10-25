import { useDeferredValue, useEffect, useRef, useState, type FormEvent } from 'react';
import { toBranchDate } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { Notice } from '@/shared/components/Notice';
import { apiError, newRequestId } from '@/shared/api/errors';
import { formatLocalDate } from '@/shared/lib/format';
import { useCreateTransfer, useTransferItems, useTransferTargets, type TransferDto, type TransferItemOption } from '../hooks/useStockTransfers';
import { branchOptionLabel } from '@/shared/lib/branch';
import { decodeRequestItems, formatQty, unitLabel } from '../lib/transfer';

interface DraftLine {
  item: TransferItemOption;
  quantity: number;
}

/**
 * New Request tab. Items handed over from Inventory / Stock Alerts are loaded
 * first, so the form can start from them.
 */
export function NewRequestTab({ prefill, onCreated }: { prefill?: string; onCreated: (t: TransferDto) => void }) {
  const wanted = decodeRequestItems(prefill);
  const { data: items, isLoading } = useTransferItems({ ids: wanted.map((w) => w.item_id) }, wanted.length > 0);
  if (wanted.length > 0 && (isLoading || !items)) return <div className="flex-1 py-16 text-center text-sm text-slate-400">Loading items…</div>;

  const initial: DraftLine[] = wanted.flatMap((w) => {
    const item = items?.find((i) => i.item_id === w.item_id);
    // Skip items that already have an open request; the server would refuse them
    return item && !item.open_request ? [{ item, quantity: w.quantity }] : [];
  });
  return <NewRequestForm key={prefill ?? ''} initial={initial} onCreated={onCreated} />;
}

function NewRequestForm({ initial, onCreated }: { initial: DraftLine[]; onCreated: (t: TransferDto) => void }) {
  const { data: targets = [] } = useTransferTargets();
  const create = useCreateTransfer();
  const requestId = useRef(newRequestId());

  const [askBranch, setAskBranch] = useState('');
  const [neededBefore, setNeededBefore] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<DraftLine[]>(initial);
  const [prefilledCount, setPrefilledCount] = useState<number | null>(initial.length > 0 ? initial.length : null);
  const [itemQuery, setItemQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  const deferredQuery = useDeferredValue(itemQuery.trim());
  const { data: results = [] } = useTransferItems({ q: deferredQuery }, showResults);
  // Targets come main branch first, so the default supplier is the distribution branch
  const asked = targets.find((t) => t.branch_id === askBranch) ?? targets[0];
  const today = toBranchDate();

  // Close the search results when clicking outside
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const addItem = (item: TransferItemOption) => {
    if (item.open_request) return;
    setLines((prev) =>
      prev.some((l) => l.item.item_id === item.item_id)
        ? prev.map((l) => (l.item.item_id === item.item_id ? { ...l, quantity: l.quantity + 1 } : l))
        : [...prev, { item, quantity: 1 }],
    );
    setItemQuery('');
    setShowResults(false);
    setError(null);
  };
  const setQty = (id: string, qty: number) => setLines((prev) => prev.map((l) => (l.item.item_id === id ? { ...l, quantity: Math.max(0, qty) } : l)));
  const remove = (id: string) => setLines((prev) => prev.filter((l) => l.item.item_id !== id));
  const clearAll = () => {
    setLines([]);
    setPrefilledCount(null);
  };

  const valid = lines.filter((l) => l.quantity > 0);
  const units = valid.reduce((s, l) => s + l.quantity, 0);
  const missing = [!asked && 'choose a branch', valid.length === 0 && 'add an item', !neededBefore && 'pick a date'].filter(Boolean) as string[];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (missing.length > 0 || !asked) return;
    try {
      const t = await create.mutateAsync({
        client_request_id: requestId.current,
        supplying_branch_id: asked.branch_id,
        needed_before: neededBefore,
        is_urgent: urgent,
        notes: remarks.trim() || undefined,
        lines: valid.map((l) => ({ item_id: l.item.item_id, quantity: l.quantity })),
      });
      requestId.current = newRequestId();
      onCreated(t);
    } catch (err) {
      setError(apiError(err).message);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="flex min-h-0 flex-1 flex-col">
      {/* Who sends, by when, urgent */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-slate-200 px-5 py-3">
        <label className="flex items-center gap-2">
          <span className="whitespace-nowrap text-xs font-semibold text-slate-500">Request from</span>
          <select
            value={asked?.branch_id ?? ''}
            onChange={(e) => setAskBranch(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {targets.length === 0 && <option value="">No branch takes requests</option>}
            {targets.map((b) => (
              <option key={b.branch_id} value={b.branch_id}>
                {branchOptionLabel(b)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="whitespace-nowrap text-xs font-semibold text-slate-500">
            Needed by <span className="text-rose-500">*</span>
          </span>
          <input
            type="date"
            value={neededBefore}
            min={today}
            onChange={(e) => setNeededBefore(e.target.value)}
            aria-label="Needed by date"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <label
          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
            urgent ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="h-3.5 w-3.5 accent-rose-600" />
          Urgent
        </label>
      </div>

      {/* Item search */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-2.5">
        <div ref={searchBoxRef} className="relative min-w-[240px] max-w-md flex-1">
          <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={itemQuery}
            onChange={(e) => {
              setItemQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const first = results.find((r) => !r.open_request);
                if (first) addItem(first);
              }
              if (e.key === 'Escape') setShowResults(false);
            }}
            placeholder="Add item — type name or SKU"
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {showResults && (
            <ul className="absolute left-0 right-0 z-20 mt-1 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {results.length === 0 ? (
                <li className="px-3 py-2.5 text-xs text-slate-500">{itemQuery ? `No item matches "${itemQuery}".` : 'Loading…'}</li>
              ) : (
                results.map((item) => {
                  const added = lines.some((l) => l.item.item_id === item.item_id);
                  return (
                    <li key={item.item_id}>
                      <button
                        type="button"
                        disabled={!!item.open_request}
                        onClick={() => addItem(item)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-blue-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-900">{item.name}</span>
                          <span className="block text-[11px] text-slate-400">
                            <span className="font-mono">{item.sku}</span> · Ours: {formatQty(item.stock)} {item.unit}
                          </span>
                        </span>
                        <span className={`shrink-0 text-[11px] font-bold ${item.open_request ? 'text-amber-700' : added ? 'text-slate-400' : 'text-blue-600'}`}>
                          {item.open_request ? (item.open_request.status === 'SENT' ? 'On the way' : 'Requested') : added ? '+1' : 'Add'}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>

        {prefilledCount !== null && lines.length > 0 && (
          <span className="flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
            {prefilledCount} low-stock item{prefilledCount > 1 ? 's' : ''} added — check amounts and send
            <button type="button" onClick={() => setPrefilledCount(null)} aria-label="Hide" className="text-blue-400 hover:text-blue-700">
              <Icon name="x" className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
        {lines.length > 0 && (
          <button type="button" onClick={clearAll} className="ml-auto text-xs font-semibold text-slate-400 hover:text-rose-600">
            Clear all
          </button>
        )}
      </div>

      {/* Items */}
      <div className="max-h-[calc(100vh-27rem)] min-h-[160px] flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <th className="w-8 py-2 pl-5 pr-2">#</th>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">We have</th>
              <th className="px-3 py-2 text-right">Minimum</th>
              <th className="w-44 px-3 py-2 text-center">Request qty</th>
              <th className="w-10 py-2 pl-3 pr-5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center">
                  <p className="text-sm font-semibold text-slate-600">No items yet</p>
                  <p className="mt-1 text-xs text-slate-400">Use the search box above, or pick items from Stock Alerts.</p>
                </td>
              </tr>
            ) : (
              lines.map(({ item, quantity }, idx) => (
                <tr key={item.item_id} className="hover:bg-slate-50/60">
                  <td className="py-2 pl-5 pr-2 text-xs text-slate-400">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <span className="font-semibold text-slate-900">{item.name}</span>
                    <span className="ml-2 font-mono text-[10px] text-slate-400">{item.sku}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">{formatQty(item.stock)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-400">{formatQty(item.reorder_level)}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-center gap-1.5">
                      <div className="flex items-center overflow-hidden rounded-md border border-slate-300">
                        <button
                          type="button"
                          onClick={() => setQty(item.item_id, quantity - 1)}
                          disabled={quantity <= 1}
                          className="px-1.5 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                          aria-label={`Less ${item.name}`}
                        >
                          <Icon name="minus" className="h-3.5 w-3.5" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={quantity || ''}
                          onChange={(e) => setQty(item.item_id, Number(e.target.value))}
                          aria-label={`Amount of ${item.name}`}
                          className="w-14 bg-white py-1 text-center text-sm font-bold text-slate-900 [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          onClick={() => setQty(item.item_id, quantity + 1)}
                          className="px-1.5 py-1 text-slate-500 hover:bg-slate-100"
                          aria-label={`More ${item.name}`}
                        >
                          <Icon name="plus" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="w-12 text-xs text-slate-500">{unitLabel(quantity, item.unit)}</span>
                    </div>
                  </td>
                  <td className="py-2 pl-3 pr-5 text-right">
                    <button type="button" onClick={() => remove(item.item_id)} className="p-1 text-slate-300 hover:text-rose-600" aria-label={`Remove ${item.name}`} title="Remove">
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {error && (
        <div className="px-5 pb-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {/* Note + summary + Send */}
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50/70 px-5 py-3">
        <input
          type="text"
          value={remarks}
          maxLength={500}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Note for the other branch (optional)"
          className="min-w-[220px] max-w-md flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="ml-auto flex flex-wrap items-center gap-4">
          <p className="text-right text-xs leading-snug">
            {missing.length > 0 ? (
              <span className="font-semibold text-amber-700">To send, {missing.join(' and ')}.</span>
            ) : (
              <span className="text-slate-600">
                <strong className="text-slate-900">
                  {valid.length} item{valid.length > 1 ? 's' : ''}
                </strong>{' '}
                ({formatQty(units)} total) from <strong className="text-slate-900">{asked?.name}</strong> by{' '}
                <strong className="text-slate-900">{formatLocalDate(neededBefore)}</strong>
                {urgent && <span className="ml-1 font-bold text-rose-600">· Urgent</span>}
              </span>
            )}
          </p>
          <button
            type="submit"
            disabled={missing.length > 0 || create.isPending}
            className="whitespace-nowrap rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
          >
            {create.isPending ? 'Sending…' : 'Send Request'}
          </button>
        </div>
      </div>
    </form>
  );
}
