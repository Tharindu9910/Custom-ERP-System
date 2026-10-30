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

/**
 * Line total for a hardware item: unit price (cents) × quantity (up to 3 decimals for kg / length).
 * Worked in thousandths of a unit so 0.1 + 0.2 style float drift can't change a cent.
 */
export function hardwareLineTotal(unitPrice: number, quantity: number): number {
  const milli = Math.round(quantity * 1000);
  return Math.round((unitPrice * milli) / 1000);
}

/**
 * Advance allowed on a hardware order placed for another branch (Docs/decisions/0006):
 * at least min_pct of the total, and always less than the total so the balance is
 * collected where the goods are.
 */
export function hardwareAdvanceRange(total: number, minPct: number): { min: number; max: number } {
  return { min: Math.max(1, Math.ceil((total * minPct) / 100)), max: total - 1 };
}
