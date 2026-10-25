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
});
export type RecordPaymentDto = z.infer<typeof RecordPaymentSchema>;
