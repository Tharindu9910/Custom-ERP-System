import { z } from 'zod';

/** Client-generated id that makes a create safe to retry (and to sync later from offline). */
export const ClientRequestId = z.string().uuid();

/** Money in integer cents (Rs × 100). */
// max keeps a value the DB's INT cents column can hold (a bigger one used to surface as a 500)
export const Cents = z.number().int().min(0).max(2_000_000_000);

/** A calendar date in the branch's timezone, YYYY-MM-DD. */
export const isCalendarDate = (v: string) => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; // rejects 2026-02-31
};
export const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine(isCalendarDate, 'Not a real date');

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

// Customer-supplied material always comes from a gate pass item, one item per line (Docs/decisions/0007)
export const CustomerMaterialSchema = z.object({
  gp_item_id: z.string().uuid("Pick the customer's material from a gate pass"),
  quantity: z.number().int().min(1, 'Gate pass quantity must be at least 1'),
});
export type CustomerMaterial = z.infer<typeof CustomerMaterialSchema>;
