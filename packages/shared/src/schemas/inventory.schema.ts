import { z } from 'zod';
import { ClientRequestId, LocalDate, ReasonSchema } from './common.schema';

/** Stock quantities are NUMERIC(14,3): whole units, or kg / ft with up to 3 decimals. */
const Quantity = z.number().finite().multipleOf(0.001, 'Use at most 3 decimal places').max(1_000_000);

export const INVENTORY_STATUS_FILTERS = ['ALL', 'HEALTHY', 'LOW', 'OUT'] as const;
export const INVENTORY_SORTS = ['NAME', 'STOCK_DESC', 'STOCK_ASC'] as const;

export const InventoryQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().trim().max(80).optional(),
  status: z.enum(INVENTORY_STATUS_FILTERS).default('ALL'),
  sort: z.enum(INVENTORY_SORTS).default('NAME'),
});
export type InventoryQuery = z.infer<typeof InventoryQuerySchema>;

export const STOCK_ALERT_FILTERS = ['NEEDS_RESTOCK', 'CRITICAL', 'LOW'] as const;
export const StockAlertQuerySchema = z.object({
  filter: z.enum(STOCK_ALERT_FILTERS).default('NEEDS_RESTOCK'),
  category: z.string().trim().max(80).optional(),
  q: z.string().trim().max(80).optional(),
});
export type StockAlertQuery = z.infer<typeof StockAlertQuerySchema>;

export const CreateStockTransferSchema = z.object({
  client_request_id: ClientRequestId,
  // guid: seeded branch ids are fixed, not RFC v4
  supplying_branch_id: z.guid({ message: 'Choose the branch to ask' }),
  needed_before: LocalDate,
  is_urgent: z.boolean().default(false),
  notes: z.string().trim().max(500).optional(),
  lines: z
    .array(z.object({ item_id: z.string().uuid(), quantity: Quantity.positive('Request at least 1') }))
    .min(1, 'Add at least one item')
    .max(100, 'Split very long requests into more than one')
    .refine((lines) => new Set(lines.map((l) => l.item_id)).size === lines.length, 'Each item can be listed only once'),
});
export type CreateStockTransferDto = z.infer<typeof CreateStockTransferSchema>;

export const SendStockTransferSchema = z.object({
  lines: z.array(z.object({ transfer_line_id: z.string().uuid(), qty_sent: Quantity.min(0) })).min(1),
});
export type SendStockTransferDto = z.infer<typeof SendStockTransferSchema>;

export const ReceiveStockTransferSchema = z.object({
  lines: z.array(z.object({ transfer_line_id: z.string().uuid(), qty_received: Quantity.min(0) })).min(1),
  notes: z.string().trim().max(500).optional(),
});
export type ReceiveStockTransferDto = z.infer<typeof ReceiveStockTransferSchema>;

export const TRANSFER_DIRECTIONS = ['INCOMING', 'OUTGOING'] as const;
export const StockTransferQuerySchema = z.object({
  direction: z.enum(TRANSFER_DIRECTIONS),
  open: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  q: z.string().trim().max(80).optional(),
});
export type StockTransferQuery = z.infer<typeof StockTransferQuerySchema>;

/** Head office: every stock request in the network (Docs/decisions/0002). */
export const NetworkTransferQuerySchema = StockTransferQuerySchema.omit({ direction: true });
export type NetworkTransferQuery = z.infer<typeof NetworkTransferQuerySchema>;

export const RejectStockTransferSchema = ReasonSchema;
export type RejectStockTransferDto = z.infer<typeof RejectStockTransferSchema>;

/** Item picker on the New Request form. */
export const TransferItemSearchSchema = z.object({
  q: z.string().trim().max(80).optional(),
  /** Comma-separated item ids, to load items handed over from Inventory / Stock Alerts */
  ids: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : undefined))
    .pipe(z.array(z.string().uuid()).max(100).optional()),
});
export type TransferItemSearch = z.infer<typeof TransferItemSearchSchema>;
