import { z } from 'zod';
import { ItemType } from '../enums/inventory.enums';
import { Cents, ClientRequestId, ReasonSchema } from './common.schema';

/** New catalogue products (Docs/decisions/0013). */

const Text = (max: number, message: string) => z.string().trim().min(1, message).max(max);
const Attr = z.string().trim().max(40).optional();

/** Stock quantities are NUMERIC(14,3). */
const Quantity = z.number().finite().multipleOf(0.001, 'Use at most 3 decimal places').min(0, 'Cannot be negative').max(1_000_000);

const ItemFields = z.object({
  name: Text(120, 'Name is required'),
  item_type: z.nativeEnum(ItemType),
  category: Text(60, 'Category is required'),
  unit: Text(20, 'Unit is required'),
  attributes: z
    .object({ material_type: Attr, thickness: Attr, origin: Attr, color: Attr, size: Attr })
    .default({}),
});
type ItemFieldsInput = z.infer<typeof ItemFields>;

/** Pricing looks sheets up by material + thickness, and coils by thickness / colour / origin. */
const REQUIRED_ATTRIBUTES: Partial<Record<ItemType, (keyof ItemFieldsInput['attributes'])[]>> = {
  [ItemType.MATERIAL]: ['material_type', 'thickness'],
  [ItemType.COIL]: ['origin', 'thickness', 'color'],
};

function checkAttributes(v: ItemFieldsInput, ctx: z.RefinementCtx) {
  for (const key of REQUIRED_ATTRIBUTES[v.item_type] ?? []) {
    if (!v.attributes[key]) ctx.addIssue({ code: 'custom', path: ['attributes', key], message: `${key.replace('_', ' ')} is required` });
  }
}

/** Coils are priced by the roofing rates; everything else sells at the item price, so it can't be 0. */
function checkPrice(v: { item_type: ItemType; price: number }, ctx: z.RefinementCtx) {
  if (v.item_type !== ItemType.COIL && v.price <= 0) ctx.addIssue({ code: 'custom', path: ['price'], message: 'Set a selling price' });
}

const Sku = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{1,39}$/, 'Use 2–40 letters, digits, - or _');

/** What the approver (or head office) fixes before the item goes live. */
const LiveFields = { sku: Sku, price: Cents, unit_cost: Cents };

/** Head office adds a product directly (Price List). */
export const CreateItemSchema = ItemFields.extend(LiveFields).superRefine((v, ctx) => {
  checkAttributes(v, ctx);
  checkPrice(v, ctx);
});
export type CreateItemDto = z.infer<typeof CreateItemSchema>;

/** The branch manager's decision: final fields, SKU, price and the branch minimum. */
export const ApproveItemRequestSchema = ItemFields.extend({ ...LiveFields, reorder_level: Quantity }).superRefine((v, ctx) => {
  checkAttributes(v, ctx);
  checkPrice(v, ctx);
});
export type ApproveItemRequestDto = z.infer<typeof ApproveItemRequestSchema>;

/**
 * A branch asks for a new product. A manager may send `approve` with it: then the request
 * is approved in the same step ("posts directly", still audited).
 */
export const CreateItemRequestSchema = ItemFields.extend({
  client_request_id: ClientRequestId,
  suggested_price: Cents.optional(),
  suggested_cost: Cents.optional(),
  note: z.string().trim().max(500).optional(),
  approve: z.object({ ...LiveFields, reorder_level: Quantity }).optional(),
}).superRefine((v, ctx) => {
  checkAttributes(v, ctx);
  if (v.approve) checkPrice({ item_type: v.item_type, price: v.approve.price }, ctx);
});
export type CreateItemRequestDto = z.infer<typeof CreateItemRequestSchema>;

export const RejectItemRequestSchema = ReasonSchema;
export type RejectItemRequestDto = z.infer<typeof RejectItemRequestSchema>;

export const ItemRequestQuerySchema = z.object({
  status: z.enum(['OPEN', 'ALL']).default('OPEN'),
});
export type ItemRequestQuery = z.infer<typeof ItemRequestQuerySchema>;
