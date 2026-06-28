import { z } from 'zod';
import { JobCardStatus } from '../enums/job-card-status.enum';

export const CreateJobCardSchema = z.object({
  customer_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  section_type: z.enum(['WORKSHOP', 'HARDWARE']),
  service_type: z.enum(['FABRICATION', 'BUY_MATERIALS']),
  notes: z.string().max(500).optional(),
});

export const UpdateJobCardStatusSchema = z.object({
  status: z.nativeEnum(JobCardStatus),
  version: z.number().int().positive(),
});

export const RequestCancellationSchema = z.object({
  reason_code: z.string().min(1).max(60),
  reason_detail: z.string().max(500).optional(),
});

export type CreateJobCardDto = z.infer<typeof CreateJobCardSchema>;
export type UpdateJobCardStatusDto = z.infer<typeof UpdateJobCardStatusSchema>;
export type RequestCancellationDto = z.infer<typeof RequestCancellationSchema>;
