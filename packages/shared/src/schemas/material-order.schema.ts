import { z } from 'zod';

export const MaterialOrderLineSchema = z.object({
  item_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  unit_price: z.number().int().nonnegative(),
});

export const CreateMaterialOrderSchema = z.object({
  job_card_id: z.string().uuid(),
  lines: z.array(MaterialOrderLineSchema).min(1),
  notes: z.string().max(500).optional(),
});

export type CreateMaterialOrderDto = z.infer<typeof CreateMaterialOrderSchema>;