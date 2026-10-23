import { PaymentMode } from '@erp/shared';
import { formatRs, parseMoney } from './format';

/** What the cashier types: the amount in rupees as entered, the mode and a reference. */
export interface PaymentDraft {
  amount: string;
  mode: PaymentMode;
  reference: string;
}

export const emptyPaymentDraft = (mode: PaymentMode = PaymentMode.CASH): PaymentDraft => ({ amount: '', mode, reference: '' });

/** Same checks the server makes (prototype validatePaymentDraft); returns a message or null. Amounts in cents. */
export function validatePaymentDraft(draft: PaymentDraft, opts: { min: number; max: number; requireReference: boolean }): string | null {
  const amount = parseMoney(draft.amount || '0');
  if (amount < 0) return 'Enter a valid amount.';
  if (amount < opts.min) return `At least ${formatRs(opts.min)} must be paid.`;
  if (amount > opts.max) return `Amount is more than the balance (${formatRs(opts.max)}).`;
  if (amount > 0 && opts.requireReference && draft.mode !== PaymentMode.CASH && !draft.reference.trim()) {
    return 'Enter the card or bank reference.';
  }
  return null;
}

/** Payment as the API takes it (cents). */
export const toPayment = (draft: PaymentDraft) => ({
  amount: parseMoney(draft.amount || '0'),
  mode: draft.mode,
  reference: draft.mode !== PaymentMode.CASH && draft.reference.trim() ? draft.reference.trim() : undefined,
});
