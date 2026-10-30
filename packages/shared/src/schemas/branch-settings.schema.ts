import { z } from 'zod';
import { BranchType } from '../enums/branch-type.enum';
import { PaymentMode } from '../enums/payment-mode.enum';

// Shape of branch.settings (jsonb). Validated on every read and write; every
// field has a default so older rows parse to a complete object.
// Defaults come from the approved prototype (branchConfig.ts / orderCatalog.ts).

export const BranchSectionSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(255).nullable().optional(),
});

export const FEATURE_KEYS = [
  'gatePass',
  'inventory',
  'stockAlerts',
  'stockRequest',
  'chiefProfiles',
  'hardwareQueue',
  'hardwareStore',
  'pickup',
  'pettyCash',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

const featureFlag = z.boolean().default(true);
export const BranchFeaturesSchema = z.object({
  gatePass: featureFlag,
  inventory: featureFlag,
  stockAlerts: featureFlag,
  stockRequest: featureFlag,
  chiefProfiles: featureFlag,
  hardwareQueue: featureFlag,
  hardwareStore: featureFlag,
  pickup: featureFlag,
  pettyCash: featureFlag,
});

export const GeneralRulesSchema = z.object({
  payment_modes: z.array(z.nativeEnum(PaymentMode)).min(1).default([PaymentMode.CASH, PaymentMode.CARD, PaymentMode.TRANSFER]),
  require_payment_reference: z.boolean().default(true),
  allow_customer_material: z.boolean().default(true),
  require_gate_pass: z.boolean().default(false),
});

export const WORKSHOP_JOB_TYPES = ['CUT_BEND', 'COIL_CUTTING', 'ROLLING'] as const;
export type WorkshopJobType = (typeof WORKSHOP_JOB_TYPES)[number];

export const WorkshopConfigSchema = z.object({
  job_types: z.array(z.enum(WORKSHOP_JOB_TYPES)).default([...WORKSHOP_JOB_TYPES]),
  materials: z
    .array(z.string())
    .default(['MS Plain Sheet', 'MS Checker Sheet', 'Zinc Coated', 'Stainless Steel (SS)', 'Aluminium Plain Sheet', 'Aluminium Checker Sheet', 'Amano']),
  // Materials measured by length instead of thickness (BR: Amano rule)
  length_materials: z.array(z.string()).default(['Amano']),
  thicknesses: z.array(z.string()).default(['1mm', '1.5mm', '2mm', '2.5mm', '3mm', '4mm', '5mm', '6mm']),
  rolling_types: z
    .array(z.string())
    .default(['Pipe Bending', 'Box Bar Bending', 'Flat Iron Bending', 'L Angle', 'Sheet Rolling']),
  rolling_work_types: z
    .array(z.string())
    .default(['GI Pipe', 'L Bending (1)', 'Rolling (2)', 'Full Length (For Bend)', 'Circle Bend', 'Gate Bend Two Side', 'Gate Bend One Side', 'For Lorry']),
  // Rolling type → size options; types not listed use rolling_default_sizes
  rolling_sizes: z.record(z.string(), z.array(z.string())).default({
    'Pipe Bending': ['½"', '¾"', '1"', '1 ¼"', '1 ½"', '2"', '2 ½"', '3"'],
    'Box Bar Bending': ['¾"x ¾"', '1"x1"', '1"x1 ½"', '1 ½"x1 ½"', '2"x1"', '2"x2"', '3"x1 ½"', '4"x2"'],
  }),
  rolling_default_sizes: z.array(z.string()).default(['Small', 'Medium', 'Large', 'Extra Large']),
  coil_cutting_ranges: z.array(z.string()).default(['1-10', '10-50', '50<']),
  allow_custom_jobs: z.boolean().default(true),
});

export const ROOFING_CATEGORIES = [
  'Roofing',
  'Cladding',
  'Flashing',
  'Gutter',
  'Down Pipe',
  'Wadimbu',
  'Valley Gutter',
  'Ridge Cap',
  'Gutter Accessories',
] as const;
export type RoofingCategory = (typeof ROOFING_CATEGORIES)[number];

export const RoofingAccessorySchema = z.object({
  name: z.string().min(1),
  variants: z.array(z.string()).default([]),
  // Accessories that are not made from coil (e.g. aluminium brackets)
  no_coil: z.boolean().default(false),
});

export const RoofingConfigSchema = z.object({
  categories: z.array(z.enum(ROOFING_CATEGORIES)).default([...ROOFING_CATEGORIES]),
  // Sheet category → design patterns (categories not listed have none)
  patterns: z.record(z.string(), z.array(z.string())).default({
    Roofing: ['Tile Roofing', 'Roofing'],
    Cladding: ['Roller Door', 'Cladding'],
    Flashing: ['Flashing', 'Design 1'],
    Wadimbu: ['Normal', 'V-Set', 'Double V-Set'],
    'Ridge Cap': ['Temple Type', 'Normal'],
  }),
  accessories: z.array(RoofingAccessorySchema).default([
    { name: 'End Cap', variants: [], no_coil: false },
    { name: 'Nozzle', variants: ['Round', 'Box'], no_coil: false },
    { name: 'Bracket (Aluminium)', variants: [], no_coil: true },
    { name: 'Gutter Box', variants: [], no_coil: false },
  ]),
  coil_thicknesses: z.array(z.string()).default(['0.35mm', '0.40mm', '0.47mm']),
  coil_colors: z.array(z.string()).default(['RED', 'MRN', 'BLU', 'GRN', 'CGR', 'ZAL']),
  coil_origins: z.array(z.string()).default(['CN', 'VN', 'KR-AJN', 'KR-USC', 'KR-NPN']),
  allow_single_coil: z.boolean().default(true),
  require_design_photo: z.boolean().default(true),
});

export const MIN_PAYMENT_TO_PLACE = ['NONE', 'ADVANCE', 'FULL'] as const;
export type MinPaymentToPlace = (typeof MIN_PAYMENT_TO_PLACE)[number];

// Order policy set by the branch manager. Rates live in price_rate, not here.
export const OrderPolicySchema = z.object({
  customized_surcharge_pct: z.number().min(0).max(100).default(15),
  min_payment_to_place: z.enum(MIN_PAYMENT_TO_PLACE).default('ADVANCE'),
  min_advance_pct: z.number().min(0).max(100).default(30),
  max_discount_pct: z.number().min(0).max(100).default(5),
  allow_cashier_edit_before_start: z.boolean().default(true),
  // Hardware order placed by another branch's cashier: minimum advance taken there (Docs/decisions/0006)
  hardware_remote_min_advance_pct: z.number().min(0).max(100).default(30),
});

export const GatePassConfigSchema = z.object({
  materials: z
    .array(z.string())
    .default(['MS Plain Sheet', 'MS Checker Sheet', 'Zinc Coated', 'Stainless Steel (SS)', 'Aluminium Plain Sheet', 'Aluminium Checker Sheet', 'Amano']),
  colors: z
    .array(z.string())
    .default(['Blue', 'Red', 'Green', 'White', 'Silver', 'Grey', 'Off White', 'Dark Grey', 'Chocolate Brown', 'Galvanized']),
});

export const BranchSettingsSchema = z.object({
  sections: z.array(BranchSectionSchema).default([]),
  // Job card minimum advance (BR09)
  min_advance_pct_customized: z.number().int().min(0).max(100).default(30),
  min_advance_pct_standard: z.number().int().min(0).max(100).default(0),
  stock_override_enabled: z.boolean().default(false),
  pick_lists: z.record(z.string(), z.array(z.string())).default({}),
  number_prefixes: z.record(z.string(), z.string()).default({}),
  features: BranchFeaturesSchema.default(BranchFeaturesSchema.parse({})),
  general: GeneralRulesSchema.default(GeneralRulesSchema.parse({})),
  workshop: WorkshopConfigSchema.default(WorkshopConfigSchema.parse({})),
  roofing: RoofingConfigSchema.default(RoofingConfigSchema.parse({})),
  orders: OrderPolicySchema.default(OrderPolicySchema.parse({})),
  gate_pass: GatePassConfigSchema.default(GatePassConfigSchema.parse({})),
});

// Sections a config PATCH may change. Each nested section is shallow-merged
// into the stored one and the full result re-validated with BranchSettingsSchema,
// so no defaults here (Zod would fill them in and overwrite stored values).
export const BRANCH_CONFIG_SECTIONS = ['features', 'general', 'workshop', 'roofing', 'orders', 'gate_pass'] as const;
export type BranchConfigSection = (typeof BRANCH_CONFIG_SECTIONS)[number];

const sectionPatch = z.record(z.string(), z.unknown()).optional();
export const UpdateBranchConfigSchema = z
  .object({
    sections: z.array(BranchSectionSchema).optional(),
    min_advance_pct_customized: z.number().int().min(0).max(100).optional(),
    min_advance_pct_standard: z.number().int().min(0).max(100).optional(),
    stock_override_enabled: z.boolean().optional(),
    // New override password; omitted keeps the current one
    stock_override_password: z.string().min(4).max(64).optional(),
    pick_lists: z.record(z.string(), z.array(z.string())).optional(),
    number_prefixes: z.record(z.string(), z.string()).optional(),
    features: sectionPatch,
    general: sectionPatch,
    workshop: sectionPatch,
    roofing: sectionPatch,
    orders: sectionPatch,
    gate_pass: sectionPatch,
  })
  .strict();
export type UpdateBranchConfigDto = z.infer<typeof UpdateBranchConfigSchema>;

export type BranchSection = z.infer<typeof BranchSectionSchema>;
export type BranchFeatures = z.infer<typeof BranchFeaturesSchema>;
export type GeneralRules = z.infer<typeof GeneralRulesSchema>;
export type WorkshopConfig = z.infer<typeof WorkshopConfigSchema>;
export type RoofingConfig = z.infer<typeof RoofingConfigSchema>;
export type RoofingAccessory = z.infer<typeof RoofingAccessorySchema>;
export type OrderPolicy = z.infer<typeof OrderPolicySchema>;
export type GatePassConfig = z.infer<typeof GatePassConfigSchema>;
export type BranchSettings = z.infer<typeof BranchSettingsSchema>;

export const DEFAULT_BRANCH_SETTINGS: BranchSettings = BranchSettingsSchema.parse({});

// Branch type decides which create forms and queues exist.
export const typeHasRoofing = (type: BranchType) => type !== BranchType.WORKSHOP;
export const typeHasWorkshop = (type: BranchType) => type !== BranchType.ROOFING;

/** Size options for a rolling type, falling back to the generic sizes. */
export function rollingSizesFor(workshop: WorkshopConfig, rollingType: string): string[] {
  return workshop.rolling_sizes[rollingType] ?? workshop.rolling_default_sizes;
}
