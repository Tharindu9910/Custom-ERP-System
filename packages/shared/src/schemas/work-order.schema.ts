import { z } from 'zod';
import { WorkOrderType } from '../enums/work-order-type.enum';
import { PricingModel } from '../enums/pricing-model.enum';

const CutBendSpecSchema = z.object({
  model: z.literal('CUT_BEND'),
  material_label: z.string().min(1),
  thickness_mm: z.number().positive().optional(),
  gauge_size: z.string().optional(),
  length_m: z.number().positive().optional(),
  sheet_cuts: z.number().int().positive().optional(),
  sheet_pieces: z.number().int().positive().optional(),
});

const RollingSpecSchema = z.object({
  model: z.literal('ROLLING'),
  material_type: z.string().min(1),
  work_type: z.string().min(1),
  size: z.string().min(1),
});

const CoilCutSpecSchema = z.object({
  model: z.literal('COIL_CUT'),
  weight_kg: z.number().positive(),
});

export const WorkOrderSpecSchema = z.discriminatedUnion('model', [
  CutBendSpecSchema,
  RollingSpecSchema,
  CoilCutSpecSchema,
]);

export const CreateWorkOrderSchema = z.object({
  job_card_id: z.string().uuid(),
  work_order_type: z.nativeEnum(WorkOrderType),
  pricing_model: z.nativeEnum(PricingModel),
  quantity: z.number().int().positive().optional(),
  weight_kg: z.number().positive().optional(),
  price: z.number().int().nonnegative(),
  spec: WorkOrderSpecSchema,
  worker_ids: z.array(z.string().uuid()).min(1),
  customer_supplied: z.boolean().optional().default(false),
  is_customized: z.boolean().optional().default(false),
  customized_reason_code: z.string().optional(),
});

export const UpdateWorkOrderStatusSchema = z.object({
  status: z.string(),
  version: z.number().int().positive(),
});

export type CreateWorkOrderDto = z.infer<typeof CreateWorkOrderSchema>;
export type UpdateWorkOrderStatusDto = z.infer<typeof UpdateWorkOrderStatusSchema>;
