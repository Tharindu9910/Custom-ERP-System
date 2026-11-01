import { MaterialSource } from '../enums/order.enums';
import type { BranchSettings } from '../schemas/branch-settings.schema';
import type { WorkshopLineInput } from '../schemas/job-card.schema';
import type { PricedWorkshopLine } from './pricing/workshop';

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
 * Advance a workshop sub-job needs before the card enters the Workshop Queue (BR05, Docs/decisions/0010):
 * - branch-sheet Cut/Bend (standard or custom): the sheet cost;
 * - any other customized line: min_advance_pct_customized of its total;
 * - standard Rolling / Coil Cutting: min_advance_pct_standard of its total.
 */
export function suggestedLineAdvance(
  priced: Pick<PricedWorkshopLine, 'line_total' | 'is_customized' | 'material_total'>,
  input: Pick<WorkshopLineInput, 'job_type' | 'material_source'>,
  settings: Pick<BranchSettings, 'min_advance_pct_customized' | 'min_advance_pct_standard'>,
): number {
  if (input.job_type === 'CUT_BEND' && input.material_source === MaterialSource.BRANCH) return Math.min(priced.material_total, priced.line_total);
  const pct = priced.is_customized ? settings.min_advance_pct_customized : settings.min_advance_pct_standard;
  return Math.ceil((priced.line_total * pct) / 100);
}

/** The supervisor may set the advance of a customized sub-job (0 to its total); standard ones are fixed. */
export const advanceEditable = (priced: Pick<PricedWorkshopLine, 'is_customized'>) => priced.is_customized;

/** The advance a sub-job is saved with: the supervisor's amount on a customized line, otherwise the suggestion. */
export function lineAdvance(
  priced: Pick<PricedWorkshopLine, 'line_total' | 'is_customized' | 'material_total'>,
  input: Pick<WorkshopLineInput, 'job_type' | 'material_source' | 'advance'>,
  settings: Pick<BranchSettings, 'min_advance_pct_customized' | 'min_advance_pct_standard'>,
): number {
  if (advanceEditable(priced) && input.advance !== undefined) return input.advance;
  return suggestedLineAdvance(priced, input, settings);
}

/**
 * Advance a roofing item needs before the order enters the Order Queue (Docs/decisions/0011),
 * the job card rule for roofing: a standard item takes the branch's roofing advance %
 * (orders.min_advance_pct) of its total and is fixed; a customized item is pre-filled with
 * min_advance_pct_customized and the supervisor may set it, 0 to the item total.
 */
export function suggestedRoofingAdvance(
  priced: { line_total: number },
  line: { job_type: 'STANDARD' | 'CUSTOMIZED' },
  settings: Pick<BranchSettings, 'min_advance_pct_customized'> & { orders: Pick<BranchSettings['orders'], 'min_advance_pct'> },
): number {
  const pct = line.job_type === 'CUSTOMIZED' ? settings.min_advance_pct_customized : settings.orders.min_advance_pct;
  return Math.ceil((priced.line_total * pct) / 100);
}

export const roofingAdvanceEditable = (line: { job_type: 'STANDARD' | 'CUSTOMIZED' }) => line.job_type === 'CUSTOMIZED';

/** The advance a roofing item is saved with: the typed amount on a customized item, otherwise the suggestion. */
export function roofingLineAdvance(
  priced: { line_total: number },
  line: { job_type: 'STANDARD' | 'CUSTOMIZED'; advance?: number },
  settings: Parameters<typeof suggestedRoofingAdvance>[2],
): number {
  if (roofingAdvanceEditable(line) && line.advance !== undefined) return line.advance;
  return suggestedRoofingAdvance(priced, line, settings);
}

/** Minimum advance of a job card: the sum of its active sub-jobs' advances. */
export const jobCardMinAdvance = (lines: readonly { advance: number }[]) => lines.reduce((s, l) => s + l.advance, 0);

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
