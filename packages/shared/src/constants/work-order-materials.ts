export const WORK_ORDER_MATERIALS = [
  { code: 'BR08', label: 'Bar Rod 8mm' },
  { code: 'BR23', label: 'Bar Rod 23mm' },
] as const;

export type WorkOrderMaterialCode = (typeof WORK_ORDER_MATERIALS)[number]['code'];