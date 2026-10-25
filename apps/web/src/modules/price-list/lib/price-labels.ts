import { LineSubType, LineType, MaterialSource, PriceBasis, type PriceRateView } from '@erp/shared';

/** Line types that have rates (HARDWARE / MATERIAL lines are priced from the item). */
export const RATE_LINE_TYPES = [
  LineType.CUT_BEND,
  LineType.ROLLING,
  LineType.COIL_CUTTING,
  LineType.ROOFING_SHEET,
  LineType.ROOFING_ACCESSORY,
] as const;

export const LINE_TYPE_LABEL: Record<string, string> = {
  CUT_BEND: 'Cut & Bend',
  ROLLING: 'Rolling',
  COIL_CUTTING: 'Coil Cutting',
  ROOFING_SHEET: 'Roofing Sheet',
  ROOFING_ACCESSORY: 'Accessories',
};

export const SUB_TYPE_LABEL: Record<LineSubType, string> = {
  CUT: 'Cut',
  BEND: 'Bend',
  PIPE_BEND: 'Pipe Bend',
  BOX_BAR_BEND: 'Box Bar Bend',
  FLAT_IRON: 'Flat Iron',
  L_ANGLE: 'L Angle',
  SHEET_ROLL: 'Sheet Roll',
  COIL_CUT: 'Coil Cut',
};

export const BASIS_LABEL: Record<PriceBasis, string> = {
  PER_CUT: 'per cut',
  PER_BEND: 'per bend',
  PER_PIECE: 'per piece',
  PER_FT: 'per ft',
  PER_KG: 'per kg',
  PER_CUT_PER_M: 'per cut per m',
  FIXED: 'fixed',
};

/** Which key fields the Add Rate form asks for, per line type (matches the pricing lookups). */
export const RATE_FIELDS: Record<(typeof RATE_LINE_TYPES)[number], {
  subTypes: LineSubType[];
  variant?: string;
  workType?: boolean;
  thickness?: string;
  materialSource?: boolean;
  bases: PriceBasis[];
}> = {
  CUT_BEND: { subTypes: [LineSubType.CUT, LineSubType.BEND], variant: 'Material type', thickness: 'Thickness', bases: [PriceBasis.PER_CUT, PriceBasis.PER_BEND] },
  ROLLING: {
    subTypes: [LineSubType.PIPE_BEND, LineSubType.BOX_BAR_BEND, LineSubType.FLAT_IRON, LineSubType.L_ANGLE, LineSubType.SHEET_ROLL],
    workType: true,
    thickness: 'Size',
    bases: [PriceBasis.PER_PIECE, PriceBasis.PER_KG, PriceBasis.FIXED],
  },
  COIL_CUTTING: { subTypes: [LineSubType.COIL_CUT], variant: 'Range', bases: [PriceBasis.FIXED, PriceBasis.PER_CUT] },
  ROOFING_SHEET: {
    subTypes: [LineSubType.CUT, LineSubType.BEND],
    variant: 'Category',
    thickness: 'Thickness',
    materialSource: true,
    bases: [PriceBasis.PER_FT, PriceBasis.PER_CUT, PriceBasis.PER_BEND],
  },
  ROOFING_ACCESSORY: { subTypes: [], variant: 'Accessory', bases: [PriceBasis.PER_PIECE, PriceBasis.PER_FT] },
};

/** One readable line for what a rate prices, e.g. "Cut · Mild Steel · 2mm". */
export function describeRate(r: PriceRateView): string {
  const parts = [
    r.sub_type ? SUB_TYPE_LABEL[r.sub_type] : null,
    r.variant,
    r.work_type,
    r.thickness_or_size,
    r.material_source === MaterialSource.CUSTOMER ? 'Customer material' : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
}
