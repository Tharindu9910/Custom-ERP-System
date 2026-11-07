import { z } from 'zod';
import { LocalDate } from './common.schema';

/** The longest From–To range the History popup asks for in one go. */
export const HISTORY_MAX_DAYS = 366;
export const HISTORY_PAGE_SIZE = 25;

const days = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

/** The History popup's stage filter: Active = placed, ongoing or finished, not yet closed or cancelled. */
export const HISTORY_STAGES = ['AWAITING_PAYMENT', 'ACTIVE', 'CLOSED', 'CANCELLED'] as const;
export type HistoryStage = (typeof HISTORY_STAGES)[number];
export const HISTORY_PAYMENTS = ['BALANCE_DUE', 'PAID'] as const;
export type HistoryPayment = (typeof HISTORY_PAYMENTS)[number];

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
    stage: z.enum(HISTORY_STAGES).optional(),
    payment: z.enum(HISTORY_PAYMENTS).optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .refine((q) => q.from <= q.to, { message: '"From" must be on or before "To"', path: ['from'] })
  .refine((q) => days(q.from, q.to) < HISTORY_MAX_DAYS, { message: `Pick at most ${HISTORY_MAX_DAYS} days`, path: ['to'] });
export type OrderHistoryQuery = z.infer<typeof OrderHistoryQuerySchema>;
