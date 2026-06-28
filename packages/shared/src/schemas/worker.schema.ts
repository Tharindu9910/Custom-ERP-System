import { z } from 'zod';

export const CreateWorkerSchema = z.object({
  full_name: z.string().min(1).max(120),
  phone: z
    .string()
    .regex(/^\+?[0-9]{7,15}$/, 'Invalid phone number')
    .optional(),
  branch_id: z.string().uuid(),
});

export const UpdateWorkerSchema = z.object({
  full_name: z.string().min(1).max(120).optional(),
  phone: z
    .string()
    .regex(/^\+?[0-9]{7,15}$/, 'Invalid phone number')
    .optional(),
  is_active: z.boolean().optional(),
});

export type CreateWorkerDto = z.infer<typeof CreateWorkerSchema>;
export type UpdateWorkerDto = z.infer<typeof UpdateWorkerSchema>;