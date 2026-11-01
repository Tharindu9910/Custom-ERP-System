import { MaterialSource, type CustomerMaterial } from '@erp/shared';
import type { OrderHeader } from '../../database/entities/order.entity';

/** One line's gate pass item, as AllocationsService.commitLines takes it (Docs/decisions/0007). */
export interface CustomerMaterialLine {
  line_id: string;
  gp_item_id: string;
  quantity: number;
}

/** The gate pass item a customer-material line uses. */
export function customerMaterialLine(
  input: { material_source: MaterialSource; customer_material?: CustomerMaterial | null },
  lineId: string,
): CustomerMaterialLine[] {
  const m = input.material_source === MaterialSource.CUSTOMER ? input.customer_material : null;
  return m ? [{ line_id: lineId, gp_item_id: m.gp_item_id, quantity: m.quantity }] : [];
}

/** Older orders kept the material source and one gate pass on the header; lines carry them now. */
export function withoutOrderMaterial(header: OrderHeader | null): OrderHeader {
  const { material_source: _s, gate_pass_id: _g, ...rest } = header ?? {};
  return rest;
}
