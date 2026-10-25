import { LineSubType, LineType, MaterialSource, PriceBasis } from '../../enums/order.enums';
import { isCustomMode, type CustomCharge, type WorkshopLineInput } from '../../schemas/job-card.schema';
import { findRate, type RateRow } from './rates';

/** Rolling type label (branch pick-list) → ER-v6 line sub-type. */
export const ROLLING_TYPE_SUB_TYPES: Record<string, LineSubType> = {
  'Pipe Bending': LineSubType.PIPE_BEND,
  'Box Bar Bending': LineSubType.BOX_BAR_BEND,
  'Flat Iron Bending': LineSubType.FLAT_IRON,
  'L Angle': LineSubType.L_ANGLE,
  'Sheet Rolling': LineSubType.SHEET_ROLL,
};

export interface WorkshopPricingContext {
  rates: readonly RateRow[];
  /** Branch selling price (cents) of one sheet of material/thickness, or null if not catalogued. */
  materialPrice: (materialType: string, thickness: string) => number | null;
}

export interface PricedWorkshopLine {
  line_type: LineType;
  sub_type: LineSubType | null;
  price_basis: PriceBasis;
  quantity: number | null;
  unit_price: number;
  line_total: number;
  /** Customized by hand, by customer material, or automatically (no standard rate). */
  is_customized: boolean;
  /** True when the standard price could not be found (BR23 a/b). */
  auto_customized: boolean;
  /** Human-readable list of rates that are missing; non-empty means a custom price is needed. */
  missing_rates: string[];
}

export function customChargesTotal(charges: readonly CustomCharge[]): number {
  return charges.reduce((sum, c) => sum + Math.round(c.rate * c.quantity), 0);
}

export function lineTypeFor(line: WorkshopLineInput): { line_type: LineType; sub_type: LineSubType | null } {
  switch (line.job_type) {
    case 'CUT_BEND':
      return { line_type: LineType.CUT_BEND, sub_type: null };
    case 'COIL_CUTTING':
      return { line_type: LineType.COIL_CUTTING, sub_type: LineSubType.COIL_CUT };
    case 'ROLLING':
      return {
        line_type: LineType.ROLLING,
        sub_type: (line.rolling_type && ROLLING_TYPE_SUB_TYPES[line.rolling_type]) || null,
      };
  }
}

/**
 * Prices one workshop line.
 * - Customized (hand toggle or customer material): the sum of the custom charges.
 * - Standard: rates from price_rate (+ material for branch-material Cut/Bend). If any
 *   needed rate is missing the line becomes customized automatically and the
 *   supervisor must supply custom charges.
 */
export function priceWorkshopLine(line: WorkshopLineInput, ctx: WorkshopPricingContext): PricedWorkshopLine {
  const { line_type, sub_type } = lineTypeFor(line);
  const custom = (missing: string[], auto: boolean): PricedWorkshopLine => {
    const total = customChargesTotal(line.custom_charges);
    return {
      line_type,
      sub_type,
      price_basis: PriceBasis.FIXED,
      quantity: standardQuantity(line),
      unit_price: total,
      line_total: total,
      is_customized: true,
      auto_customized: auto,
      // Missing rates only matter while no custom price has been given
      missing_rates: line.custom_charges.length > 0 ? [] : missing,
    };
  };

  if (isCustomMode(line)) return custom([], false);

  const missing: string[] = [];
  let total = 0;
  let unit = 0;
  let basis = PriceBasis.FIXED;

  if (line.job_type === 'CUT_BEND') {
    const material = line.material_type ?? '';
    const thickness = line.thickness ?? '';
    const key = { line_type, variant: material, thickness_or_size: thickness };
    if (line.cut_count > 0) {
      const r = findRate(ctx.rates, { ...key, sub_type: LineSubType.CUT });
      if (r) total += r.rate * line.cut_count;
      else missing.push(`cut rate for ${material} ${thickness}`);
    }
    if (line.bend_count > 0) {
      const r = findRate(ctx.rates, { ...key, sub_type: LineSubType.BEND });
      if (r) total += r.rate * line.bend_count;
      else missing.push(`bend rate for ${material} ${thickness}`);
    }
    if (line.material_source === MaterialSource.BRANCH) {
      const price = ctx.materialPrice(material, thickness);
      if (price === null) missing.push(`material price for ${material} ${thickness}`);
      else total += price * (line.material_quantity ?? 0);
    }
    unit = total;
  } else if (line.job_type === 'ROLLING') {
    const r = sub_type
      ? findRate(ctx.rates, { line_type, sub_type, work_type: line.work_type, thickness_or_size: line.size })
      : null;
    if (r) {
      unit = r.rate;
      basis = r.price_basis;
      total = r.rate * (line.quantity ?? 0);
    } else {
      missing.push(`rolling rate for ${line.rolling_type} · ${line.work_type} · ${line.size}`);
    }
  } else {
    const r = findRate(ctx.rates, { line_type, sub_type, variant: line.amount_range });
    if (r) {
      unit = r.rate;
      basis = r.price_basis;
      total = r.rate;
    } else {
      missing.push(`coil cutting rate for ${line.amount_range} tons`);
    }
  }

  if (missing.length > 0) return custom(missing, true);
  return {
    line_type,
    sub_type,
    price_basis: basis,
    quantity: standardQuantity(line),
    unit_price: Math.round(unit),
    line_total: Math.round(total),
    is_customized: false,
    auto_customized: false,
    missing_rates: [],
  };
}

function standardQuantity(line: WorkshopLineInput): number | null {
  if (line.job_type === 'CUT_BEND') return line.material_quantity ?? null;
  if (line.job_type === 'ROLLING') return line.quantity ?? null;
  return 1;
}
