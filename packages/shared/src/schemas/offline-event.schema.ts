import { z } from 'zod';

export const OfflineEventSchema = z.object({
  event_id: z.string().uuid(),
  event_type: z.enum([
    'CREATE_JOB_CARD',
    'UPDATE_JOB_CARD_STATUS',
    'CREATE_WORK_ORDER',
    'UPDATE_WORK_ORDER_STATUS',
    'ADD_WORK_ORDER_NOTE',
  ]),
  entity_id: z.string().uuid().optional(),
  payload: z.record(z.string(), z.unknown()),
  created_at: z.string().datetime(),
  branch_id: z.string().uuid(),
  version: z.number().int().nonnegative().optional(),
});

export const FlushOfflineEventsSchema = z.object({
  events: z.array(OfflineEventSchema).min(1).max(200),
});

export type OfflineEvent = z.infer<typeof OfflineEventSchema>;
export type FlushOfflineEventsDto = z.infer<typeof FlushOfflineEventsSchema>;