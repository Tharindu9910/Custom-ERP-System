import { MaterialSource, WorkshopLineSchema, type CustomCharge, type WorkshopJobType, type WorkshopLineInput } from '@erp/shared';
import { centsToInput, parseMoney } from '@/shared/lib/format';

/**
 * One sub-job as the form edits it (strings, like the inputs). Converted to the
 * shared WorkshopLineInput for the API and back again when a job card is edited.
 */
export interface SubJobForm {
  key: string;
  line_id?: string;
  job_type: WorkshopJobType;
  material_source: MaterialSource;
  custom: boolean;
  customized_reason_code: string;
  // Customer material: the gate pass item this sub-job uses and how many pieces (Docs/decisions/0007)
  gp_item_id: string;
  gp_quantity: string;
  // Cut / Bend
  material_type: string;
  thickness: string;
  inches: string;
  material_quantity: string;
  cut_count: string;
  bend_count: string;
  cut_desc: string;
  cut_rate: string;
  cut_qty: string;
  bend_desc: string;
  bend_rate: string;
  bend_qty: string;
  sheet_roll_rate: string;
  sheet_roll_qty: string;
  // Coil cutting
  coil_material: string;
  amount_range: string;
  coil_desc: string;
  coil_rate: string;
  // Rolling
  rolling_type: string;
  work_type: string;
  size: string;
  quantity: string;
  roll_desc: string;
  roll_rate: string;
  roll_qty: string;
  // Advance the supervisor typed for a customized sub-job (Rs); '' = the suggested amount (Docs/decisions/0010)
  advance: string;
}

export const JOB_TYPE_LABEL: Record<WorkshopJobType, string> = { CUT_BEND: 'Cut / Bend', COIL_CUTTING: 'Coil Cutting', ROLLING: 'Rolling' };

/** Reasons offered when a supervisor marks a job customized by hand (BR24). */
export const CUSTOMIZED_REASONS = ['Non-standard size', 'Special design', 'Material not in price list', 'Rush job', 'Other'];

export function emptySubJob(jobType: WorkshopJobType, source: MaterialSource, defaults: { material?: string; rollingType?: string; workType?: string }): SubJobForm {
  return {
    key: crypto.randomUUID(),
    job_type: jobType,
    material_source: source,
    custom: false,
    customized_reason_code: '',
    gp_item_id: '',
    gp_quantity: '',
    material_type: defaults.material ?? '',
    thickness: '',
    inches: '',
    material_quantity: '',
    cut_count: '',
    bend_count: '',
    cut_desc: '',
    cut_rate: '',
    cut_qty: '',
    bend_desc: '',
    bend_rate: '',
    bend_qty: '',
    sheet_roll_rate: '',
    sheet_roll_qty: '',
    coil_material: '',
    amount_range: '',
    coil_desc: '',
    coil_rate: '',
    rolling_type: defaults.rollingType ?? '',
    work_type: defaults.workType ?? '',
    size: '',
    quantity: '',
    roll_desc: '',
    roll_rate: '',
    roll_qty: '',
    advance: '',
  };
}

/** Customized by hand or because the customer supplies the material (prototype rule). */
export const isCustomMode = (f: Pick<SubJobForm, 'job_type' | 'custom' | 'material_source'>) =>
  f.job_type === 'COIL_CUTTING' ? f.custom : f.custom || f.material_source === MaterialSource.CUSTOMER;

const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
const int = (v: string) => (v.trim() === '' ? undefined : Math.floor(Number(v)));

function charge(kind: CustomCharge['kind'], description: string, rate: string, qty: string): CustomCharge[] {
  if (!description.trim() && !rate.trim()) return [];
  return [{ kind, description: description.trim(), rate: parseMoney(rate), quantity: num(qty) ?? 1 }];
}

