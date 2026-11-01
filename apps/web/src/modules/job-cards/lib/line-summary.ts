import type { OrderLineDto } from '@/modules/orders/hooks/useOrders';

export const LINE_TYPE_LABEL: Record<string, string> = { CUT_BEND: 'Cut / Bend', COIL_CUTTING: 'Coil Cutting', ROLLING: 'Rolling' };

/** Spec summary for a sub-job (prototype modal row). */
export function lineSummary(l: OrderLineDto): string {
  const s = l.spec as Record<string, unknown>;
  if (l.is_customized) return 'Customized Work';
  if (l.line_type === 'CUT_BEND') return `${s.material_type ?? ''} ${s.thickness ?? ''} | Qty: ${s.material_quantity ?? 0} | Cut: ${s.cut_count ?? 0} | Bend: ${s.bend_count ?? 0}`;
  if (l.line_type === 'ROLLING') return `Rolling (${s.work_type}) ${s.rolling_type} ${s.size} | Qty: ${s.quantity ?? 0}`;
  return `Coil: ${s.coil_material} - ${s.amount_range} Ton`;
}
