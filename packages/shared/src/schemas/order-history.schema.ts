import { z } from 'zod';
import { LocalDate } from './common.schema';

/** The longest From–To range the History popup asks for in one go. */
export const HISTORY_MAX_DAYS = 366;
export const HISTORY_PAGE_SIZE = 25;

const days = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

/**
 * History popup on Create Job Card / Create Order: every job card or order at the
 * branch whose date (the job date / order date on the form) falls in From–To,
 * newest first, one page at a time.
 */
export const OrderHistoryQuerySchema = z
  .object({
    from: LocalDate,
    to: LocalDate,
    search: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).default(1),
  })
  .refine((q) => q.from <= q.to, { message: '"From" must be on or before "To"', path: ['from'] })
  .refine((q) => days(q.from, q.to) < HISTORY_MAX_DAYS, { message: `Pick at most ${HISTORY_MAX_DAYS} days`, path: ['to'] });
export type OrderHistoryQuery = z.infer<typeof OrderHistoryQuerySchema>;