export function toLineInput(f: SubJobForm): WorkshopLineInput {
  const custom = isCustomMode(f);
  // Branch material is named even when priced by hand; the customer's comes from the gate pass item (Docs/decisions/0008)
  const branch = f.material_source === MaterialSource.BRANCH;
  const base = {
    line_id: f.line_id,
    material_source: f.material_source,
    custom: f.custom,
    customized_reason_code: f.custom ? f.customized_reason_code || undefined : undefined,
    customer_material:
      f.material_source === MaterialSource.CUSTOMER && f.gp_item_id ? { gp_item_id: f.gp_item_id, quantity: int(f.gp_quantity) ?? 0 } : undefined,
    // Only sent when typed; the server ignores it on standard work
    advance: f.advance.trim() ? parseMoney(f.advance) : undefined,
  };
  if (f.job_type === 'CUT_BEND') {
    return {
      job_type: 'CUT_BEND',
      ...base,
      material_type: branch ? f.material_type || undefined : undefined,
      thickness: branch ? f.thickness || undefined : undefined,
      material_quantity: branch ? int(f.material_quantity) : undefined,
      inches: branch ? f.inches.trim() || undefined : undefined,
      // Counts are priced by rate; custom mode prices cuts and bends by hand instead (prototype)
      cut_count: custom ? 0 : (int(f.cut_count) ?? 0),
      bend_count: custom ? 0 : (int(f.bend_count) ?? 0),
      custom_charges: [
        ...(custom ? [...charge('CUT', f.cut_desc, f.cut_rate, f.cut_qty), ...charge('BEND', f.bend_desc, f.bend_rate, f.bend_qty)] : []),
        // Sheet rolling is optional on every Cut / Bend line and always charged
        ...(f.sheet_roll_rate.trim() ? charge('ROLLING', 'Sheet rolling', f.sheet_roll_rate, f.sheet_roll_qty) : []),
      ],
    };
  }
  if (f.job_type === 'COIL_CUTTING') {
    return {
      job_type: 'COIL_CUTTING',
      ...base,
      coil_material: f.coil_material.trim(),
      amount_range: f.amount_range,
      custom_charges: custom ? charge('COIL_CUTTING', f.coil_desc || 'Coil cutting', f.coil_rate, '1') : [],
    };
  }
  return {
    job_type: 'ROLLING',
    ...base,
    rolling_type: branch ? f.rolling_type || undefined : undefined,
    work_type: branch ? f.work_type || undefined : undefined,
    size: custom ? undefined : f.size || undefined,
    quantity: custom ? undefined : int(f.quantity),
    custom_charges: custom ? charge('ROLLING', f.roll_desc, f.roll_rate, f.roll_qty) : [],
  };
}

/** Saved line spec (the input as stored) → form, for editing a job card. */
export function fromLineSpec(spec: Record<string, unknown>, lineId: string): SubJobForm {
  const s = spec as Partial<WorkshopLineInput> & Record<string, unknown>;
  const f = emptySubJob((s.job_type as WorkshopJobType) ?? 'CUT_BEND', (s.material_source as MaterialSource) ?? MaterialSource.BRANCH, {});
  f.line_id = lineId;
  f.custom = !!s.custom;
  f.customized_reason_code = (s.customized_reason_code as string) ?? '';
  const cm = s.customer_material as { gp_item_id: string; quantity: number } | null | undefined;
  if (cm) [f.gp_item_id, f.gp_quantity] = [cm.gp_item_id, String(cm.quantity)];
  const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
  const charges = ((s.custom_charges as CustomCharge[]) ?? []).slice();
  const take = (kind: CustomCharge['kind'], desc?: string) => {
    const i = charges.findIndex((c) => c.kind === kind && (desc === undefined || c.description === desc));
    return i >= 0 ? charges.splice(i, 1)[0] : undefined;
  };
  if (f.job_type === 'CUT_BEND') {
    f.material_type = str(s.material_type);
    f.thickness = str(s.thickness);
    f.inches = str(s.inches);
    f.material_quantity = str(s.material_quantity);
    f.cut_count = s.cut_count ? str(s.cut_count) : '';
    f.bend_count = s.bend_count ? str(s.bend_count) : '';
    const roll = take('ROLLING', 'Sheet rolling');
    const cut = take('CUT');
    const bend = take('BEND');
    if (cut) [f.cut_desc, f.cut_rate, f.cut_qty] = [cut.description, centsToInput(cut.rate), str(cut.quantity)];
    if (bend) [f.bend_desc, f.bend_rate, f.bend_qty] = [bend.description, centsToInput(bend.rate), str(bend.quantity)];
    if (roll) [f.sheet_roll_rate, f.sheet_roll_qty] = [centsToInput(roll.rate), str(roll.quantity)];
  } else if (f.job_type === 'COIL_CUTTING') {
    f.coil_material = str(s.coil_material);
    f.amount_range = str(s.amount_range);
    const c = take('COIL_CUTTING');
    if (c) [f.coil_desc, f.coil_rate] = [c.description, centsToInput(c.rate)];
  } else {
    f.rolling_type = str(s.rolling_type);
    f.work_type = str(s.work_type);
    f.size = str(s.size);
    f.quantity = str(s.quantity);
    const r = take('ROLLING');
    if (r) [f.roll_desc, f.roll_rate, f.roll_qty] = [r.description, centsToInput(r.rate), str(r.quantity)];
  }
  return f;
}

