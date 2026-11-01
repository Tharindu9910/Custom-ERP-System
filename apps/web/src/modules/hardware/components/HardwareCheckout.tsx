import { useRef, useState } from 'react';
import { DEFAULT_BRANCH_SETTINGS, PaymentMode, hardwareAdvanceRange, hardwareLineTotal } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { Notice } from '@/shared/components/Notice';
import { PaymentCapture } from '@/shared/components/PaymentCapture';
import { apiError, newRequestId } from '@/shared/api/errors';
import { useBranchContext } from '@/shared/hooks/useBranchContext';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import { centsToInput, formatRs, parseMoney } from '@/shared/lib/format';
import { toPayment, validatePaymentDraft, type PaymentDraft } from '@/shared/lib/payment-draft';
import { cn } from '@/shared/lib/utils';
import { CustomerPhoneInput } from '@/modules/customers/components/CustomerPhoneInput';
import { SummaryRow as Row, SummaryTile as Tile } from '@/modules/orders/components/OrderItemChecklist';
import { FullPaymentFields } from './FullPaymentFields';
import { fullPaymentError, type FullPaymentDraft } from '../lib/full-payment';
import { usePlaceHardwareSale, type HardwareStoreItem, type HardwareStoreView } from '../hooks/useHardware';

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, ''));

/**
 * Cashier checkout for a Hardware Store sale, shown in place of the store (same layout
 * as the Cashier Queue checkout): step 1 reviews the sale and the customer, step 2 takes
 * the payment — the full total at the cashier's own branch, or an advance when ordering
 * from another branch (Docs/decisions/0006). Supervisors never see this: their Place
 * Order sends the sale straight to the Hardware Queue.
 */
