import { useDeferredValue, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { toBranchDate } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { SectionTitle } from '@/shared/components/DetailParts';
import { Modal } from '@/shared/components/Modal';
import { Notice } from '@/shared/components/Notice';
import { fieldCls } from '@/modules/inventory/components/StockBadges';
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
 * New Request popup (Docs/decisions/0012, like Odoo's "New" transfer form). Items handed
 * over from Restock ("More options") are loaded first, so the form can start from them.
 */
export function NewRequestModal({ prefill, onClose, onCreated }: { prefill?: string; onClose: () => void; onCreated: (t: TransferDto) => void }) {
  const wanted = decodeRequestItems(prefill);
  const { data: items, isLoading } = useTransferItems({ ids: wanted.map((w) => w.item_id) }, wanted.length > 0);
  if (wanted.length > 0 && (isLoading || !items)) {
    return (
      <Modal open size="lg" fixedHeight onClose={onClose} title="New stock request">
        <div className="py-16 text-center text-sm text-slate-400">Loading items…</div>
      </Modal>
    );
  }

  const initial: DraftLine[] = wanted.flatMap((w) => {
    const item = items?.find((i) => i.item_id === w.item_id);
    // Skip items that already have an open request; the server would refuse them
    return item && !item.open_request ? [{ item, quantity: w.quantity }] : [];
  });
  return <NewRequestForm key={prefill ?? ''} initial={initial} onClose={onClose} onCreated={onCreated} />;
}

/** Small uppercase label above a field, as in the other stock popups. */
function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </p>
      {children}
    </div>
  );
}

function NewRequestForm({ initial, onClose, onCreated }: { initial: DraftLine[]; onClose: () => void; onCreated: (t: TransferDto) => void }) {
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
    <Modal
      open
      size="lg"
      fixedHeight
      onClose={onClose}
      title="New stock request"
      subtitle="Ask another branch for stock. They check what they can send; you receive it when it arrives."
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-3">
          <p className="mr-auto text-xs leading-snug">
            {missing.length > 0 ? (
              <span className="font-semibold text-amber-700">To send, {missing.join(' and ')}.</span>
            ) : (
              <span className="text-slate-600">
                <strong className="text-slate-900">
                  {valid.length} item{valid.length > 1 ? 's' : ''}
                </strong>{' '}
                ({formatQty(units)} total) from <strong className="text-slate-900">{asked?.name}</strong> by{' '}
                <strong className="text-slate-900">{formatLocalDate(neededBefore)}</strong>
                {urgent && <span className="ml-1 font-bold text-red-600">· Urgent</span>}
              </span>
            )}
          </p>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form="new-request-form" disabled={missing.length > 0 || create.isPending} className="btn-primary">
            {create.isPending ? 'Sending…' : 'Send Request'}
          </button>
        </div>
      }
    >
      <form id="new-request-form" onSubmit={(e) => void submit(e)} className="space-y-5">
        {/* Who sends, by when, urgent */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Request from" required>
            <select value={asked?.branch_id ?? ''} onChange={(e) => setAskBranch(e.target.value)} aria-label="Request from" className={`${fieldCls} w-full`}>
              {targets.length === 0 && <option value="">No branch takes requests</option>}
              {targets.map((b) => (
                <option key={b.branch_id} value={b.branch_id}>
                  {branchOptionLabel(b)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Needed by" required>
            <input type="date" value={neededBefore} min={today} onChange={(e) => setNeededBefore(e.target.value)} aria-label="Needed by date" className={`${fieldCls} w-full`} />
          </Field>
          <Field label="Priority">
            <label
              className={`flex h-[38px] cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                urgent ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="h-3.5 w-3.5 accent-red-600" />
              Urgent
            </label>
          </Field>
        </div>

        {/* Items */}
        <div>
          <SectionTitle title="Items" count={lines.length}>
            {lines.length > 0 && (
              <button type="button" onClick={clearAll} className="ml-auto text-xs font-semibold text-slate-400 hover:text-red-600">
                Clear all
              </button>
            )}
          </SectionTitle>
          {prefilledCount !== null && lines.length > 0 && (
            <Notice tone="info" className="mb-3">
              {prefilledCount} item{prefilledCount > 1 ? 's' : ''} from Restock added. Check the amounts and send.
            </Notice>
          )}
          <div ref={searchBoxRef} className="relative mb-3">
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
              className={`${fieldCls} w-full pl-9`}
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

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Item</th>
                  <th className="px-4 py-3 text-right">We have</th>
                  <th className="px-4 py-3 text-right">Minimum</th>
                  <th className="w-44 px-4 py-3 text-center">Request qty</th>
                  <th className="w-10 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                      No items yet. Search above, or pick items in Restock.
                    </td>
                  </tr>
                ) : (
                  lines.map(({ item, quantity }) => (
                    <tr key={item.item_id}>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{item.name}</div>
                        <div className="mt-0.5 font-mono text-xs text-slate-500">{item.sku}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatQty(item.stock)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-500">{formatQty(item.reorder_level)}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="flex items-center overflow-hidden rounded-lg border border-slate-300">
                            <button
                              type="button"
                              onClick={() => setQty(item.item_id, quantity - 1)}
                              disabled={quantity <= 1}
                              className="px-1.5 py-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
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
                              className="px-1.5 py-1.5 text-slate-500 hover:bg-slate-100"
                              aria-label={`More ${item.name}`}
                            >
                              <Icon name="plus" className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <span className="w-12 text-xs text-slate-500">{unitLabel(quantity, item.unit)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => remove(item.item_id)} className="p-1 text-slate-300 hover:text-red-600" aria-label={`Remove ${item.name}`} title="Remove">
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Field label="Note for the other branch">
          <textarea value={remarks} maxLength={500} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional" aria-label="Note" className={`${fieldCls} min-h-16 w-full`} />
        </Field>

        {error && <Notice tone="error">{error}</Notice>}
      </form>
    </Modal>
  );
}
