import { LineSubType, LineType, MaterialSource, PriceBasis } from '../../enums/order.enums';

/** A price_rate row as the pricing functions need it. Money in cents. */
export interface RateRow {
  branch_id: string | null;
  line_type: LineType;
  sub_type: LineSubType | null;
  variant: string | null;
  work_type: string | null;
  thickness_or_size: string | null;
  material_source: MaterialSource;
  price_basis: PriceBasis;
  rate: number;
}

export interface RateKey {
  line_type: LineType;
  sub_type?: LineSubType | null;
  variant?: string | null;
  work_type?: string | null;
  thickness_or_size?: string | null;
  material_source?: MaterialSource;
}

const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? null) === (b ?? null);

/**
 * Lookup chain: the branch's own rate first, then the master rate (branch_id null).
 * Every key field must match exactly; an unset field matches only a null column.
 * Returns null when there is no rate, which makes a standard line customized (BR17/BR23).
 */
export function findRate(rates: readonly RateRow[], key: RateKey): RateRow | null {
  const source = key.material_source ?? MaterialSource.BRANCH;
  const matches = rates.filter(
    (r) =>
      r.line_type === key.line_type &&
      r.material_source === source &&
      same(r.sub_type, key.sub_type) &&
      same(r.variant, key.variant) &&
      same(r.work_type, key.work_type) &&
      same(r.thickness_or_size, key.thickness_or_size),
  );
  return matches.find((r) => r.branch_id !== null) ?? matches.find((r) => r.branch_id === null) ?? null;
}

/** Rs-formatted amount for notes, e.g. 47000 → "Rs 470.00". The UI formats with its own helper. */
export function formatRs(cents: number): string {
  return `Rs ${(cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
