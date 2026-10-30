import { PaymentMode, type GeneralRules } from '@erp/shared';

/** Mode and reference for a fixed-amount hardware payment; the amount is never typed. */
export interface FullPaymentDraft {
  mode: PaymentMode;
  reference: string;
}

/** Same reference rule the server applies; returns a message or null. */
export function fullPaymentError(value: FullPaymentDraft, general: GeneralRules): string | null {
  if (value.mode !== PaymentMode.CASH && general.require_payment_reference && !value.reference.trim()) return 'Enter the card or bank reference.';
  return null;
}
