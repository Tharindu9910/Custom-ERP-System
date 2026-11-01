import { useEffect, useMemo, useRef, useState } from 'react';
import { hardwareLineTotal } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { Modal } from '@/shared/components/Modal';
import { Notice } from '@/shared/components/Notice';
import { apiError, newRequestId } from '@/shared/api/errors';
import { usePermission } from '@/shared/hooks/usePermission';
import { formatRs } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { HardwareCheckout } from '@/modules/hardware/components/HardwareCheckout';
import { useHardwareStore, usePlaceHardwareSale, type HardwareStoreItem, type HardwareStoreView } from '@/modules/hardware/hooks/useHardware';

interface CartLine {
  item: HardwareStoreItem;
  quantity: number;
}

/** How Place Order works for this user and branch (Docs/decisions/0006). */
type PlaceMode = 'SEND' | 'PAY_NOW' | 'ADVANCE';

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, ''));
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** "25*nut", "25 x nut" — POS-style quantity prefix in the search box. */
const QTY_PREFIX = /^\s*(\d+(?:\.\d{1,3})?)\s*[*xX]\s*(.*)$/;

/**
 * Hardware Store (prototype HardwareStore.tsx). Browse the branch's hardware, build a
 * sale and place it. A supervisor sends it to the cashier unpaid; a cashier takes the
 * full payment for their own branch, or an advance when ordering for another branch.
 */
