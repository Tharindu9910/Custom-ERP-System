import { z } from 'zod';
import { PaymentMode } from '../enums/payment-mode.enum';
import { PaymentType } from '../enums/payment-type.enum';

export const CreatePaymentSchema = z.object({
  job_card_id: z.string().uuid(),
  amount: z.number().int().positive(),
  mode: z.nativeEnum(PaymentMode),
  type: z.nativeEnum(PaymentType),
  notes: z.string().max(255).optional(),
});

export type CreatePaymentDto = z.infer<typeof CreatePaymentSchema>;