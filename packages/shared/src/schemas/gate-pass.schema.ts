import { z } from 'zod';
import { LengthUnit } from '../enums/inventory.enums';
import { ClientRequestId, CustomerRefSchema } from './common.schema';

export const GatePassItemInputSchema = z
  .object({
    material_type: z.string().trim().min(1, 'Material type is required').max(80),
    thickness: z.string().trim().max(20).optional(),
    length: z.number().positive().optional(),
    length_unit: z.nativeEnum(LengthUnit).default(LengthUnit.FT),
    color: z.string().trim().max(40).optional(),
    quantity: z.number().int().min(1).optional(),
    condition_note: z.string().trim().max(255).optional(),
  })
  .refine((i) => !!i.thickness || i.length !== undefined || i.quantity !== undefined, {
    message: 'Enter at least a thickness, length or quantity',
  });
export type GatePassItemInput = z.infer<typeof GatePassItemInputSchema>;

export const CreateGatePassSchema = z.object({
  client_request_id: ClientRequestId,
  customer: CustomerRefSchema,
  notes: z.string().trim().max(500).optional(),
  items: z.array(GatePassItemInputSchema).min(1, 'Add at least one item'),
});
export type CreateGatePassDto = z.infer<typeof CreateGatePassSchema>;

export const GATE_PASS_FILTERS = ['ALL', 'AVAILABLE', 'OPEN', 'RESERVED', 'PARTIALLY_ASSIGNED', 'FULLY_ASSIGNED', 'CLOSED'] as const;
export type GatePassFilter = (typeof GATE_PASS_FILTERS)[number];

export const GatePassQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
  status: z.enum(GATE_PASS_FILTERS).default('ALL'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type GatePassQuery = z.infer<typeof GatePassQuerySchema>;
