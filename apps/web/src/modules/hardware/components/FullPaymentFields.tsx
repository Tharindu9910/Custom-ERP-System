import { useState } from 'react';
import { PaymentMode, type GeneralRules } from '@erp/shared';
import type { FullPaymentDraft } from '../lib/full-payment';
import { Icon, type IconName } from '@/shared/components/Icon';
import { formatRs, parseMoney } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';

const MODES: { mode: PaymentMode; label: string; icon: IconName }[] = [
  { mode: PaymentMode.CASH, label: 'Cash', icon: 'banknote' },
  { mode: PaymentMode.CARD, label: 'Card', icon: 'creditCard' },
  { mode: PaymentMode.TRANSFER, label: 'Bank', icon: 'building' },
];

/**
 * Payment for an exact amount (hardware: the counter total or the balance). The amount
 * is fixed; the cash-tendered box only works out the change and is never sent.
 */
export function FullPaymentFields({
  amount,
  value,
  onChange,
  general,
  disabled,
}: {
  /** Cents */
  amount: number;
  value: FullPaymentDraft;
  onChange: (next: FullPaymentDraft) => void;
  general: GeneralRules;
  disabled?: boolean;
}) {
  const [tendered, setTendered] = useState('');
  const modes = MODES.filter((m) => general.payment_modes.includes(m.mode));
  const tenderedCents = parseMoney(tendered || '0');
  const change = tenderedCents - amount;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount payable</div>
        <div className="text-2xl font-bold text-slate-900">{formatRs(amount)}</div>
      </div>

      <div>
        <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment Mode</label>
        <div className={cn('grid gap-2', modes.length === 3 ? 'grid-cols-3' : modes.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
          {modes.map(({ mode, label, icon }) => (
            <button
              key={mode}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...value, mode })}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg border py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors',
                value.mode === mode ? 'border-[#0033A0] bg-[#0033A0] text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
              )}
            >
              <Icon name={icon} className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {value.mode === PaymentMode.CASH ? (
        <div>
          <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Cash tendered (optional)</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">Rs</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={tendered}
              disabled={disabled}
              onChange={(e) => setTendered(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-12 pr-4 text-base font-semibold outline-none focus:border-[#0033A0]"
              placeholder="0"
            />
          </div>
          {tendered && (
            <p className={cn('mt-1.5 text-sm font-semibold', change >= 0 ? 'text-emerald-700' : 'text-red-600')}>
              {change >= 0 ? `Change to give back: ${formatRs(change)}` : `Short by ${formatRs(-change)}`}
            </p>
          )}
        </div>
      ) : (
        <div>
          <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Reference / Slip No. {general.require_payment_reference && <span className="text-red-500">*</span>}
          </label>
          <input
            value={value.reference}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, reference: e.target.value })}
            maxLength={80}
            placeholder="Terminal or slip reference number"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-[#0033A0] focus:bg-white"
          />
        </div>
      )}
    </div>
  );
}

