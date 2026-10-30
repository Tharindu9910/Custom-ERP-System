import { z } from 'zod';
import { PaymentMode } from '../enums/payment-mode.enum';
import { ClientRequestId, CustomerRefSchema } from './common.schema';

// Hardware Store and Hardware Queue (Docs/decisions/0006). Prices are never sent:
// the server prices every line from item.price.

const Quantity = z
  .number()
  .positive('Quantity must be more than 0')
  .max(100_000)
  .refine((q) => Math.abs(q * 1000 - Math.round(q * 1000)) < 1e-6, 'Use at most 3 decimal places');

export const HardwareSaleLineSchema = z.object({
  item_id: z.string().uuid(),
  quantity: Quantity,
});

export const HardwarePaymentSchema = z.object({
  amount: z.number().int().positive('Amount must be more than 0'),
  mode: z.nativeEnum(PaymentMode),
  reference: z.string().trim().max(80).optional(),
});

export const CreateHardwareSaleSchema = z.object({
  client_request_id: ClientRequestId,
  // Omitted = the user's own branch. Another branch needs create:cross_branch_hardware_sale.
  branch_id: z.guid().optional(),
  // Omitted = walk-in. Given = found or created by phone, like job card intake.
  customer: CustomerRefSchema.optional(),
  notes: z.string().trim().max(500).optional(),
  lines: z
    .array(HardwareSaleLineSchema)
    .min(1, 'Add at least one item')
    .max(100)
    .refine((ls) => new Set(ls.map((l) => l.item_id)).size === ls.length, 'Each item can appear once — change its quantity instead'),
  // Own branch: the full total (counter sale). Another branch: an advance only.
  payment: HardwarePaymentSchema.optional(),
});
export type CreateHardwareSaleDto = z.infer<typeof CreateHardwareSaleSchema>;

/** Collect the balance; amount must equal it exactly (the cashier confirms the figure shown). */
export const PayHardwareSaleSchema = HardwarePaymentSchema.extend({
  client_request_id: ClientRequestId,
  version: z.number().int().positive(),
});
export type PayHardwareSaleDto = z.infer<typeof PayHardwareSaleSchema>;

export const CancelHardwareSaleSchema = z.object({
  version: z.number().int().positive(),
  reason: z.string().trim().min(3, 'A reason is required').max(300),
});
export type CancelHardwareSaleDto = z.infer<typeof CancelHardwareSaleSchema>;

export const HardwareStoreQuerySchema = z.object({
  branch_id: z.guid().optional(),
});
export type HardwareStoreQuery = z.infer<typeof HardwareStoreQuerySchema>;
