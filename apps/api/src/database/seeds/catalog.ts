import { COIL_COLOR_LABELS, DEFAULT_BRANCH_SETTINGS } from '@erp/shared';

// Reference data for development: price rates, catalogue items and opening stock.
// Rates start from the approved prototype's defaults (Rs → cents). Some rates are
// left out on purpose so the "no standard rate → customized" path can be tried.

const rs = (n: number) => Math.round(n * 100);
const S = DEFAULT_BRANCH_SETTINGS;

export interface SeedRate {
  line_type: string;
  sub_type?: string | null;
  variant?: string | null;
  work_type?: string | null;
  thickness_or_size?: string | null;
  material_source?: 'BRANCH' | 'CUSTOMER';
  price_basis: string;
  rate: number;
}

export interface SeedItem {
  sku: string;
  name: string;
  item_type: 'HARDWARE' | 'COIL' | 'MATERIAL';
  category: string;
  unit: string;
  attributes: Record<string, string>;
  price: number;
  unit_cost: number;
}

// ── Workshop ────────────────────────────────────────────────────────────────

const MATERIAL_FACTORS: Record<string, { code: string; factor: number; sheet: number }> = {
  'MS Plain Sheet': { code: 'MSP', factor: 1.0, sheet: 4200 },
  'MS Checker Sheet': { code: 'MSC', factor: 1.2, sheet: 5200 },
  'Zinc Coated': { code: 'ZNC', factor: 1.1, sheet: 4600 },
  'Stainless Steel (SS)': { code: 'SST', factor: 2.0, sheet: 12500 },
  'Aluminium Plain Sheet': { code: 'ALP', factor: 1.3, sheet: 7800 },
  'Aluminium Checker Sheet': { code: 'ALC', factor: 1.4, sheet: 8900 },
};
const mm = (t: string) => parseFloat(t);

function workshopRates(): SeedRate[] {
  const rates: SeedRate[] = [];
  for (const [material, m] of Object.entries(MATERIAL_FACTORS)) {
    for (const t of S.workshop.thicknesses) {
      // Gap on purpose: thick stainless has no standard rate (auto-customized)
      if (material === 'Stainless Steel (SS)' && mm(t) >= 5) continue;
      const cut = Math.round(25 * m.factor * (1 + mm(t) * 0.25));
      rates.push({ line_type: 'CUT_BEND', sub_type: 'CUT', variant: material, thickness_or_size: t, price_basis: 'PER_CUT', rate: rs(cut) });
      rates.push({ line_type: 'CUT_BEND', sub_type: 'BEND', variant: material, thickness_or_size: t, price_basis: 'PER_BEND', rate: rs(cut * 2) });
    }
  }
  // Rolling: pipe and box bar bending for common work types; other types have no rate yet
  const pipeSizes = S.workshop.rolling_sizes['Pipe Bending'];
  const boxSizes = S.workshop.rolling_sizes['Box Bar Bending'];
  ['GI Pipe', 'Circle Bend', 'Gate Bend Two Side', 'Gate Bend One Side'].forEach((wt, wi) =>
    pipeSizes.forEach((size, si) =>
      rates.push({ line_type: 'ROLLING', sub_type: 'PIPE_BEND', work_type: wt, thickness_or_size: size, price_basis: 'PER_PIECE', rate: rs(150 + si * 40 + wi * 25) }),
    ),
  );
  ['Circle Bend', 'Gate Bend One Side'].forEach((wt, wi) =>
    boxSizes.forEach((size, si) =>
      rates.push({ line_type: 'ROLLING', sub_type: 'BOX_BAR_BEND', work_type: wt, thickness_or_size: size, price_basis: 'PER_PIECE', rate: rs(200 + si * 50 + wi * 30) }),
    ),
  );
  const coil: Record<string, number> = { '1-10': 5000, '10-50': 20000, '50<': 35000 };
  for (const [range, amount] of Object.entries(coil)) {
    rates.push({ line_type: 'COIL_CUTTING', sub_type: 'COIL_CUT', variant: range, price_basis: 'FIXED', rate: rs(amount) });
  }
  return rates;
}

