import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_BRANCH_SETTINGS, PaymentMode, hardwareAdvanceRange, hardwareLineTotal } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { Modal } from '@/shared/components/Modal';
import { Notice } from '@/shared/components/Notice';
import { PaymentCapture } from '@/shared/components/PaymentCapture';
import { apiError, newRequestId } from '@/shared/api/errors';
import { useBranchContext } from '@/shared/hooks/useBranchContext';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import { usePermission } from '@/shared/hooks/usePermission';
import { formatRs, parseMoney } from '@/shared/lib/format';
import { emptyPaymentDraft, toPayment, validatePaymentDraft, type PaymentDraft } from '@/shared/lib/payment-draft';
import { cn } from '@/shared/lib/utils';
import { CustomerPhoneInput } from '@/modules/customers/components/CustomerPhoneInput';
import { FullPaymentFields } from '@/modules/hardware/components/FullPaymentFields';
import { fullPaymentError, type FullPaymentDraft } from '@/modules/hardware/lib/full-payment';
import { useHardwareStore, usePlaceHardwareSale, type HardwareStoreItem, type HardwareStoreView } from '@/modules/hardware/hooks/useHardware';

interface CartLine {
  item: HardwareStoreItem;
  quantity: number;
}

/** How Place Order works for this user and branch (Docs/decisions/0006). */
type PlaceMode = 'SEND' | 'PAY_NOW' | 'ADVANCE';

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, ''));
const round3 = (n: number) => Math.round(n * 1000) / 1000;

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
  const [picking, setPicking] = useState<HardwareStoreItem | null>(null);
  const [placing, setPlacing] = useState(false);
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

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (i) => (category === 'All' || (i.category ?? 'Other') === category) && (!q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q)),
    );
  }, [items, category, search]);

  const inCart = (id: string) => cart.find((l) => l.item.item_id === id)?.quantity ?? 0;
  const total = cart.reduce((s, l) => s + hardwareLineTotal(l.item.price, l.quantity), 0);
  const totalQty = round3(cart.reduce((s, l) => s + l.quantity, 0));

  const addToCart = (item: HardwareStoreItem, qty: number) => {
    setDone(null);
    setShort(new Set());
    setCart((c) => {
      const existing = c.find((l) => l.item.item_id === item.item_id);
      if (existing) return c.map((l) => (l.item.item_id === item.item_id ? { ...l, quantity: round3(l.quantity + qty) } : l));
      return [...c, { item, quantity: qty }];
    });
  };
  const setQty = (id: string, qty: number) => {
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
            {(data?.branches.length ?? 0) > 1 && (
              <button type="button" onClick={() => setSwitchTo(true)} className="btn-secondary">
                <Icon name="arrowRightLeft" className="h-4 w-4" /> Change branch
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex shrink-0 flex-col gap-3 border-b border-slate-200 bg-white px-8 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1.5 overflow-x-auto">
          {categories.map(([name, count]) => (
            <button
              key={name}
              type="button"
              onClick={() => setCategory(name)}
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
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setSearch('')}
            placeholder="Search items or SKU… (press /)"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#0033A0] focus:bg-white"
          />
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
              {shown.map((i) => {
                const left = round3(i.available - inCart(i.item_id));
                const out = i.available <= 0;
                const low = !out && i.available <= i.reorder_level;
                return (
                  <button
                    key={i.item_id}
                    type="button"
                    onClick={() => left > 0 && setPicking(i)}
                    disabled={left <= 0}
                    className={cn(
                      'flex flex-col rounded-xl border bg-white p-4 text-left shadow-sm transition-all',
                      left > 0 ? 'border-slate-200 hover:border-[#0033A0] hover:shadow-md' : 'cursor-not-allowed border-slate-100 opacity-60',
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{i.category ?? 'Other'}</span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-bold',
                          out ? 'bg-rose-50 text-rose-700' : low ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
                        )}
                      >
                        {out ? 'None left' : `${fmtQty(i.available)} left`}
                      </span>
                    </div>
                    <div className="line-clamp-2 min-h-10 font-semibold text-slate-900">{i.name}</div>
                    <div className="font-mono text-xs text-slate-400">{i.sku}</div>
                    <div className="mt-3 flex items-end justify-between">
                      <div>
                        <div className="text-lg font-bold text-slate-900">{formatRs(i.price)}</div>
                        <div className="text-xs text-slate-400">per {i.unit}</div>
                      </div>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0033A0] text-white">
                        <Icon name="plus" className="h-4 w-4" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </main>

        <aside className="flex w-96 shrink-0 flex-col border-l border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-bold text-slate-900">
              This Sale <span className="ml-1 text-sm font-semibold text-slate-400">{cart.length} items</span>
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
                Nothing added yet
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {cart.map((l) => {
                  const over = l.quantity > l.item.available;
                  return (
                    <li key={l.item.item_id} className={cn('px-5 py-3', (over || short.has(l.item.item_id)) && 'bg-rose-50')}>
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
                          <span className="w-14 text-center text-sm font-semibold">{fmtQty(l.quantity)}</span>
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
            <button
              onClick={() => setPlacing(true)}
              disabled={cart.length === 0 || cart.some((l) => l.quantity > l.item.available)}
              className="btn-primary mt-2 w-full justify-center py-3 text-base"
            >
              Place Order
            </button>
          </div>
        </aside>
      </div>

      {picking && (
        <QuantityDialog
          item={picking}
          max={round3(picking.available - inCart(picking.item_id))}
          onClose={() => setPicking(null)}
          onAdd={(q) => {
            addToCart(picking, q);
            setPicking(null);
          }}
        />
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
      {placing && data && (
        <PlaceOrderDialog
          view={data}
          mode={mode}
          cart={cart}
          total={total}
          onClose={() => setPlacing(false)}
          onShort={(ids) => {
            setPlacing(false);
            setShort(new Set(ids));
          }}
          onPlaced={(msg) => {
            setPlacing(false);
            setCart([]);
            setUndo(null);
            setDone(msg);
          }}
        />
      )}
    </div>
  );
}

/** "How many?" keypad (prototype). Decimals allowed for kg / length items. */
function QuantityDialog({ item, max, onClose, onAdd }: { item: HardwareStoreItem; max: number; onClose: () => void; onAdd: (qty: number) => void }) {
  const [value, setValue] = useState('1');
  const qty = Number(value);
  const error = !value || !(qty > 0) ? 'Enter a quantity.' : qty > max ? `Only ${fmtQty(max)} more can be added.` : /\.\d{4,}/.test(value) ? 'Use at most 3 decimal places.' : null;
  const press = (k: string) =>
    setValue((v) => {
      if (k === 'C') return '';
      if (k === '←') return v.slice(0, -1);
      if (k === '.' && v.includes('.')) return v;
      return v === '0' && k !== '.' ? k : v + k;
    });

  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title="How many?"
      subtitle={`${item.name} · ${fmtQty(max)} ${item.unit} available`}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={() => !error && onAdd(round3(qty))} disabled={!!error} className="btn-primary">
            Add to Sale
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <input
          autoFocus
          inputMode="decimal"
          value={value}
          onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !error && onAdd(round3(qty))}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 text-center text-3xl font-bold outline-none focus:border-[#0033A0]"
        />
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '←'].map((k) => (
            <button key={k} type="button" onClick={() => press(k)} className="rounded-lg border border-slate-200 py-3 text-lg font-semibold hover:bg-slate-50">
              {k}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => press('C')} className="w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">
          Clear
        </button>
        {value && error && <p className="text-sm font-semibold text-red-600">{error}</p>}
        {!error && (
          <p className="text-center text-sm text-slate-500">
            {fmtQty(qty)} × {formatRs(item.price)} = <span className="font-bold text-slate-900">{formatRs(hardwareLineTotal(item.price, qty))}</span>
          </p>
        )}
      </div>
    </Modal>
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

function PlaceOrderDialog({
  view,
  mode,
  cart,
  total,
  onClose,
  onShort,
  onPlaced,
}: {
  view: HardwareStoreView;
  mode: PlaceMode;
  cart: CartLine[];
  total: number;
  onClose: () => void;
  onShort: (itemIds: string[]) => void;
  onPlaced: (msg: string) => void;
}) {
  const { settings } = useBranchContext();
  const general = settings?.general ?? DEFAULT_BRANCH_SETTINGS.general;
  const online = useOnlineStatus();
  const place = usePlaceHardwareSale();
  const requestId = useRef(newRequestId());
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [full, setFull] = useState<FullPaymentDraft>({ mode: general.payment_modes[0] ?? PaymentMode.CASH, reference: '' });
  const range = hardwareAdvanceRange(total, view.remote_min_advance_pct);
  const [advance, setAdvance] = useState<PaymentDraft>({ ...emptyPaymentDraft(general.payment_modes[0]), amount: String(range.min / 100) });
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (phone.trim() && !name.trim()) return setError('Enter the customer name, or clear the phone for a walk-in.');
    if (name.trim() && phone.replace(/\D/g, '').length < 7) return setError('Enter a valid phone number, or clear the name for a walk-in.');
    let payment;
    if (mode === 'PAY_NOW') {
      const invalid = fullPaymentError(full, general);
      if (invalid) return setError(invalid);
      payment = { amount: total, mode: full.mode, reference: full.mode !== PaymentMode.CASH ? full.reference.trim() || undefined : undefined };
    } else if (mode === 'ADVANCE') {
      const cents = parseMoney(advance.amount || '0');
      if (cents < range.min) return setError(`Take at least ${formatRs(range.min)} (${view.remote_min_advance_pct}% of the total).`);
      if (cents > range.max) return setError(`An advance must be less than the total — at most ${formatRs(range.max)}.`);
      const invalid = validatePaymentDraft(advance, { min: range.min, max: range.max, requireReference: general.require_payment_reference });
      if (invalid) return setError(invalid);
      payment = toPayment(advance);
    }
    try {
      const res = await place.mutateAsync({
        client_request_id: requestId.current,
        ...(view.branch.is_own ? {} : { branch_id: view.branch.branch_id }),
        ...(phone.trim() ? { customer: { phone: phone.trim(), name: name.trim() } } : {}),
        notes: notes.trim() || undefined,
        lines: cart.map((l) => ({ item_id: l.item.item_id, quantity: l.quantity })),
        ...(payment ? { payment } : {}),
      });
      onPlaced(
        mode === 'SEND'
          ? `${res.order_number} sent to the cashier — ${formatRs(res.total)} to collect.`
          : mode === 'PAY_NOW'
            ? `${res.order_number} paid — ${formatRs(res.total)}. Hand over the goods.`
            : `${res.order_number} placed on ${view.branch.name}. Advance ${formatRs(res.paid_amount)} taken; ${formatRs(res.balance)} is collected at ${view.branch.name}.`,
      );
    } catch (e) {
      const err = apiError(e);
      const shortages = (err.details as { shortages?: { item_id: string }[] } | undefined)?.shortages;
      if (err.code === 'STK_001' && shortages) return onShort(shortages.map((s) => s.item_id));
      setError(err.message);
    }
  };

  const title = mode === 'SEND' ? 'Send to cashier' : mode === 'PAY_NOW' ? 'Take payment' : `Order from ${view.branch.name}`;
  const action = mode === 'SEND' ? 'Send to cashier' : mode === 'PAY_NOW' ? 'Finish sale' : 'Place & take advance';

  return (
    <Modal
      open
      size="md"
      onClose={onClose}
      title={title}
      subtitle={`${cart.length} item${cart.length === 1 ? '' : 's'} · ${formatRs(total)}`}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={() => void submit()} disabled={place.isPending || (mode !== 'SEND' && !online)} className="btn-primary">
            {place.isPending ? 'Saving…' : action}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {mode !== 'SEND' && !online && <Notice tone="warning">Payments can't be recorded offline (BR18). Reconnect to continue.</Notice>}
        <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 text-sm">
          {cart.map((l) => (
            <li key={l.item.item_id} className="flex justify-between gap-3 px-3 py-2">
              <span className="truncate">
                {fmtQty(l.quantity)} × {l.item.name}
              </span>
              <span className="whitespace-nowrap font-semibold">{formatRs(hardwareLineTotal(l.item.price, l.quantity))}</span>
            </li>
          ))}
        </ul>

        <div>
          <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer (leave empty for walk-in)</label>
          <div className="grid gap-2 sm:grid-cols-2">
            <CustomerPhoneInput
              value={phone}
              onChange={setPhone}
              onSelect={(c) => {
                setPhone(c.phone);
                setName(c.name);
              }}
              placeholder="Phone"
              className="field-input"
            />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" maxLength={120} className="field-input" />
          </div>
        </div>
        <div>
          <label className="field-label">Note (optional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} className="field-input" placeholder="e.g. collects after 4 pm" />
        </div>

        {mode === 'SEND' && <Notice tone="info">The order goes to the cashier's Hardware Queue. The items are held until it is paid.</Notice>}
        {mode === 'PAY_NOW' && <FullPaymentFields amount={total} value={full} onChange={setFull} general={general} disabled={place.isPending} />}
        {mode === 'ADVANCE' && (
          <div className="space-y-3">
            <Notice tone="info">
              Take an advance of {formatRs(range.min)} – {formatRs(range.max)} here. The balance is paid at {view.branch.name} when the customer collects.
            </Notice>
            <PaymentCapture
              value={advance}
              onChange={setAdvance}
              general={general}
              disabled={place.isPending}
              quickAmounts={[{ label: `Min ${view.remote_min_advance_pct}%`, amount: range.min }]}
            />
          </div>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Modal>
  );
}
