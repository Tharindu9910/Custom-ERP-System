import { BranchType, typeHasRoofing, typeHasWorkshop, type BranchSettings } from '@erp/shared';

// Branch Configuration screen metadata (prototype: utils/branchConfig.ts).

export const BRANCH_TYPE_OPTIONS: { id: BranchType; label: string; description: string }[] = [
  { id: BranchType.ROOFING, label: 'Roofing', description: 'Order forms for roofing sheets, gutters, flashing and accessories.' },
  { id: BranchType.WORKSHOP, label: 'Workshop', description: 'Job cards for cutting, bending, coil cutting and rolling.' },
  { id: BranchType.ROOFING_WORKSHOP, label: 'Roofing + Workshop', description: 'Runs both roofing order forms and workshop job cards.' },
];
export const branchTypeLabel = (t: BranchType) => BRANCH_TYPE_OPTIONS.find((o) => o.id === t)?.label ?? t;
export const modulesFor = (t: BranchType) => [typeHasRoofing(t) && 'Order Form', typeHasWorkshop(t) && 'Job Card'].filter(Boolean).join(' + ');


export type ConfigSection = 'features' | 'general' | 'orders' | 'roofing' | 'workshop';

export const SECTION_LABELS: Record<ConfigSection, string> = {
  features: 'Features',
  general: 'General Rules',
  orders: 'Orders & Payments',
  roofing: 'Roofing',
  workshop: 'Workshop',
};

export const SECTION_HINTS: Record<ConfigSection, string> = {
  features: 'Turn optional modules on or off. Hidden modules disappear from the menu for this branch.',
  general: 'Payment and material rules used by supervisors and cashiers.',
  orders: 'Advance, discount and stock override rules.',
  roofing: 'Options for the roofing order form.',
  workshop: 'Options for the workshop job card.',
};

/** Settings keys each section owns — used for "Customized" and "Reset". Number prefixes are shared, so not listed. */
export const SECTION_KEYS: Record<ConfigSection, (keyof BranchSettings)[]> = {
  features: ['features'],
  general: ['general'],
  orders: ['orders', 'min_advance_pct_customized', 'min_advance_pct_standard', 'stock_override_enabled'],
  roofing: ['roofing'],
  workshop: ['workshop'],
};

export const sectionsForType = (t: BranchType): ConfigSection[] => [
  'features',
  'general',
  'orders',
  ...(typeHasRoofing(t) ? (['roofing'] as const) : []),
  ...(typeHasWorkshop(t) ? (['workshop'] as const) : []),
];

const isPct = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;

/** Client-side checks so the user sees problems per section; the API validates again. */
export function validateConfig(c: BranchSettings, t: BranchType): Partial<Record<ConfigSection, string[]>> {
  const out: Partial<Record<ConfigSection, string[]>> = {};
  const add = (s: ConfigSection, msg: string) => (out[s] ??= []).push(msg);
  if (c.general.payment_modes.length === 0) add('general', 'Choose at least one payment method.');
  if (!isPct(c.orders.min_advance_pct)) add('orders', 'Minimum advance must be 0–100%.');
  if (!isPct(c.orders.max_discount_pct)) add('orders', 'Maximum discount must be 0–100%.');
  if (!isPct(c.orders.customized_surcharge_pct)) add('orders', 'Customized surcharge must be 0–100%.');
  if (!isPct(c.min_advance_pct_customized) || !isPct(c.min_advance_pct_standard)) add('orders', 'Job card advance must be 0–100%.');
  if (typeHasRoofing(t)) {
    if (c.roofing.categories.length === 0) add('roofing', 'Choose at least one job category.');
    if (c.roofing.coil_thicknesses.length === 0 || c.roofing.coil_colors.length === 0 || c.roofing.coil_origins.length === 0)
      add('roofing', 'Choose at least one coil thickness, colour and origin.');
  }
  if (typeHasWorkshop(t) && c.workshop.job_types.length === 0) add('workshop', 'Choose at least one job type.');
  return out;
}
