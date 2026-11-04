import { z } from 'zod';
import { BranchType } from '../enums/branch-type.enum';
import type { BranchFeatures, BranchSettings } from './branch-settings.schema';

// Branch details (code, name, type, contact). Settings are separate: UpdateBranchConfigSchema.

const BranchFields = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,32}$/, 'Code must be 2–32 letters, digits or dashes'),
  name: z.string().trim().min(1).max(80),
  branch_type: z.nativeEnum(BranchType),
  location: z.string().trim().max(255).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
});

export const CreateBranchSchema = BranchFields.strict();
export type CreateBranchDto = z.infer<typeof CreateBranchSchema>;

export const UpdateBranchSchema = BranchFields.partial()
  .extend({
    is_active: z.boolean().optional(),
    /** Only `true` is accepted by the service: it moves the main flag here. `false` is refused with BR_004. */
    is_main: z.boolean().optional(),
    /** The version the client loaded; a stale one is refused with BR_006. */
    version: z.number().int().min(1),
  })
  .strict();
export type UpdateBranchDto = z.infer<typeof UpdateBranchSchema>;

/** One row of GET /branches: details plus the module switches pickers need, not the full settings. */
export interface BranchSummary {
  branch_id: string;
  code: string;
  name: string;
  branch_type: BranchType;
  phone: string | null;
  location: string | null;
  /** The distribution branch (Naiwala). Lists come main first. */
  is_main: boolean;
  is_active: boolean;
  features: BranchFeatures;
  version: number;
  updated_at: string;
}

/** GET/PATCH /branches/:id/config: the full settings, defaults filled in. */
export type BranchConfig = BranchSettings & {
  branch_id: string;
  stock_override_configured: boolean;
  version: number;
  updated_by: string | null;
  updated_at: string;
};
