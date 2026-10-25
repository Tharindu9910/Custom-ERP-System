import { PaymentMode, type GeneralRules } from '@erp/shared';
import type { PaymentDraft } from '@/shared/lib/payment-draft';
import { Icon, type IconName } from './Icon';

const MODE_META: { mode: PaymentMode; label: string; icon: IconName }[] = [
  { mode: PaymentMode.CASH, label: 'Cash', icon: 'banknote' },
  { mode: PaymentMode.CARD, label: 'Card', icon: 'creditCard' },
  { mode: PaymentMode.TRANSFER, label: 'Bank', icon: 'building' },
];

/** Amount + mode + reference fields (prototype PaymentCapture), used in the order form and the payment modal. */
export function PaymentCapture({
  value,
  onChange,
  general,
  quickAmounts = [],
  disabled,
}: {
  value: PaymentDraft;
  onChange: (next: PaymentDraft) => void;
  general: GeneralRules;
  /** Amounts in cents */
  quickAmounts?: { label: string; amount: number }[];
  disabled?: boolean;
}) {
  const modes = MODE_META.filter((m) => general.payment_modes.includes(m.mode));

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount Received</label>
          <div className="flex items-center gap-1.5">
            {quickAmounts.map((q) => (
              <button
                key={q.label}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...value, amount: String(q.amount / 100) })}
                className="rounded border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[#0033A0] transition-colors hover:bg-blue-100 disabled:opacity-50"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">Rs</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={value.amount}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, amount: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-lg font-bold outline-none transition-colors focus:border-[#0033A0] focus:bg-white disabled:opacity-60"
            placeholder="0"
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment Mode</label>
        <div className={`grid gap-2 ${modes.length === 3 ? 'grid-cols-3' : modes.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {modes.map(({ mode, label, icon }) => {
            const active = value.mode === mode;
            return (
              <button
                key={mode}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...value, mode })}
                className={`flex flex-col items-center gap-1 rounded-lg border py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                  active ? 'border-[#0033A0] bg-[#0033A0] text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon name={icon} className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {value.mode !== PaymentMode.CASH && (
        <div>
          <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Reference / Transaction ID {general.require_payment_reference && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            value={value.reference}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, reference: e.target.value })}
            placeholder="Terminal or slip reference number"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-colors focus:border-[#0033A0] focus:bg-white"
          />
        </div>
      )}
    </div>
  );
}