export function HardwareCheckout({
  view,
  advance: isAdvance,
  lines,
  total,
  onBack,
  onShort,
  onPlaced,
}: {
  view: HardwareStoreView;
  /** Ordering from another branch: take an advance, the balance is collected there */
  advance: boolean;
  lines: { item: HardwareStoreItem; quantity: number }[];
  total: number;
  onBack: () => void;
  onShort: (itemIds: string[]) => void;
  onPlaced: (msg: string) => void;
}) {
  const { settings } = useBranchContext();
  const general = settings?.general ?? DEFAULT_BRANCH_SETTINGS.general;
  const online = useOnlineStatus();
  const place = usePlaceHardwareSale();
  const requestId = useRef(newRequestId());

  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [full, setFull] = useState<FullPaymentDraft>({ mode: general.payment_modes[0] ?? PaymentMode.CASH, reference: '' });
  const range = hardwareAdvanceRange(total, view.remote_min_advance_pct);
  const [draft, setDraft] = useState<PaymentDraft>({ amount: centsToInput(range.min), mode: general.payment_modes[0] ?? PaymentMode.CASH, reference: '' });
  const [error, setError] = useState<string | null>(null);

  const amount = isAdvance ? parseMoney(draft.amount || '0') : total;
  const units = lines.reduce((s, l) => s + l.quantity, 0);

  const next = () => {
    setError(null);
    if (phone.trim() && !name.trim()) return setError('Enter the customer name, or clear the phone for a walk-in.');
    if (name.trim() && phone.replace(/\D/g, '').length < 7) return setError('Enter a valid phone number, or clear the name for a walk-in.');
    setStep(2);
  };

  const submit = async () => {
    setError(null);
    let payment;
    if (isAdvance) {
      if (amount < range.min) return setError(`Take at least ${formatRs(range.min)} (${view.remote_min_advance_pct}% of the total).`);
      if (amount > range.max) return setError(`An advance must be less than the total — at most ${formatRs(range.max)}.`);
      const invalid = validatePaymentDraft(draft, { min: range.min, max: range.max, requireReference: general.require_payment_reference });
      if (invalid) return setError(invalid);
      payment = toPayment(draft);
    } else {
      const invalid = fullPaymentError(full, general);
      if (invalid) return setError(invalid);
      payment = { amount: total, mode: full.mode, reference: full.mode !== PaymentMode.CASH ? full.reference.trim() || undefined : undefined };
    }
    try {
      const res = await place.mutateAsync({
        client_request_id: requestId.current,
        ...(view.branch.is_own ? {} : { branch_id: view.branch.branch_id }),
        ...(phone.trim() ? { customer: { phone: phone.trim(), name: name.trim() } } : {}),
        notes: notes.trim() || undefined,
        lines: lines.map((l) => ({ item_id: l.item.item_id, quantity: l.quantity })),
        payment,
      });
      onPlaced(
        isAdvance
          ? `${res.order_number} placed on ${view.branch.name}. Advance ${formatRs(res.paid_amount)} taken; ${formatRs(res.balance)} is collected at ${view.branch.name}.`
          : `${res.order_number} paid — ${formatRs(res.total)}. Hand over the goods.`,
      );
    } catch (e) {
      const err = apiError(e);
      const shortages = (err.details as { shortages?: { item_id: string }[] } | undefined)?.shortages;
      if (err.code === 'STK_001' && shortages) return onShort(shortages.map((s) => s.item_id));
      setError(err.message);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header: step dots, title, branch */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className={cn('h-1.5 rounded-full bg-[#0033A0] transition-all', step === 1 ? 'w-5' : 'w-1.5')} />
            <div className={cn('h-1.5 rounded-full transition-all', step === 2 ? 'w-5 bg-[#0033A0]' : 'w-1.5 bg-slate-300')} />
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <div>
            <h2 className="font-bold tracking-tight text-slate-900">{step === 1 ? 'Review Sale' : isAdvance ? 'Take Advance' : 'Take Payment'}</h2>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {step === 1 ? 'Confirm the items with the customer and add their details if needed.' : 'Enter the payment details to record the transaction.'}
            </p>
          </div>
        </div>
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
            isAdvance ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800',
          )}
        >
          {isAdvance ? `Ordering from ${view.branch.name}` : 'Counter sale'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {step === 1 ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px]">
            <div className="space-y-6 p-6 lg:border-r lg:border-slate-200">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5">Item</th>
                      <th className="px-4 py-2.5 text-right">Qty</th>
                      <th className="px-4 py-2.5 text-right">Price</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((l) => (
                      <tr key={l.item.item_id}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{l.item.name}</div>
                          <div className="font-mono text-xs text-slate-400">{l.item.sku}</div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {fmtQty(l.quantity)} <span className="text-xs text-slate-400">{l.item.unit}</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-500">{formatRs(l.item.price)}</td>
                        <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">{formatRs(hardwareLineTotal(l.item.price, l.quantity))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

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
              {error && <Notice tone="error">{error}</Notice>}
            </div>

            <div className="flex flex-col gap-6 bg-slate-50 p-6">
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-6 text-center">
                  <Icon name="fileText" className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Payment Summary</p>
                </div>
                <div className="space-y-3 text-sm">
                  <Row label="Lines" value={String(lines.length)} />
                  <Row label="Units" value={fmtQty(Math.round(units * 1000) / 1000)} />
                  <Row label="Total" value={formatRs(total)} />
                  {isAdvance && <Row label={`Minimum advance (${view.remote_min_advance_pct}%)`} value={formatRs(range.min)} tone="text-amber-600" />}
                  <div className="flex flex-col items-center gap-1 border-t border-dashed border-slate-200 pt-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{isAdvance ? 'Order Total' : 'Amount Payable'}</span>
                    <span className="text-2xl font-black tabular-nums text-slate-900">{formatRs(total)}</span>
                  </div>
                </div>
              </div>
              <Notice tone="info">
                {isAdvance
                  ? `Take an advance here. The balance is paid at ${view.branch.name} when the customer collects.`
                  : 'Check each item and its quantity with the customer before taking payment.'}
              </Notice>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl p-8">
            <div className="grid grid-cols-1 gap-10 md:grid-cols-[1fr_320px]">
              <div className="space-y-6">
                {!online && <Notice tone="warning">Payments can't be recorded offline (BR18). Reconnect to continue.</Notice>}
                {isAdvance ? (
                  <PaymentCapture
                    value={draft}
                    onChange={(v) => {
                      setDraft(v);
                      setError(null);
                    }}
                    general={general}
                    disabled={place.isPending}
                    quickAmounts={[{ label: `Min ${view.remote_min_advance_pct}%`, amount: range.min }]}
                  />
                ) : (
                  <FullPaymentFields
                    amount={total}
                    value={full}
                    onChange={(v) => {
                      setFull(v);
                      setError(null);
                    }}
                    general={general}
                    disabled={place.isPending}
                  />
                )}
              </div>

              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                  <p className="mb-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Confirmation Review</p>
                  <p className="text-sm font-bold text-slate-900">{name.trim() || 'Walk-in'}</p>
                  {phone.trim() && <p className="font-mono text-xs text-slate-500">{phone}</p>}
                  <p className="mt-1 text-xs text-slate-500">
                    {lines.length} {lines.length === 1 ? 'item' : 'items'}
                  </p>
                  <div className="mt-4 grid gap-2">
                    <Tile label="Total" value={formatRs(total)} />
                    <Tile label="This payment" value={formatRs(amount)} tone="text-[#0033A0]" />
                    <Tile label={isAdvance ? `Balance at ${view.branch.name}` : 'Balance after'} value={formatRs(Math.max(0, total - amount))} />
                  </div>
                </div>
                {error && <Notice tone="error">{error}</Notice>}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
        <button type="button" onClick={step === 1 ? onBack : () => setStep(1)} disabled={place.isPending} className="btn-secondary">
          <Icon name="chevronRight" className="h-4 w-4 rotate-180" /> {step === 1 ? 'Back to store' : 'Back'}
        </button>
        {step === 1 ? (
          <button type="button" onClick={next} className="btn-primary">
            Next: {isAdvance ? 'Take Advance' : 'Take Payment'} <Icon name="arrowRight" className="h-4 w-4" />
          </button>
        ) : (
          <button type="button" onClick={() => void submit()} disabled={place.isPending || !online} className="btn-primary">
            {place.isPending ? 'Saving…' : 'Confirm Payment'} <Icon name="check" className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
