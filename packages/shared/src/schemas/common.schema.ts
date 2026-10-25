import { z } from 'zod';

/** Client-generated id that makes a create safe to retry (and to sync later from offline). */
export const ClientRequestId = z.string().uuid();

/** Money in integer cents (Rs × 100). */
export const Cents = z.number().int().min(0);

/** A calendar date in the branch's timezone, YYYY-MM-DD. */
export const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/** Customer as typed on intake forms; the server finds or creates the profile by phone. */
export const CustomerRefSchema = z.object({
  phone: z.string().trim().min(7, 'Enter a valid phone number').max(20),
  name: z.string().trim().min(1, 'Customer name is required').max(120),
});
export type CustomerRef = z.infer<typeof CustomerRefSchema>;

export const VersionSchema = z.object({
  version: z.number().int().positive(),
});
export type VersionDto = z.infer<typeof VersionSchema>;

/** Stock override given by the supervisor when there is not enough stock. */
export const StockOverrideSchema = z.object({
  password: z.string().min(1, 'Override password is required'),
  reason: z.string().trim().min(3, 'Give a reason for the override').max(500),
});
export type StockOverride = z.infer<typeof StockOverrideSchema>;

export const ReasonSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required').max(500),
});
export type ReasonDto = z.infer<typeof ReasonSchema>;

/** Optional id that also accepts null from JSON clients (null = not given). */
export const OptionalId = z.string().uuid().nullish();

/** Optional draft id (null = not given). */
// Customer material picked from the order's gate pass; saved to the order when it is placed
export const MaterialAllocationsSchema = z
  .array(z.object({ gp_item_id: z.string().uuid(), quantity: z.number().int().min(1) }))
  .min(1, 'Allocate at least one piece')
  .refine((a) => new Set(a.map((x) => x.gp_item_id)).size === a.length, 'Each gate pass item can be allocated only once')
  .nullish();