/** What is still missing before the sub-job can be added (same rules the server applies). */
export function subJobIssues(f: SubJobForm): string[] {
  const result = WorkshopLineSchema.safeParse(toLineInput(f));
  return result.success ? [] : [...new Set(result.error.issues.map((i) => i.message))];
}

/** One-line summary used in the sub-job list. */
export function describeSubJob(f: SubJobForm): string {
  if (f.job_type === 'COIL_CUTTING') return `Coil Cutting: ${f.coil_material} - ${f.amount_range} Ton`;
  const customer = f.material_source === MaterialSource.CUSTOMER;
  if (f.job_type === 'ROLLING') {
    if (isCustomMode(f)) return customer || !f.rolling_type ? 'Rolling (custom)' : `Rolling: ${f.rolling_type}${f.work_type ? ` - ${f.work_type}` : ''} · custom`;
    return `Rolling: ${f.rolling_type} - ${f.work_type}${f.size ? ` (Size: ${f.size})` : ''}${f.quantity ? ` - Qty: ${f.quantity}` : ''}`;
  }
  if (customer) return 'Cut / Bend (custom)';
  const material = `${f.material_type}${f.thickness ? ` (${f.thickness})` : ''}${f.inches ? ` [${f.inches} inches]` : ''}${f.material_quantity ? ` - Qty: ${f.material_quantity}` : ''}`;
  return isCustomMode(f) ? `${material} · custom` : material;
}

/** A sheet material's stock at this branch (from the workshop catalog). */
export interface SheetStock {
  item_id: string;
  material_type: string;
  thickness: string;
  unit: string;
  available: number;
}

export interface SheetNeed {
  /** "MS Plain Sheet 2mm" */
  label: string;
  unit: string;
  /** Sheets the card's branch Cut / Bend sub-jobs use */
  need: number;
  /** Available now, plus what this card already holds (edit) */
  free: number;
}

/** Same key the server prices and holds stock by (material + thickness, case-insensitive). */
export const sheetKey = (material: string, thickness: string) => `${material.trim().toLowerCase()}|${thickness.trim().toLowerCase()}`;

/**
 * Branch sheets the given sub-jobs need against what is free, per material + thickness,
 * worked out in the browser from the catalog loaded once — no API call per keystroke
 * (Docs/decisions/0009). `held` = item id → sheets this card already holds (edit).
 * Uncatalogued materials are left out: they are not stock-tracked.
 */
export function sheetNeeds(jobs: SubJobForm[], stock: readonly SheetStock[], held: Record<string, number> = {}): Map<string, SheetNeed> {
  const byKey = new Map(stock.map((s) => [sheetKey(s.material_type, s.thickness), s]));
  const result = new Map<string, SheetNeed>();
  for (const j of jobs) {
    if (j.job_type !== 'CUT_BEND' || j.material_source !== MaterialSource.BRANCH) continue;
    const qty = int(j.material_quantity) ?? 0;
    const key = sheetKey(j.material_type, j.thickness);
    const s = byKey.get(key);
    if (!s || qty <= 0) continue;
    const prev = result.get(key);
    result.set(key, {
      label: `${s.material_type} ${s.thickness}`,
      unit: s.unit,
      need: (prev?.need ?? 0) + qty,
      free: prev?.free ?? s.available + (held[s.item_id] ?? 0),
    });
  }
  return result;
}
