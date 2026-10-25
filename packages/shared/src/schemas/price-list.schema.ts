import { z } from 'zod';
import { ItemType } from '../enums/inventory.enums';
import { LineSubType, LineType, MaterialSource, PriceBasis } from '../enums/order.enums';
import { Cents } from './common.schema';

// One price list for every branch (Docs/decisions/0004). Money in cents.

const KeyText = z.string().trim().min(1).max(80).nullable().optional();

/** A new work rate. The key fields are fixed once created — deactivate and add a new row to change them. */
export const CreatePriceRateSchema = z.object({
  line_type: z.nativeEnum(LineType),
  sub_type: z.nativeEnum(LineSubType).nullable().optional(),
  variant: KeyText,
  work_type: KeyText,
  thickness_or_size: KeyText,
  material_source: z.nativeEnum(MaterialSource).default(MaterialSource.BRANCH),
  price_basis: z.nativeEnum(PriceBasis),
  rate: Cents,
});

export const UpdatePriceRateSchema = z
  .object({
    price_basis: z.nativeEnum(PriceBasis).optional(),
    rate: Cents.optional(),
    is_active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const PriceRateQuerySchema = z.object({
  line_type: z.nativeEnum(LineType).optional(),
  include_inactive: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
});

export const UpdateItemPriceSchema = z
  .object({
    price: Cents.optional(),
    unit_cost: Cents.optional(),
  })
  .refine((v) => v.price !== undefined || v.unit_cost !== undefined, 'Nothing to update');

export const ItemPriceQuerySchema = z.object({
  item_type: z.nativeEnum(ItemType).optional(),
  q: z.string().trim().max(80).optional(),
});

export type CreatePriceRateDto = z.infer<typeof CreatePriceRateSchema>;
export type UpdatePriceRateDto = z.infer<typeof UpdatePriceRateSchema>;
export type PriceRateQuery = z.infer<typeof PriceRateQuerySchema>;
export type UpdateItemPriceDto = z.infer<typeof UpdateItemPriceSchema>;
export type ItemPriceQuery = z.infer<typeof ItemPriceQuerySchema>;

/** A price_rate row as the Price List page shows it. */
export interface PriceRateView {
  rate_id: string;
  line_type: LineType;
  sub_type: LineSubType | null;
  variant: string | null;
  work_type: string | null;
  thickness_or_size: string | null;
  material_source: MaterialSource;
  price_basis: PriceBasis;
  rate: number;
  is_active: boolean;
  updated_at: string;
}

/** A catalogue item's prices as the Price List page shows them. */
export interface ItemPriceView {
  item_id: string;
  sku: string;
  name: string;
  item_type: ItemType;
  category: string | null;
  unit: string;
  attributes: Record<string, string>;
  price: number;
  unit_cost: number;
  is_active: boolean;
}
