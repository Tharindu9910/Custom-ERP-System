import { LineSubType, LineType, MaterialSource, PriceBasis } from '../../enums/order.enums';
import type { OrderPolicy } from '../../schemas/branch-settings.schema';
import { isAccessoryCategory, runningFt, type RoofingLineInput } from '../../schemas/roofing-order.schema';
import { findRate, formatRs, type RateRow } from './rates';

// Ported from the prototype's orderPricing.ts. Money is integer cents.

export interface RoofingPricingContext {
  rates: readonly RateRow[];
  surcharge_pct: number;
  /** Coil thickness (e.g. "0.47mm") for a coil item id, or null if unknown. */
  coilThickness: (coilItemId: string) => string | null;
  /** Order-level coil, applied to items without their own coil. */
  global_coil_item_id?: string;
}

export interface PricedRoofingLine {
  line_type: LineType;
  price_basis: PriceBasis;
  quantity: number;
  unit_price: number;
  line_total: number;
  price_note: string;
  /** Non-null when a rate is missing — the order cannot be placed until it is added. */
  missing_rate: string | null;
}

const withSurcharge = (amount: number, line: RoofingLineInput, pct: number) =>
  line.job_type === 'CUSTOMIZED' ? amount * (1 + pct / 100) : amount;

export function priceRoofingLine(line: RoofingLineInput, ctx: RoofingPricingContext): PricedRoofingLine {
  const surchargeNote = line.job_type === 'CUSTOMIZED' && ctx.surcharge_pct > 0 ? ` + ${ctx.surcharge_pct}% customized` : '';

  if (isAccessoryCategory(line.category)) {
    const qty = line.quantity ?? 0;
    const r = findRate(ctx.rates, { line_type: LineType.ROOFING_ACCESSORY, variant: line.accessory_type });
    if (!r) {
      return {
        line_type: LineType.ROOFING_ACCESSORY,
        price_basis: PriceBasis.PER_PIECE,
        quantity: qty,
        unit_price: 0,
        line_total: 0,
        price_note: 'No rate',
        missing_rate: `${line.accessory_type ?? 'Accessory'} (per piece)`,
      };
    }
    const unit = Math.round(withSurcharge(r.rate, line, ctx.surcharge_pct));
    return {
      line_type: LineType.ROOFING_ACCESSORY,
      price_basis: PriceBasis.PER_PIECE,
      quantity: qty,
      unit_price: unit,
      line_total: unit * qty,
      price_note: `${qty} × ${formatRs(unit)}${surchargeNote}`,
      missing_rate: null,
    };
  }

  const ft = runningFt(line);
  const coilId = line.coil_item_id ?? ctx.global_coil_item_id;
  const isBranch = line.material_source === MaterialSource.BRANCH;
  const thickness = isBranch && coilId ? ctx.coilThickness(coilId) : null;
  const perFt = isBranch
    ? thickness
      ? findRate(ctx.rates, {
          line_type: LineType.ROOFING_SHEET,
          variant: line.category,
          thickness_or_size: thickness,
          material_source: MaterialSource.BRANCH,
        })
      : null
    : findRate(ctx.rates, { line_type: LineType.ROOFING_SHEET, variant: line.category, material_source: MaterialSource.CUSTOMER });

  const missing: string[] = [];
  if (!perFt) missing.push(isBranch ? `${line.category} ${thickness ?? ''} per ft`.trim() : `${line.category} customer material per ft`);

  let extras = 0;
  if (line.total_cuts > 0) {
    const r = findRate(ctx.rates, { line_type: LineType.ROOFING_SHEET, sub_type: LineSubType.CUT });
    if (r) extras += r.rate * line.total_cuts;
    else missing.push('per cut');
  }
  if (line.total_bends > 0) {
    const r = findRate(ctx.rates, { line_type: LineType.ROOFING_SHEET, sub_type: LineSubType.BEND });
    if (r) extras += r.rate * line.total_bends;
    else missing.push('per bend');
  }

  if (missing.length > 0 || !perFt) {
    return {
      line_type: LineType.ROOFING_SHEET,
      price_basis: PriceBasis.PER_FT,
      quantity: ft,
      unit_price: perFt?.rate ?? 0,
      line_total: 0,
      price_note: 'No rate',
      missing_rate: missing.join(', '),
    };
  }

  // Cuts and bends are not surcharged (prototype rule)
  const sheet = Math.round(withSurcharge(ft * perFt.rate, line, ctx.surcharge_pct));
  const cutsNote = line.total_cuts > 0 ? ` + ${line.total_cuts} cuts` : '';
  const bendsNote = line.total_bends > 0 ? ` + ${line.total_bends} bends` : '';
  return {
    line_type: LineType.ROOFING_SHEET,
    price_basis: PriceBasis.PER_FT,
    quantity: ft,
    unit_price: perFt.rate,
    line_total: sheet + extras,
    price_note: `${round2(ft)} ft × ${formatRs(perFt.rate)}/ft${surchargeNote}${cutsNote}${bendsNote}`,
    missing_rate: null,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface RoofingTotals {
  subtotal: number;
  discount: number;
  max_discount: number;
  total: number;
  min_to_place: number;
}

export const maxDiscountFor = (subtotal: number, policy: OrderPolicy) =>
  Math.floor((subtotal * policy.max_discount_pct) / 100);

export function minToPlace(total: number, policy: OrderPolicy): number {
  if (policy.min_payment_to_place === 'NONE') return 0;
  if (policy.min_payment_to_place === 'FULL') return total;
  return Math.ceil((total * policy.min_advance_pct) / 100);
}

export function roofingTotals(lineTotals: readonly number[], discount: number, policy: OrderPolicy): RoofingTotals {
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  const d = Math.max(0, Math.min(discount, subtotal));
  const total = subtotal - d;
  return { subtotal, discount: d, max_discount: maxDiscountFor(subtotal, policy), total, min_to_place: minToPlace(total, policy) };
}
