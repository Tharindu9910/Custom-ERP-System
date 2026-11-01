import {
  MaterialSource,
  isAccessoryCategory,
  type RoofingCategory,
  type RoofingJobType,
  type RoofingLineInput,
} from '@erp/shared';
import { centsToInput, parseMoney } from '@/shared/lib/format';

/** An item in the order form's list (one order line once saved). */
export interface OrderItem extends RoofingLineInput {
  key: string;
  /** A customized item's advance as typed (Rs); empty = the suggestion (Docs/decisions/0011) */
  advance_text?: string;
}

/**
 * The item editor: category may not be picked yet. The customer's gate pass item and pieces
 * are kept as typed (Docs/decisions/0007) and become customer_material on the item.
 */
export type ItemDraft = Omit<RoofingLineInput, 'category' | 'customer_material'> & {
  category?: RoofingCategory;
  gp_item_id?: string;
  gp_quantity?: string;
};

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
  gp_item_id: '',
  gp_quantity: '',
});

/** An item as the gate pass helpers count it (pieces per gate pass item). */
export const materialUse = (item: OrderItem) => ({
  key: item.key,
  material_source: item.material_source,
  gp_item_id: item.customer_material?.gp_item_id,
  gp_quantity: item.customer_material ? String(item.customer_material.quantity) : undefined,
});

export const emptyAccessoryRow = (coil?: string): AccessoryRow => ({ key: newKey(), quantity: 1, coil_item_id: coil, remarks: '' });

/** The gate pass item and pieces an editor draft takes, when it is on the customer's material. */
function draftMaterial(draft: ItemDraft): RoofingLineInput['customer_material'] {
  if (draft.material_source !== MaterialSource.CUSTOMER || !draft.gp_item_id) return undefined;
  return { gp_item_id: draft.gp_item_id, quantity: Math.floor(Number(draft.gp_quantity) || 0) };
}

/** A saved item back into the editor (an edited item goes back to its suggested advance). */
export function toDraft(item: OrderItem): ItemDraft {
  const draft: Partial<OrderItem> & ItemDraft = { ...item, gp_item_id: item.customer_material?.gp_item_id, gp_quantity: item.customer_material ? String(item.customer_material.quantity) : '' };
  delete draft.key;
  delete draft.customer_material;
  delete draft.advance;
  delete draft.advance_text;
  return draft;
}

/** What the API takes for an item: a typed advance only on a customized item. */
export function toLine(item: OrderItem): RoofingLineInput {
  const line: Partial<OrderItem> = { ...item };
  delete line.key;
  delete line.advance_text;
  const typed = item.job_type === 'CUSTOMIZED' ? item.advance_text?.trim() : '';
  line.advance = typed ? parseMoney(typed) : undefined;
  return line as RoofingLineInput;
}

/** The editor's items: one for a sheet, one per accessory row. */
export function draftItems(draft: ItemDraft, rows: AccessoryRow[]): RoofingLineInput[] {
  if (!draft.category) return [];
  const category = draft.category;
  const line: ItemDraft = { ...draft };
  delete line.gp_item_id;
  delete line.gp_quantity;
  const customer_material = draftMaterial(draft);
  if (!isAccessoryCategory(category)) return [{ ...line, category, customer_material }];
  return rows.map((r) => ({
    ...line,
    category,
    customer_material,
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
  'customer_material',
];

/** A saved line back into a form item (edit); a customized item keeps the advance it was saved with. */
export function fromLineSpec(spec: Record<string, unknown>, lineId: string): OrderItem {
  const item = Object.fromEntries(SPEC_KEYS.filter((k) => spec[k] !== undefined && spec[k] !== null).map((k) => [k, spec[k]])) as unknown as RoofingLineInput;
  const advance = typeof spec.advance === 'number' && item.job_type === 'CUSTOMIZED' ? centsToInput(spec.advance) : '';
  return { ...item, total_cuts: item.total_cuts ?? 0, total_bends: item.total_bends ?? 0, line_id: lineId, key: newKey(), advance_text: advance };
}
