import {
  MaterialSource,
  isAccessoryCategory,
  type RoofingCategory,
  type RoofingJobType,
  type RoofingLineInput,
} from '@erp/shared';

/** An item in the order form's list (one order line once saved). */
export interface OrderItem extends RoofingLineInput {
  key: string;
}

/** The item editor: category may not be picked yet. */
export type ItemDraft = Omit<RoofingLineInput, 'category'> & { category?: RoofingCategory };

/** One accessory line in the editor; each becomes its own item (prototype AccessoryRow). */
export interface AccessoryRow {
  key: string;
  accessory_type?: string;
  accessory_variant?: string;
  quantity?: number;
  coil_item_id?: string;
  design_attachment_id?: string;
  remarks?: string;
}

export const newKey = () => crypto.randomUUID();

export const emptyDraft = (source: MaterialSource, category?: RoofingCategory, jobType: RoofingJobType = 'STANDARD', coil?: string): ItemDraft => ({
  category,
  job_type: jobType,
  material_source: source,
  coil_item_id: coil,
  total_cuts: 0,
  total_bends: 0,
  remarks: '',
});

export const emptyAccessoryRow = (coil?: string): AccessoryRow => ({ key: newKey(), quantity: 1, coil_item_id: coil, remarks: '' });

/** What the API takes for an item. */
export function toLine(item: OrderItem): RoofingLineInput {
  const line: Partial<OrderItem> = { ...item };
  delete line.key;
  return line as RoofingLineInput;
}

/** The editor's items: one for a sheet, one per accessory row. */
export function draftItems(draft: ItemDraft, rows: AccessoryRow[]): RoofingLineInput[] {
  if (!draft.category) return [];
  const category = draft.category;
  if (!isAccessoryCategory(category)) return [{ ...draft, category }];
  return rows.map((r) => ({
    ...draft,
    category,
    accessory_type: r.accessory_type,
    accessory_variant: r.accessory_variant,
    quantity: r.quantity,
    coil_item_id: r.coil_item_id,
    design_attachment_id: r.design_attachment_id,
    remarks: r.remarks,
  }));
}

const SPEC_KEYS: (keyof RoofingLineInput)[] = [
  'category',
  'job_type',
  'material_source',
  'coil_item_id',
  'pattern',
  'length_ft',
  'pieces',
  'total_cuts',
  'total_bends',
  'accessory_type',
  'accessory_variant',
  'quantity',
  'design_attachment_id',
  'remarks',
];

/** A saved line back into a form item (edit). */
export function fromLineSpec(spec: Record<string, unknown>, lineId: string): OrderItem {
  const item = Object.fromEntries(SPEC_KEYS.filter((k) => spec[k] !== undefined && spec[k] !== null).map((k) => [k, spec[k]])) as unknown as RoofingLineInput;
  return { ...item, total_cuts: item.total_cuts ?? 0, total_bends: item.total_bends ?? 0, line_id: lineId, key: newKey() };
}
