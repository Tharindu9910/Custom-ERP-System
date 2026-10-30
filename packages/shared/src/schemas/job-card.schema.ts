import { z } from 'zod';
import { MaterialSource } from '../enums/order.enums';
import { Cents, ClientRequestId, CustomerRefSchema, LocalDate, OptionalId, StockOverrideSchema } from './common.schema';

// A manual charge used when a line is customized (manual toggle, customer
// material, or no standard rate — BR23).
export const CUSTOM_CHARGE_KINDS = ['CUT', 'BEND', 'ROLLING', 'COIL_CUTTING', 'OTHER'] as const;
export const CustomChargeSchema = z.object({
  kind: z.enum(CUSTOM_CHARGE_KINDS),
  description: z.string().trim().min(1, 'Describe the custom work').max(200),
  rate: Cents,
  quantity: z.number().positive('Quantity must be more than 0'),
});
export type CustomCharge = z.infer<typeof CustomChargeSchema>;

// Customer-supplied material always comes from a gate pass item, one item per line (Docs/decisions/0007)
export const CustomerMaterialSchema = z.object({
  gp_item_id: z.string().uuid('Pick the customer\'s material from a gate pass'),
  quantity: z.number().int().min(1, 'Gate pass quantity must be at least 1'),
});
export type CustomerMaterial = z.infer<typeof CustomerMaterialSchema>;

const lineBase = {
  // Present when editing an existing line
  line_id: OptionalId,
  material_source: z.nativeEnum(MaterialSource).default(MaterialSource.BRANCH),
  // Manual "Custom" toggle (BR23 c) — requires a reason when set by hand
  custom: z.boolean().default(false),
  customized_reason_code: z.string().trim().max(60).optional(),
  custom_charges: z.array(CustomChargeSchema).default([]),
  notes: z.string().trim().max(500).optional(),
  // Customer material: the one gate pass item this line uses (Docs/decisions/0007)
  customer_material: CustomerMaterialSchema.nullable().optional(),
};

export const CutBendLineSchema = z.object({
  job_type: z.literal('CUT_BEND'),
  ...lineBase,
  material_type: z.string().trim().max(80).optional(),
  // Thickness, or length for length-measured materials (Amano)
  thickness: z.string().trim().max(20).optional(),
  material_quantity: z.number().int().min(1).optional(),
  cut_count: z.number().int().min(0).default(0),
  bend_count: z.number().int().min(0).default(0),
  inches: z.string().trim().max(40).optional(),
});

export const CoilCuttingLineSchema = z.object({
  job_type: z.literal('COIL_CUTTING'),
  ...lineBase,
  coil_material: z.string().trim().min(1, 'Coil material is required').max(80),
  amount_range: z.string().trim().min(1, 'Choose the amount'),
});

export const RollingLineSchema = z.object({
  job_type: z.literal('ROLLING'),
  ...lineBase,
  rolling_type: z.string().trim().max(80).optional(),
  work_type: z.string().trim().max(80).optional(),
  size: z.string().trim().max(40).optional(),
  quantity: z.number().int().min(1).optional(),
});

export const WorkshopLineSchema = z
  .discriminatedUnion('job_type', [CutBendLineSchema, CoilCuttingLineSchema, RollingLineSchema])
  .superRefine((line, ctx) => {
    const issue = (message: string, path: string) => ctx.addIssue({ code: 'custom', message, path: [path] });
    const customMode = isCustomMode(line);
    if (line.material_source === MaterialSource.CUSTOMER && !line.customer_material) {
      issue("Pick the customer's material from a gate pass", 'customer_material');
    }
    if (line.material_source === MaterialSource.BRANCH && line.customer_material) {
      issue('Branch stock lines cannot use gate pass material', 'customer_material');
    }
    if (line.custom && !line.customized_reason_code && line.material_source !== MaterialSource.CUSTOMER) {
      issue('Give a reason for marking this job as customized', 'customized_reason_code');
    }
    if (line.job_type === 'CUT_BEND') {
      if (customMode) {
        if (!line.custom_charges.some((c) => c.kind === 'CUT' || c.kind === 'BEND')) {
          issue('Add a custom cut or bend charge (description, rate and quantity)', 'custom_charges');
        }
      } else {
        if (!line.material_type) issue('Material type is required', 'material_type');
        if (!line.thickness) issue('Thickness is required', 'thickness');
        if (!line.material_quantity) issue('Material quantity is required', 'material_quantity');
        if (line.cut_count <= 0 && line.bend_count <= 0) issue('Enter the number of cuts or bends', 'cut_count');
      }
    }
    if (line.job_type === 'ROLLING') {
      if (customMode) {
        if (line.custom_charges.length === 0) issue('Add a custom rolling charge', 'custom_charges');
      } else {
        if (!line.rolling_type) issue('Rolling type is required', 'rolling_type');
        if (!line.work_type) issue('Rolling sub-type is required', 'work_type');
        if (!line.size) issue('Size is required', 'size');
        if (!line.quantity) issue('Quantity is required', 'quantity');
      }
    }
  });
export type WorkshopLineInput = z.infer<typeof WorkshopLineSchema>;

/** Customized by hand, or because the customer supplies the material (prototype rule). */
export function isCustomMode(line: Pick<WorkshopLineInput, 'job_type' | 'custom' | 'material_source'>): boolean {
  if (line.job_type === 'COIL_CUTTING') return line.custom;
  return line.custom || line.material_source === MaterialSource.CUSTOMER;
}

const jobCardBody = {
  customer: CustomerRefSchema,
  job_date: LocalDate,
  worker_ids: z.array(z.string().uuid()).min(1, 'Assign at least one worker'),
  notes: z.string().trim().max(500).optional(),
  // Material source and gate pass material are per line (customer_material); nothing order-level
  lines: z.array(WorkshopLineSchema).min(1, 'Add at least one sub-job'),
  // Branch material is reserved on save; given only after a 409 STOCK_INSUFFICIENT (Docs/decisions/0003)
  override: StockOverrideSchema.optional(),
};

export const CreateJobCardSchema = z.object({
  client_request_id: ClientRequestId,
  ...jobCardBody,
});
export type CreateJobCardDto = z.infer<typeof CreateJobCardSchema>;

export const UpdateJobCardSchema = z.object({
  version: z.number().int().positive(),
  ...jobCardBody,
});
export type UpdateJobCardDto = z.infer<typeof UpdateJobCardSchema>;

// The board shows every workshop column at once; no status filter (Docs/decisions/0005)
export const WorkshopQueueQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
});
export type WorkshopQueueQuery = z.infer<typeof WorkshopQueueQuerySchema>;

export const QuoteJobCardSchema = z.object({
  lines: z.array(WorkshopLineSchema).min(1),
});
export type QuoteJobCardDto = z.infer<typeof QuoteJobCardSchema>;
