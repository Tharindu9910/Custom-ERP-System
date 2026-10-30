import { z } from 'zod';
import { PaymentMode } from '../enums/payment-mode.enum';
import { ClientRequestId, StockOverrideSchema } from './common.schema';

/** Start a line (workshop) or an order (roofing). Override only when stock is short. */
export const StartWorkSchema = z.object({
  version: z.number().int().positive(),
  override: StockOverrideSchema.optional(),
});
export type StartWorkDto = z.infer<typeof StartWorkSchema>;

export const CompleteWorkSchema = z.object({
  version: z.number().int().positive(),
  note: z.string().trim().max(500).optional(),
});
export type CompleteWorkDto = z.infer<typeof CompleteWorkSchema>;

export const RecordPaymentSchema = z.object({
  client_request_id: ClientRequestId,
  amount: z.number().int().positive('Amount must be more than 0'),
  mode: z.nativeEnum(PaymentMode),
  reference: z.string().trim().max(80).optional(),
  // Completed job card: close it in the same transaction once nothing is owed (Docs/decisions/0005)
  close: z.boolean().optional(),
  released_to: z.string().trim().max(120).optional(),
});
export type RecordPaymentDto = z.infer<typeof RecordPaymentSchema>;

/** Card-level Start Job: the card moves to In Progress and the chosen sub-jobs start. */
export const StartJobCardSchema = z.object({
  version: z.number().int().positive(),
  line_ids: z.array(z.string().uuid()),
  override: StockOverrideSchema.optional(),
});
export type StartJobCardDto = z.infer<typeof StartJobCardSchema>;

/** Card-level Mark Completed: every started sub-job is completed and the card moves to Completed. */
export const CompleteJobCardSchema = CompleteWorkSchema;
export type CompleteJobCardDto = CompleteWorkDto;

/** Close & hand over a completed, fully paid job card. */
export const CloseJobCardSchema = z.object({
  version: z.number().int().positive(),
  released_to: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});
export type CloseJobCardDto = z.infer<typeof CloseJobCardSchema>;
