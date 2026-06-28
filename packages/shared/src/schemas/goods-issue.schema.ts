import { z } from 'zod';

export const GoodsIssueLineSchema = z.object({
  item_id: z.string().uuid(),
  quantity: z.number().int().positive(),
});

export const CreateGoodsIssueSchema = z.object({
  source_branch_id: z.string().uuid(),
  target_branch_id: z.string().uuid(),
  lines: z.array(GoodsIssueLineSchema).min(1),
  notes: z.string().max(500).optional(),
});

export type CreateGoodsIssueDto = z.infer<typeof CreateGoodsIssueSchema>;