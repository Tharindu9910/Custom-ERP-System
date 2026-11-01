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
  /** Branch sheets on a Cut/Bend line (price × qty, 0 if not catalogued) — the standard advance (Docs/decisions/0010). */
  material_total: number;
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
 * Prices one workshop line (Docs/decisions/0008).
 * - Customized (hand toggle or customer material): the sum of the custom charges, plus
 *   the branch sheets for a branch Cut/Bend (they are still held and deducted).
 * - Standard: rates from price_rate (+ material for branch-material Cut/Bend, + any
 *   sheet rolling charge). If any needed rate is missing the line becomes customized
 *   automatically and the supervisor must supply custom charges.
 */
export function priceWorkshopLine(line: WorkshopLineInput, ctx: WorkshopPricingContext): PricedWorkshopLine {
  const { line_type, sub_type } = lineTypeFor(line);
  const sheets = line.job_type === 'CUT_BEND' && line.material_source === MaterialSource.BRANCH ? branchMaterialTotal(line, ctx) : null;
  const custom = (missing: string[], auto: boolean, extra = 0): PricedWorkshopLine => {
    const total = customChargesTotal(line.custom_charges) + extra;
    return {
      line_type,
      sub_type,
      price_basis: PriceBasis.FIXED,
      quantity: standardQuantity(line),
      unit_price: total,
      line_total: total,
      is_customized: true,
      auto_customized: auto,
      // Missing rates only matter while no custom price has been given (sheet rolling alone is not one)
      missing_rates: line.custom_charges.some((c) => !isSheetRolling(line, c)) ? [] : missing,
      material_total: sheets ?? 0,
    };
  };

  if (isCustomMode(line)) {
    // Uncatalogued branch material adds nothing: the hand rate covers it
    return custom([], false, sheets ?? 0);
  }

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
    // Sheet rolling is entered by hand on any Cut/Bend line
    total += customChargesTotal(line.custom_charges.filter((c) => isSheetRolling(line, c)));
    if (line.material_source === MaterialSource.BRANCH) {
      if (sheets === null) missing.push(`material price for ${material} ${thickness}`);
      else total += sheets;
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
    material_total: sheets ?? 0,
  };
}

/** Branch sheets on a Cut/Bend line (price × quantity), or null when the material is not catalogued. */
function branchMaterialTotal(line: Extract<WorkshopLineInput, { job_type: 'CUT_BEND' }>, ctx: WorkshopPricingContext): number | null {
  const price = ctx.materialPrice(line.material_type ?? '', line.thickness ?? '');
  return price === null ? null : price * (line.material_quantity ?? 0);
}

/** The optional sheet rolling charge of a Cut/Bend line. */
const isSheetRolling = (line: WorkshopLineInput, c: CustomCharge) => line.job_type === 'CUT_BEND' && c.kind === 'ROLLING';

function standardQuantity(line: WorkshopLineInput): number | null {
  if (line.job_type === 'CUT_BEND') return line.material_quantity ?? null;
  if (line.job_type === 'ROLLING') return line.quantity ?? null;
  return 1;
}