// ── Roofing (prototype BASE_ORDERS) ─────────────────────────────────────────

const SHEET_RATES: Record<string, [number, number, number, number]> = {
  Roofing: [380, 420, 470, 60],
  Cladding: [360, 400, 450, 60],
  Flashing: [260, 300, 340, 80],
  Gutter: [440, 480, 520, 90],
  'Down Pipe': [420, 460, 500, 90],
  Wadimbu: [300, 340, 380, 80],
  'Valley Gutter': [400, 440, 480, 90],
  'Ridge Cap': [320, 360, 400, 80],
};
const ACCESSORY_RATES: Record<string, number> = { 'End Cap': 350, Nozzle: 650, 'Bracket (Aluminium)': 180, 'Gutter Box': 1200 };

function roofingRates(): SeedRate[] {
  const rates: SeedRate[] = [];
  const thicknesses = S.roofing.coil_thicknesses;
  for (const [category, [r35, r40, r47, customer]] of Object.entries(SHEET_RATES)) {
    [r35, r40, r47].forEach((r, i) =>
      rates.push({ line_type: 'ROOFING_SHEET', variant: category, thickness_or_size: thicknesses[i], price_basis: 'PER_FT', rate: rs(r) }),
    );
    rates.push({ line_type: 'ROOFING_SHEET', variant: category, material_source: 'CUSTOMER', price_basis: 'PER_FT', rate: rs(customer) });
  }
  rates.push({ line_type: 'ROOFING_SHEET', sub_type: 'CUT', price_basis: 'PER_CUT', rate: rs(25) });
  rates.push({ line_type: 'ROOFING_SHEET', sub_type: 'BEND', price_basis: 'PER_BEND', rate: rs(50) });
  for (const [name, r] of Object.entries(ACCESSORY_RATES)) {
    rates.push({ line_type: 'ROOFING_ACCESSORY', variant: name, price_basis: 'PER_PIECE', rate: rs(r) });
  }
  return rates;
}

export const MASTER_RATES: SeedRate[] = [...workshopRates(), ...roofingRates()];

// ── Items ───────────────────────────────────────────────────────────────────

const SEED_ORIGINS = ['CN', 'VN', 'KR-AJN'];

export const COIL_ITEMS: SeedItem[] = SEED_ORIGINS.flatMap((origin) =>
  S.roofing.coil_thicknesses.flatMap((thickness) =>
    S.roofing.coil_colors.map((color) => ({
      // Prototype coil number format, e.g. CN-047-RED
      sku: `${origin}-${thickness.replace(/\D/g, '').padStart(3, '0').slice(-3)}-${color}`,
      name: `${origin} ${thickness} ${COIL_COLOR_LABELS[color]} coil`,
      item_type: 'COIL' as const,
      category: 'Coils',
      unit: 'ft',
      attributes: { origin, thickness, color },
      price: 0,
      unit_cost: 0,
    })),
  ),
);

export const MATERIAL_ITEMS: SeedItem[] = Object.entries(MATERIAL_FACTORS).flatMap(([material, m]) =>
  S.workshop.thicknesses.map((t) => ({
    sku: `MAT-${m.code}-${t.toUpperCase().replace('.', '_')}`,
    name: `${material} ${t}`,
    item_type: 'MATERIAL' as const,
    category: 'Sheets',
    unit: 'sheet',
    attributes: { material_type: material, thickness: t },
    price: rs(Math.round(m.sheet * (0.6 + mm(t) * 0.25))),
    unit_cost: rs(Math.round(m.sheet * (0.45 + mm(t) * 0.2))),
  })),
);

