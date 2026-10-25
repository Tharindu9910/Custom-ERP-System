import { z } from 'zod';
import { MaterialSource } from '../enums/order.enums';
import { PaymentMode } from '../enums/payment-mode.enum';
import { ROOFING_CATEGORIES, type RoofingConfig } from './branch-settings.schema';
import { Cents, ClientRequestId, CustomerRefSchema, LocalDate, MaterialAllocationsSchema, OptionalId, StockOverrideSchema } from './common.schema';

export const ROOFING_JOB_TYPES = ['STANDARD', 'CUSTOMIZED'] as const;
export type RoofingJobType = (typeof ROOFING_JOB_TYPES)[number];

// One order item. Field rules that depend on branch settings are checked by
// validateRoofingLine (shared by the form's "Still needed" hint and the server).
export const RoofingLineSchema = z.object({
  line_id: OptionalId,
  category: z.enum(ROOFING_CATEGORIES),
  job_type: z.enum(ROOFING_JOB_TYPES).default('STANDARD'),
  material_source: z.nativeEnum(MaterialSource).default(MaterialSource.BRANCH),
  coil_item_id: OptionalId,
  // Sheet items
  pattern: z.string().trim().max(80).optional(),
  length_ft: z.number().positive().optional(),
  pieces: z.number().int().min(1).optional(),
  total_cuts: z.number().int().min(0).default(0),
  total_bends: z.number().int().min(0).default(0),
  // Accessory items
  accessory_type: z.string().trim().max(80).optional(),
  accessory_variant: z.string().trim().max(80).optional(),
  quantity: z.number().int().min(1).optional(),
  design_attachment_id: OptionalId,
  remarks: z.string().trim().max(500).optional(),
});
export type RoofingLineInput = z.infer<typeof RoofingLineSchema>;

export const PaymentCaptureSchema = z.object({
  amount: Cents,
  mode: z.nativeEnum(PaymentMode),
  reference: z.string().trim().max(80).optional(),
});
export type PaymentCapture = z.infer<typeof PaymentCaptureSchema>;

const roofingBody = {
  customer: CustomerRefSchema,
  order_date: LocalDate,
  technician: z.string().trim().max(120).optional(),
  material_source: z.nativeEnum(MaterialSource).default(MaterialSource.BRANCH),
  // One coil applied to every branch-material item that needs a coil
  global_coil_item_id: OptionalId,
  gate_pass_id: OptionalId,
  allocations: MaterialAllocationsSchema,
  lines: z.array(RoofingLineSchema).min(1, 'Add at least one item'),
  discount: Cents.default(0),
  // Branch material is reserved on save; given only after a 409 STOCK_INSUFFICIENT (Docs/decisions/0003)
  override: StockOverrideSchema.optional(),
};

export const CreateRoofingOrderSchema = z.object({
  client_request_id: ClientRequestId,
  ...roofingBody,
  payment: PaymentCaptureSchema,
});
export type CreateRoofingOrderDto = z.infer<typeof CreateRoofingOrderSchema>;

export const UpdateRoofingOrderSchema = z.object({
  version: z.number().int().positive(),
  ...roofingBody,
});
export type UpdateRoofingOrderDto = z.infer<typeof UpdateRoofingOrderSchema>;

export const QuoteRoofingSchema = z.object({
  lines: z.array(RoofingLineSchema).min(1),
  global_coil_item_id: OptionalId,
  discount: Cents.default(0),
});
export type QuoteRoofingDto = z.infer<typeof QuoteRoofingSchema>;

export const ReleaseOrderSchema = z.object({
  version: z.number().int().positive(),
  released_to: z.string().trim().min(1, 'Enter who collected the order').max(120),
  note: z.string().trim().max(500).optional(),
});
export type ReleaseOrderDto = z.infer<typeof ReleaseOrderSchema>;

export const ROOFING_QUEUE_TABS = ['ACTIVE', 'PLACED', 'IN_PROGRESS', 'READY', 'RELEASED', 'CANCELLED', 'ALL'] as const;
export type RoofingQueueTab = (typeof ROOFING_QUEUE_TABS)[number];

export const RoofingQueueQuerySchema = z.object({
  tab: z.enum(ROOFING_QUEUE_TABS).default('ACTIVE'),
  search: z.string().trim().max(80).optional(),
  placed_on: LocalDate.optional(),
});
export type RoofingQueueQuery = z.infer<typeof RoofingQueueQuerySchema>;

// ── Item rules (ported from the prototype's orderCatalog.validateItem) ──────

export const isAccessoryCategory = (category: string) => category === 'Gutter Accessories';

export function accessoryNeedsCoil(roofing: RoofingConfig, accessoryType?: string): boolean {
  const acc = roofing.accessories.find((a) => a.name === accessoryType);
  return !acc?.no_coil;
}

/** Customer-supplied items and no-coil accessories don't need a coil. */
export function lineNeedsCoil(line: RoofingLineInput, roofing: RoofingConfig): boolean {
  if (line.material_source === MaterialSource.CUSTOMER) return false;
  if (isAccessoryCategory(line.category)) return accessoryNeedsCoil(roofing, line.accessory_type);
  return true;
}

/** A pattern is needed for standard branch-material sheets in categories that have patterns. */
export function lineNeedsPattern(line: RoofingLineInput, roofing: RoofingConfig): boolean {
  if (isAccessoryCategory(line.category)) return false;
  if (line.job_type !== 'STANDARD' || line.material_source !== MaterialSource.BRANCH) return false;
  return (roofing.patterns[line.category] ?? []).length > 0;
}

