import { z } from 'zod';

export const CreateWorkerSchema = z.object({
  full_name: z.string().min(1).max(120),
  employee_code: z.string().min(1).max(20).optional(),
  designation: z.string().max(80).optional(),
  phone: z
    .string()
    .regex(/^\+?[0-9]{7,15}$/, 'Invalid phone number')
    .optional(),
  branch_id: z.string().uuid(),
});

export const UpdateWorkerSchema = z.object({
  full_name: z.string().min(1).max(120).optional(),
  designation: z.string().max(80).optional(),
  phone: z
    .string()
    .regex(/^\+?[0-9]{7,15}$/, 'Invalid phone number')
    .optional(),
  is_active: z.boolean().optional(),
});

export type CreateWorkerDto = z.infer<typeof CreateWorkerSchema>;
export type UpdateWorkerDto = z.infer<typeof UpdateWorkerSchema>;

// What the API accepts today: types and sizes only. Unknown keys (e.g. branch_id) are ignored, so
// existing clients keep working; the stricter schemas above are for the forms.
const text = (max: number) => z.string().trim().max(max);
export const WorkerCreateBodySchema = z.object({
  full_name: text(120).min(1, 'Enter the worker name'),
  employee_code: text(20).optional(),
  designation: text(80).nullable().optional(),
  phone: text(30).nullable().optional(),
});
export const WorkerUpdateBodySchema = z.object({
  full_name: text(120).min(1, 'Enter the worker name').optional(),
  designation: text(80).nullable().optional(),
  phone: text(30).nullable().optional(),
  is_active: z.boolean().optional(),
});
export const WorkerListQuerySchema = z.object({ active: z.string().max(10).optional() });