export function HardwareStorePage() {
  const { can } = usePermission();
  const canPay = can('process', 'payment');
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const { data, isLoading, isFetching, refetch } = useHardwareStore(branchId);

  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [rawCart, setCart] = useState<CartLine[]>([]);
  const [undo, setUndo] = useState<CartLine[] | null>(null);
  const [cursor, setCursor] = useState(0);
  const [flash, setFlash] = useState<{ id: string; at: number } | null>(null);
  const lineRefs = useRef(new Map<string, HTMLLIElement>());
  const [checkingOut, setCheckingOut] = useState(false);
  const place = usePlaceHardwareSale();
  const sendRequestId = useRef(newRequestId());
  const [sendError, setSendError] = useState<string | null>(null);
  const [switchTo, setSwitchTo] = useState<boolean>(false);
  const [done, setDone] = useState<string | null>(null);
  const [short, setShort] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  const branch = data?.branch;
  const mode: PlaceMode = branch && !branch.is_own ? 'ADVANCE' : canPay ? 'PAY_NOW' : 'SEND';

  // '/' focuses search, as in the prototype
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Cart lines read the latest stock and price from live refreshes
  const items = useMemo(() => data?.items ?? [], [data]);
  const cart = useMemo(() => {
    const byId = new Map(items.map((i) => [i.item_id, i]));
    return rawCart.map((l) => ({ ...l, item: byId.get(l.item.item_id) ?? l.item }));
  }, [rawCart, items]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) counts.set(i.category ?? 'Other', (counts.get(i.category ?? 'Other') ?? 0) + 1);
    return [['All', items.length] as const, ...[...counts.entries()].sort(([a], [b]) => a.localeCompare(b))];
  }, [items]);

  const prefix = QTY_PREFIX.exec(search);
  const prefixQty = prefix ? Number(prefix[1]) : null;
  const query = (prefix ? prefix[2] : search).trim().toLowerCase();

  const shown = useMemo(() => {
    const matches = items.filter(
      (i) => (category === 'All' || (i.category ?? 'Other') === category) && (!query || i.name.toLowerCase().includes(query) || i.sku.toLowerCase().includes(query)),
    );
    // An exact SKU (e.g. from a barcode scanner) goes first so Enter picks it
    const exact = matches.findIndex((i) => i.sku.toLowerCase() === query);
    return exact > 0 ? [matches[exact]!, ...matches.filter((_, n) => n !== exact)] : matches;
  }, [items, category, query]);

  // Bring the line just added into view and flash it
  useEffect(() => {
    const el = flash && lineRefs.current.get(flash.id);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    el.animate([{ backgroundColor: '#dbeafe' }, { backgroundColor: 'transparent' }], { duration: 800, easing: 'ease-out' });
  }, [flash]);

  const inCart = (id: string) => cart.find((l) => l.item.item_id === id)?.quantity ?? 0;
  const total = cart.reduce((s, l) => s + hardwareLineTotal(l.item.price, l.quantity), 0);
  const totalQty = round3(cart.reduce((s, l) => s + l.quantity, 0));

  const addToCart = (item: HardwareStoreItem, qty: number) => {
    if (!(qty > 0)) return;
    setDone(null);
    setSendError(null);
    setShort(new Set());
    setFlash({ id: item.item_id, at: Date.now() });
    setCart((c) => {
      const existing = c.find((l) => l.item.item_id === item.item_id);
      if (existing) return c.map((l) => (l.item.item_id === item.item_id ? { ...l, quantity: round3(l.quantity + qty) } : l));
      return [...c, { item, quantity: round3(qty) }];
    });
  };
  /** One tap = one unit, or whatever is left of a decimal-stock item. */
  const addOne = (item: HardwareStoreItem) => addToCart(item, Math.min(1, round3(item.available - inCart(item.item_id))));

  const finishSale = (msg: string) => {
    setCheckingOut(false);
    setCart([]);
    setUndo(null);
    setDone(msg);
  };
  const markShort = (ids: string[]) => {
    setCheckingOut(false);
    setShort(new Set(ids));
  };

  /** Supervisor: no checkout — the sale goes straight to the cashier's Hardware Queue, unpaid. */
  const sendToQueue = async () => {
    setSendError(null);
    try {
      const res = await place.mutateAsync({
        client_request_id: sendRequestId.current,
        lines: cart.map((l) => ({ item_id: l.item.item_id, quantity: l.quantity })),
      });
      sendRequestId.current = newRequestId();
      finishSale(`${res.order_number} sent to the Hardware Queue — ${formatRs(res.total)} to collect at the cashier.`);
    } catch (e) {
      const err = apiError(e);
      const shortages = (err.details as { shortages?: { item_id: string }[] } | undefined)?.shortages;
      if (err.code === 'STK_001' && shortages) return markShort(shortages.map((s) => s.item_id));
      setSendError(err.message);
    }
  };

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') return setSearch('');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      return setCursor((c) => Math.min(Math.max(c + step, 0), Math.max(shown.length - 1, 0)));
    }
    if (e.key !== 'Enter') return;
    const pick = shown[cursor];
    if (!pick || !query) return;
    if (prefixQty !== null) addToCart(pick, prefixQty);
    else if (pick.available - inCart(pick.item_id) > 0) addOne(pick);
    else return;
    setSearch('');
    setCursor(0);
  };
  const setQty = (id: string, qty: number) => {
    setSendError(null);
    setShort(new Set());
    setCart((c) => (qty <= 0 ? c.filter((l) => l.item.item_id !== id) : c.map((l) => (l.item.item_id === id ? { ...l, quantity: round3(qty) } : l))));
  };
  const clearCart = () => {
    setUndo(cart);
    setCart([]);
    setShort(new Set());
  };

  return (
    <div className="-m-8 flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-slate-50 text-slate-900">
      <header className="shrink-0 border-b border-slate-200 bg-white px-8 py-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Hardware Store</h1>
              <button
                type="button"
                onClick={() => void refetch()}
                title="Refresh stock"
                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <Icon name="refresh" className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {/* <p className="text-sm text-slate-500">
              {mode === 'SEND'
                ? 'Build the sale and send it to the cashier for payment.'
                : mode === 'ADVANCE'
                  ? `Ordering from ${branch?.name}: take an advance here, the balance is collected there.`
                  : 'Counter sale — take payment and hand over the goods.'}
            </p> */}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2">
              <span className={cn('h-2.5 w-2.5 rounded-full', branch?.is_own === false ? 'bg-blue-500' : 'animate-pulse bg-emerald-500')} />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{branch?.is_own === false ? 'Ordering from' : 'Current branch'}</div>
                <div className="text-sm font-bold text-slate-900">{branch?.name ?? '…'}</div>
              </div>
            </div>
            {!checkingOut && (data?.branches.length ?? 0) > 1 && (
              <button type="button" onClick={() => setSwitchTo(true)} className="btn-secondary">
                <Icon name="arrowRightLeft" className="h-4 w-4" /> Change branch
              </button>
            )}
          </div>
        </div>
      </header>

      {checkingOut && data ? (
        <main className="flex min-h-0 flex-1 flex-col p-8">
          <HardwareCheckout
            view={data}
            advance={mode === 'ADVANCE'}
            lines={cart}
            total={total}
            onBack={() => setCheckingOut(false)}
            onShort={markShort}
            onPlaced={finishSale}
          />
        </main>
      ) : (
        <>
        <div className="flex shrink-0 flex-col gap-3 border-b border-slate-200 bg-white px-8 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-1.5 overflow-x-auto">
            {categories.map(([name, count]) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setCategory(name);
                  setCursor(0);
                }}
                className={cn(
                  'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
                  category === name ? 'bg-[#0033A0] text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {name} <span className={cn('ml-1 text-xs', category === name ? 'text-blue-100' : 'text-slate-400')}>{count}</span>
              </button>
            ))}
          </div>
          <div className="relative w-full lg:max-w-sm">
            <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCursor(0);
              }}
              onKeyDown={onSearchKey}
              placeholder="Search or SKU, Enter adds · 5*bolt adds 5 (press /)"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#0033A0] focus:bg-white"
            />
            {query && shown[cursor] && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 truncate rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white shadow">
                Enter adds {fmtQty(prefixQty ?? 1)} × {shown[cursor].name}
                <span className="text-slate-400"> · ↑↓ to choose</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <main className="min-h-0 flex-1 overflow-y-auto p-6">
            {done && (
              <div className="mb-4">
                <Notice tone="success">{done}</Notice>
              </div>
            )}
            {isLoading ? (
              <p className="py-16 text-center text-slate-400">Loading items…</p>
            ) : shown.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                {items.length === 0 ? `${branch?.name ?? 'This branch'} has no hardware items in stock.` : 'No items match your search.'}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {shown.map((i, n) => {
                  const qty = inCart(i.item_id);
                  const left = round3(i.available - qty);
                  const out = i.available <= 0;
                  const low = !out && left <= i.reorder_level;
                  const active = !!query && n === cursor;
                  return (
                    <div
                      key={i.item_id}
                      role="button"
                      tabIndex={left > 0 ? 0 : -1}
                      aria-disabled={left <= 0}
                      aria-label={`Add ${i.name}`}
                      onClick={() => left > 0 && addOne(i)}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && left > 0) {
                          e.preventDefault();
                          addOne(i);
                        }
                      }}
                      className={cn(
                        'relative flex select-none flex-col rounded-xl border bg-white p-4 text-left shadow-sm outline-none transition-all focus-visible:ring-2 focus-visible:ring-[#0033A0]',
                        out
                          ? 'cursor-not-allowed border-slate-100 opacity-60'
                          : left > 0
                            ? 'cursor-pointer border-slate-200 hover:border-[#0033A0] hover:shadow-md active:scale-[0.98]'
                            : 'cursor-not-allowed border-slate-200',
                        qty > 0 && 'border-[#0033A0] ring-1 ring-[#0033A0]',
                        active && 'ring-2 ring-amber-400',
                      )}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{i.category ?? 'Other'}</span>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[11px] font-bold',
                            left <= 0 ? 'bg-rose-50 text-rose-700' : low ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
                          )}
                        >
                          {left <= 0 ? 'None left' : `${fmtQty(left)} left`}
                        </span>
                      </div>
                      <div className="line-clamp-2 min-h-10 font-semibold text-slate-900">{i.name}</div>
                      <div className="font-mono text-xs text-slate-400">{i.sku}</div>
                      <div className="mt-3 flex items-end justify-between">
                        <div>
                          <div className="text-lg font-bold text-slate-900">{formatRs(i.price)}</div>
                          <div className="text-xs text-slate-400">per {i.unit}</div>
                        </div>
                        {qty > 0 ? (
                          <div role="group" aria-label={`${i.name} quantity`} onClick={(e) => e.stopPropagation()} className="flex items-center rounded-lg bg-[#0033A0] text-white">
                            <button type="button" onClick={() => setQty(i.item_id, round3(qty - 1))} title="One less" className="flex h-8 w-8 items-center justify-center rounded-l-lg hover:bg-blue-900">
                              <Icon name={qty <= 1 ? 'trash' : 'minus'} className="h-4 w-4" />
                            </button>
                            <span className="min-w-8 px-1 text-center text-sm font-bold tabular-nums">{fmtQty(qty)}</span>
                            <button
                              type="button"
                              onClick={() => addOne(i)}
                              disabled={left <= 0}
                              title="One more"
                              className="flex h-8 w-8 items-center justify-center rounded-r-lg hover:bg-blue-900 disabled:opacity-40"
                            >
                              <Icon name="plus" className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg text-white', left > 0 ? 'bg-[#0033A0]' : 'bg-slate-300')}>
                            <Icon name="plus" className="h-4 w-4" />
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>

          <aside className="flex w-96 shrink-0 flex-col border-l border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="font-bold text-slate-900">
                This Sale{' '}
                <span className="ml-1 text-sm font-semibold text-slate-400">
                  {cart.length} {cart.length === 1 ? 'line' : 'lines'}
                  {cart.length > 0 && ` · ${fmtQty(totalQty)} units`}
                </span>
              </h2>
              {cart.length > 0 ? (
                <button onClick={clearCart} className="text-sm font-semibold text-slate-500 hover:text-red-600">
                  Clear
                </button>
              ) : (
                undo && (
                  <button
                    onClick={() => {
                      setCart(undo);
                      setUndo(null);
                    }}
                    className="text-sm font-semibold text-blue-600 hover:underline"
                  >
                    Undo clear
                  </button>
                )
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-slate-400">
                  <Icon name="packageOpen" className="h-8 w-8" />
                  <span>Nothing added yet</span>
                  <span className="text-xs">
                    Tap an item to add one. For many, type the quantity here or search <kbd className="rounded bg-slate-100 px-1 font-mono">5*bolt</kbd>.
                  </span>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {cart.map((l) => {
                    const over = l.quantity > l.item.available;
                    return (
                      <li
                        key={l.item.item_id}
                        ref={(el) => {
                          if (el) lineRefs.current.set(l.item.item_id, el);
                          else lineRefs.current.delete(l.item.item_id);
                        }}
                        className={cn(
                          'px-5 py-3',
                          (over || short.has(l.item.item_id)) && 'bg-rose-50',
                        )}
                      >
                        <div className="flex justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-900">{l.item.name}</div>
                            <div className="text-xs text-slate-500">
                              {formatRs(l.item.price)} / {l.item.unit}
                            </div>
                          </div>
                          <div className="whitespace-nowrap font-bold text-slate-900">{formatRs(hardwareLineTotal(l.item.price, l.quantity))}</div>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setQty(l.item.item_id, l.quantity - 1)} className="rounded-md border border-slate-200 p-1 hover:bg-slate-50">
                              <Icon name="minus" className="h-3.5 w-3.5" />
                            </button>
                            <QtyInput key={`${l.item.item_id}-${l.quantity}`} value={l.quantity} label={`${l.item.name} quantity`} onCommit={(q) => setQty(l.item.item_id, q)} />
                            <button
                              onClick={() => setQty(l.item.item_id, l.quantity + 1)}
                              disabled={l.quantity + 1 > l.item.available}
                              className="rounded-md border border-slate-200 p-1 hover:bg-slate-50 disabled:opacity-40"
                            >
                              <Icon name="plus" className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <button onClick={() => setQty(l.item.item_id, 0)} className="p-1 text-slate-400 hover:text-red-600" title="Remove">
                            <Icon name="trash" className="h-4 w-4" />
                          </button>
                        </div>
                        {(over || short.has(l.item.item_id)) && (
                          <p className="mt-1 text-xs font-semibold text-rose-700">Only {fmtQty(l.item.available)} available — reduce the quantity.</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="space-y-2 border-t border-slate-200 p-5">
              <div className="flex justify-between text-sm text-slate-500">
                <span>Items</span>
                <span>{fmtQty(totalQty)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold text-slate-900">
                <span>Total</span>
                <span>{formatRs(total)}</span>
              </div>
              {sendError && <Notice tone="error">{sendError}</Notice>}
              <button
                onClick={() => (mode === 'SEND' ? void sendToQueue() : setCheckingOut(true))}
                disabled={cart.length === 0 || cart.some((l) => l.quantity > l.item.available) || place.isPending}
                className="btn-primary mt-2 w-full justify-center py-3 text-base"
              >
                {place.isPending ? 'Sending…' : 'Place Order'}
              </button>
            </div>
          </aside>
        </div>
        </>
      )}

      {switchTo && data && (
        <BranchDialog
          view={data}
          hasCart={cart.length > 0}
          onClose={() => setSwitchTo(false)}
          onPick={(id) => {
            setSwitchTo(false);
            if (id === data.branch.branch_id) return;
            setCart([]);
            setUndo(null);
            setDone(null);
            setBranchId(data.branches.find((b) => b.branch_id === id)?.is_own ? undefined : id);
          }}
        />
      )}
    </div>
  );
}

/**
 * Type-in quantity for a cart line (bulk entry without a dialog). Commits on Enter or
 * blur; Esc reverts; 0 or empty removes the line. Decimals for kg / length items.
 * Re-mounted (via key) whenever the line's quantity changes elsewhere.
 */
function QtyInput({ value, label, onCommit }: { value: number; label: string; onCommit: (qty: number) => void }) {
  const [draft, setDraft] = useState(fmtQty(value));
  const commit = () => {
    const q = round3(Number(draft || 0));
    if (q !== value) onCommit(q);
  };
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={draft}
      onFocus={(e) => e.target.select()}
      onChange={(e) => /^\d*\.?\d{0,3}$/.test(e.target.value) && setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(fmtQty(value));
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
      className="w-16 rounded-md border border-slate-200 py-0.5 text-center text-sm font-semibold tabular-nums outline-none focus:border-[#0033A0] focus:ring-1 focus:ring-[#0033A0]"
    />
  );
}

/** Cashiers with the cross-branch permission can order from another branch's stock. */
function BranchDialog({ view, hasCart, onClose, onPick }: { view: HardwareStoreView; hasCart: boolean; onClose: () => void; onPick: (branchId: string) => void }) {
  const [picked, setPicked] = useState(view.branch.branch_id);
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title="Change branch"
      // subtitle="Orders for another branch take an advance here; the balance is collected there."
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={() => onPick(picked)} className="btn-primary">
            Continue
          </button>
        </>
      }
    >
      <div className="space-y-2">
        {view.branches.map((b) => (
          <label
            key={b.branch_id}
            className={cn(
              'flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3',
              picked === b.branch_id ? 'border-[#0033A0] bg-blue-50' : 'border-slate-200 hover:bg-slate-50',
            )}
          >
            <span className="flex items-center gap-3">
              <input type="radio" checked={picked === b.branch_id} onChange={() => setPicked(b.branch_id)} />
              <span className="font-semibold text-slate-900">{b.name}</span>
            </span>
            {b.is_own && <span className="text-xs font-semibold text-emerald-700">Your branch</span>}
          </label>
        ))}
        {hasCart && picked !== view.branch.branch_id && <Notice tone="warning">Switching clears the current sale, since stock differs by branch.</Notice>}
      </div>
    </Modal>
  );
}
