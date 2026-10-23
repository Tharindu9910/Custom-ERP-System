import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { RateRow } from '@erp/shared';

export interface PricingData {
  rates: RateRow[];
  /** Selling price (cents) of one sheet of material/thickness, or null if not catalogued. */
  materialPrice: (materialType: string, thickness: string) => number | null;
  /** Stock item for a material/thickness — what a Cut/Bend line deducts on start (BR10). */
  materialItemId: (materialType: string, thickness: string) => string | null;
  /** Thickness of a coil item (roofing). */
  coilThickness: (itemId: string) => string | null;
}

const key = (m: string, t: string) => `${m.trim().toLowerCase()}|${t.trim().toLowerCase()}`;

/** Loads the branch's rates (branch + master) and catalogue prices for the shared pricing functions. */
@Injectable()
export class PricingService {
  async load(em: EntityManager, branchId: string): Promise<PricingData> {
    const rates: RateRow[] = await em.query(
      `SELECT branch_id, line_type, sub_type, variant, work_type, thickness_or_size, material_source, price_basis, rate
       FROM price_rate WHERE is_active = true AND (branch_id = $1 OR branch_id IS NULL)`,
      [branchId],
    );
    const items: { item_id: string; item_type: string; price: number; attributes: Record<string, string> }[] = await em.query(
      `SELECT item_id, item_type, price, attributes FROM item WHERE is_active = true AND item_type IN ('MATERIAL', 'COIL')`,
    );
    const materials = new Map<string, { item_id: string; price: number }>();
    const coils = new Map<string, string>();
    for (const i of items) {
      if (i.item_type === 'MATERIAL' && i.attributes.material_type && i.attributes.thickness) {
        materials.set(key(i.attributes.material_type, i.attributes.thickness), { item_id: i.item_id, price: i.price });
      } else if (i.item_type === 'COIL' && i.attributes.thickness) {
        coils.set(i.item_id, i.attributes.thickness);
      }
    }
    return {
      rates,
      materialPrice: (m, t) => materials.get(key(m, t))?.price ?? null,
      materialItemId: (m, t) => materials.get(key(m, t))?.item_id ?? null,
      coilThickness: (id) => coils.get(id) ?? null,
    };
  }
}