// Prototype hardwareCatalog ITEMS
export const HARDWARE_ITEMS: SeedItem[] = [
  ['PIP-GI-100', 'GI pipe 1 inch', 'Pipes', 'length', 1250],
  ['PIP-GI-200', 'GI pipe 2 inch', 'Pipes', 'length', 2340],
  ['PIP-SQ-025', 'Square tube 25mm', 'Pipes', 'length', 980],
  ['SHT-MS-060', 'MS plate 6mm', 'Sheets', 'sheet', 8900],
  ['SHT-MS-030', 'MS plate 3mm', 'Sheets', 'sheet', 5400],
  ['SHT-GI-G20', 'GI sheet gauge 20', 'Sheets', 'sheet', 3750],
  ['BAR-AN-200', 'Angle iron 2 inch', 'Bars', 'length', 2100],
  ['BAR-FL-025', 'Flat bar 25mm', 'Bars', 'length', 860],
  ['BAR-RD-012', 'Round bar 12mm', 'Bars', 'length', 1140],
  ['FST-BM-1250', 'Bolt M12 ×50', 'Bolts', 'piece', 60],
  ['FST-NM-012', 'Nut M12', 'Bolts', 'piece', 25],
  ['FST-WS-012', 'Washer M12', 'Bolts', 'piece', 12],
  ['CON-WR-032', 'Welding rod 3.2mm', 'Consumables', 'kg', 1450],
  ['CON-CD-100', 'Cutting disc 4 inch', 'Consumables', 'piece', 340],
  ['CON-PR-001', 'Red oxide primer 1L', 'Consumables', 'tin', 1900],
].map(([sku, name, category, unit, price]) => ({
  sku: sku as string,
  name: name as string,
  item_type: 'HARDWARE' as const,
  category: category as string,
  unit: unit as string,
  attributes: {},
  price: rs(price as number),
  unit_cost: rs(Math.round((price as number) * 0.7)),
}));

export const ALL_ITEMS: SeedItem[] = [...HARDWARE_ITEMS, ...MATERIAL_ITEMS, ...COIL_ITEMS];

// ── Opening stock per branch code: sku → [quantity, reorder level] ──────────

const HARDWARE_STOCK: Record<string, Record<string, [number, number]>> = {
  // Prototype "main" stock — Naiwala is the main (distribution) branch
  'BR-NAI-001': {
    'PIP-GI-100': [48, 15], 'PIP-GI-200': [31, 12], 'PIP-SQ-025': [6, 10], 'SHT-MS-060': [3, 5], 'SHT-MS-030': [14, 5],
    'SHT-GI-G20': [22, 8], 'BAR-AN-200': [22, 10], 'BAR-FL-025': [0, 12], 'BAR-RD-012': [37, 10], 'FST-BM-1250': [0, 100],
    'FST-NM-012': [640, 100], 'FST-WS-012': [9, 100], 'CON-WR-032': [26, 8], 'CON-CD-100': [58, 20], 'CON-PR-001': [11, 6],
  },
  // Prototype "kandy" stock
  'BR-VEY-001': {
    'PIP-GI-100': [20, 15], 'PIP-GI-200': [0, 12], 'SHT-MS-060': [7, 5], 'BAR-AN-200': [15, 10], 'BAR-RD-012': [12, 10],
    'FST-BM-1250': [340, 100], 'FST-NM-012': [410, 100], 'CON-CD-100': [19, 20], 'CON-PR-001': [4, 6],
  },
  'BR-THA-001': {
    'PIP-GI-100': [12, 15], 'SHT-GI-G20': [18, 8], 'FST-NM-012': [520, 100], 'FST-WS-012': [140, 100], 'CON-PR-001': [8, 6],
  },
};

/** Opening stock for a branch. Coils only where the branch does roofing. */
export function openingStock(branchCode: string, hasRoofing: boolean): Record<string, [number, number]> {
  const stock: Record<string, [number, number]> = { ...(HARDWARE_STOCK[branchCode] ?? {}) };
  // Materials: deterministic spread so some are low or out
  MATERIAL_ITEMS.forEach((m, i) => {
    const qty = branchCode === 'BR-NAI-001' ? (i % 9 === 0 ? 0 : i % 5 === 0 ? 3 : 20 + (i % 7) * 4) : i % 4 === 0 ? 2 : 12 + (i % 5) * 3;
    stock[m.sku] = [qty, 5];
  });
  if (hasRoofing) {
    COIL_ITEMS.forEach((c, i) => {
      const qty = i % 11 === 0 ? 0 : i % 6 === 0 ? 150 : 1500 + (i % 8) * 250;
      stock[c.sku] = [qty, 300];
    });
  }
  return stock;
}
