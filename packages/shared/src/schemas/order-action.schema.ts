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
})
  // A payment never closes a card: the supervisor hands it over (Docs/decisions/0005)
  .strict();
export type RecordPaymentDto = z.infer<typeof RecordPaymentSchema>;

/** Cashier sends a card with nothing due (Rs 0 minimum advance) to the Workshop Queue without a payment. */
export const SendToWorkshopSchema = z.object({
  version: z.number().int().positive(),
});
export type SendToWorkshopDto = z.infer<typeof SendToWorkshopSchema>;

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

/** Check & hand over a completed, fully paid job card (supervisor, Docs/decisions/0005). */
export const CloseJobCardSchema = z.object({
  version: z.number().int().positive(),
  released_to: z.string().trim().min(1, 'Enter who collected the items').max(120),
  notes: z.string().trim().max(500).optional(),
});
export type CloseJobCardDto = z.infer<typeof CloseJobCardSchema>;
