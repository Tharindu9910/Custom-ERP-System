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
}

/** Reasons offered when a supervisor marks a job customized by hand (BR24). */
export const CUSTOMIZED_REASONS = ['Non-standard size', 'Special design', 'Material not in price list', 'Rush job', 'Other'];

export function emptySubJob(jobType: WorkshopJobType, source: MaterialSource, defaults: { material?: string; rollingType?: string; workType?: string }): SubJobForm {
  return {
    key: crypto.randomUUID(),
    job_type: jobType,
    material_source: source,
    custom: false,
    customized_reason_code: '',
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
  const base = {
    line_id: f.line_id,
    material_source: f.material_source,
    custom: f.custom,
    customized_reason_code: f.custom ? f.customized_reason_code || undefined : undefined,
  };
  if (f.job_type === 'CUT_BEND') {
    return {
      job_type: 'CUT_BEND',
      ...base,
      // Standard fields are dropped in custom mode, custom fields in standard mode (prototype)
      material_type: custom ? undefined : f.material_type || undefined,
      thickness: custom ? undefined : f.thickness || undefined,
      material_quantity: custom ? undefined : int(f.material_quantity),
      cut_count: custom ? 0 : (int(f.cut_count) ?? 0),
      bend_count: custom ? 0 : (int(f.bend_count) ?? 0),
      inches: f.inches.trim() || undefined,
      custom_charges: custom
        ? [
            ...charge('CUT', f.cut_desc, f.cut_rate, f.cut_qty),
            ...charge('BEND', f.bend_desc, f.bend_rate, f.bend_qty),
            ...(f.sheet_roll_rate.trim() ? charge('ROLLING', 'Sheet rolling', f.sheet_roll_rate, f.sheet_roll_qty) : []),
          ]
        : [],
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
    rolling_type: custom ? undefined : f.rolling_type || undefined,
    work_type: custom ? undefined : f.work_type || undefined,
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
  if (f.job_type === 'ROLLING') {
    if (isCustomMode(f)) return 'Rolling (custom)';
    return `Rolling: ${f.rolling_type} - ${f.work_type}${f.size ? ` (Size: ${f.size})` : ''}${f.quantity ? ` - Qty: ${f.quantity}` : ''}`;
  }
  if (isCustomMode(f)) return 'Cut / Bend (custom)';
  return `${f.material_type}${f.thickness ? ` (${f.thickness})` : ''}${f.inches ? ` [${f.inches} inches]` : ''}${f.material_quantity ? ` - Qty: ${f.material_quantity}` : ''}`;
}