/** Running feet for a sheet item. */
export const runningFt = (line: Pick<RoofingLineInput, 'length_ft' | 'pieces'>) =>
  (line.length_ft ?? 0) * (line.pieces ?? 0);

/** Returns what is still missing; an empty list means the item is complete. */
export function validateRoofingLine(line: RoofingLineInput, roofing: RoofingConfig, hasOrderCoil: boolean): string[] {
  const missing: string[] = [];
  if (!roofing.categories.includes(line.category)) missing.push('a category enabled for this branch');
  if (lineNeedsCoil(line, roofing) && !hasOrderCoil && !line.coil_item_id) missing.push('coil');
  if (isAccessoryCategory(line.category)) {
    const acc = roofing.accessories.find((a) => a.name === line.accessory_type);
    if (!acc) missing.push('accessory');
    else if (acc.variants.length > 0 && !line.accessory_variant) missing.push('shape');
    if (!line.quantity || line.quantity < 1) missing.push('quantity');
  } else {
    if (lineNeedsPattern(line, roofing) && !line.pattern) missing.push('design pattern');
    if (!line.length_ft || line.length_ft <= 0) missing.push('length');
    if (!line.pieces || line.pieces < 1) missing.push('number of pieces');
  }
  if (line.job_type === 'CUSTOMIZED' && roofing.require_design_photo && !line.design_attachment_id) {
    missing.push('design photo');
  }
  return missing;
}

/**
 * Keeps only the fields that belong to the item's category, job type and source
 * (prototype normalizeItem). The server stores the normalized line; the form uses
 * it before adding an item so both see the same thing.
 */
export function normalizeRoofingLine(line: RoofingLineInput, roofing: RoofingConfig, orderCoilId?: string | null): RoofingLineInput {
  const accessory = isAccessoryCategory(line.category);
  const acc = accessory ? roofing.accessories.find((a) => a.name === line.accessory_type) : undefined;
  const custom = line.job_type === 'CUSTOMIZED';
  const needsCoil = lineNeedsCoil(line, roofing);
  return {
    line_id: line.line_id ?? undefined,
    category: line.category,
    job_type: line.job_type,
    material_source: line.material_source,
    coil_item_id: needsCoil ? (orderCoilId || line.coil_item_id) ?? undefined : undefined,
    pattern: lineNeedsPattern(line, roofing) ? line.pattern : undefined,
    length_ft: accessory ? undefined : line.length_ft,
    pieces: accessory ? undefined : line.pieces,
    total_cuts: accessory ? 0 : line.total_cuts,
    total_bends: accessory ? 0 : line.total_bends,
    accessory_type: accessory ? line.accessory_type : undefined,
    accessory_variant: accessory && acc && acc.variants.length > 0 ? line.accessory_variant : undefined,
    quantity: accessory ? line.quantity : undefined,
    design_attachment_id: custom ? (line.design_attachment_id ?? undefined) : undefined,
    remarks: line.remarks?.trim() || undefined,
  };
}

/** Item title as the prototype shows it: accessory + shape, "Customized design", or the pattern. */
export function roofingItemTitle(line: Pick<RoofingLineInput, 'category' | 'job_type' | 'pattern' | 'accessory_type' | 'accessory_variant'>): string {
  if (isAccessoryCategory(line.category)) return [line.accessory_type, line.accessory_variant].filter(Boolean).join(' – ');
  if (line.job_type === 'CUSTOMIZED') return 'Customized design';
  return line.pattern || line.category;
}

/**
 * BR10: a branch-material sheet item uses coil ft (length × pieces), deducted when
 * the order starts. Accessories have no length, so they deduct nothing for now.
 */
export const lineDeductsCoil = (line: Pick<RoofingLineInput, 'category' | 'material_source'>) =>
  !isAccessoryCategory(line.category) && line.material_source === MaterialSource.BRANCH;

// ── Coils ──────────────────────────────────────────────────────────────────

/** Coil origin and colour codes used in branch settings → labels (prototype orderCatalog). */
export const COIL_ORIGIN_LABELS: Record<string, string> = {
  CN: 'China',
  VN: 'Vietnam',
  'KR-AJN': 'Korea – AJN Steel',
  'KR-USC': 'Korea – Union Steel',
  'KR-NPN': 'Korea – Nippon Steel',
};

export const COIL_COLOR_LABELS: Record<string, string> = {
  RED: 'Red',
  MRN: 'Maroon',
  BLU: 'Blue',
  GRN: 'Green',
  CGR: 'Charcoal Grey',
  ZAL: 'Zinc Aluminium',
};

/** "0.47mm · Red · China" */
export function coilDetails(attrs: { thickness?: string; color?: string; origin?: string }): string {
  return [attrs.thickness, attrs.color && (COIL_COLOR_LABELS[attrs.color] ?? attrs.color), attrs.origin && (COIL_ORIGIN_LABELS[attrs.origin] ?? attrs.origin)]
    .filter(Boolean)
    .join(' · ');
}

// ── Queue ──────────────────────────────────────────────────────────────────

export interface RoofingQueueCounts {
  active: number;
  placed: number;
  in_progress: number;
  ready: number;
  ready_unpaid: number;
  released: number;
  released_today: number;
  cancelled: number;
  all: number;
  /** Sum of balances on active orders (cents) */
  balance_due: number;
}

export const ATTACHMENT_PURPOSES = ['DESIGN_PHOTO'] as const;
export type AttachmentPurpose = (typeof ATTACHMENT_PURPOSES)[number];
