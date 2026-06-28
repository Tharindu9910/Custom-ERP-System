import { z } from 'zod';
import { WorkOrderType } from '../enums/work-order-type.enum';
import { PricingModel } from '../enums/pricing-model.enum';

export const CreatePriceListEntrySchema = z.object({
  branch_id: z.string().uuid().nullable().optional(),
  work_order_type: z.nativeEnum(WorkOrderType),
  material_type: z.string().min(1).max(80),
  thickness_or_size: z.string().max(40).optional(),
  pricing_model: z.nativeEnum(PricingModel),
  rate: z.number().int().positive(),
});

export const UpdatePriceListEntrySchema = z.object({
  rate: z.number().int().positive(),
  is_active: z.boolean().optional(),
});

export type CreatePriceListEntryDto = z.infer<typeof CreatePriceListEntrySchema>;
export type UpdatePriceListEntryDto = z.infer<typeof UpdatePriceListEntrySchema>;