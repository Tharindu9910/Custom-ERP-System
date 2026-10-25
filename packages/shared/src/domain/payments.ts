import type { BranchSettings } from '../schemas/branch-settings.schema';

export type OrderPaymentState = 'UNPAID' | 'ADVANCE_PAID' | 'FULLY_PAID';

export const PAYMENT_STATE_LABEL: Record<OrderPaymentState, string> = {
  UNPAID: 'Unpaid',
  ADVANCE_PAID: 'Advance Paid',
  FULLY_PAID: 'Fully Paid',
};

/** Same rule as the prototype's paymentStatusFor. */
export function paymentStateFor(total: number, paid: number): OrderPaymentState {
  if (total <= 0) return 'FULLY_PAID';
  if (paid <= 0) return 'UNPAID';
  if (paid >= total) return 'FULLY_PAID';
  return 'ADVANCE_PAID';
}

export const balanceDue = (total: number, paid: number) => Math.max(0, total - paid);

/**
 * Minimum advance before a job card enters the Workshop Queue (BR05/BR09):
 * customized lines × min_advance_pct_customized + standard lines × min_advance_pct_standard.
 */
export function jobCardMinAdvance(
  lines: readonly { line_total: number; is_customized: boolean }[],
  settings: Pick<BranchSettings, 'min_advance_pct_customized' | 'min_advance_pct_standard'>,
): number {
  const customized = lines.filter((l) => l.is_customized).reduce((s, l) => s + l.line_total, 0);
  const standard = lines.filter((l) => !l.is_customized).reduce((s, l) => s + l.line_total, 0);
  return Math.ceil(
    (customized * settings.min_advance_pct_customized + standard * settings.min_advance_pct_standard) / 100,
  );
}

/** First payment on an order is ADVANCE (or FINAL if it covers the total); later ones PARTIAL/FINAL. */
export function paymentKindFor(alreadyPaid: number, amount: number, total: number): 'ADVANCE' | 'PARTIAL' | 'FINAL' {
  if (alreadyPaid + amount >= total) return 'FINAL';
  return alreadyPaid === 0 ? 'ADVANCE' : 'PARTIAL';
}
