import { MaterialSource, formatGatePassLength } from '@erp/shared';
import type { GatePassDto } from '../hooks/useGatePasses';

/** One gate pass item the customer brought, as the job card and order editors offer it (Docs/decisions/0007). */
export interface CustomerMaterialOption {
  gp_item_id: string;
  gate_pass_id: string;
  pass_number: string;
  material_type: string;
  /** "2mm · 8 ft · Blue" */
  specs: string;
  received: number;
  /** Length of one piece in feet, when the pass gives one */
  length_ft: number | null;
  /** Pieces this order may take, before what its own items use */
  max: number;
}

/** Gate pass thickness is typed as "2" or "2mm"; a bare number is in mm. */
export const thicknessLabel = (t: string | null) => (!t ? null : /^\d+(\.\d+)?$/.test(t.trim()) ? `${t.trim()}mm` : t);

export const materialSpecs = (i: { thickness: string | null; length: number | null; length_unit: string | null; color: string | null }) =>
  [thicknessLabel(i.thickness), formatGatePassLength(i.length, i.length_unit) || null, i.color].filter(Boolean).join(' · ');

export const materialLabel = (o: { pass_number: string; material_type: string; specs: string }) =>
  `${o.pass_number} · ${o.material_type}${o.specs ? ` (${o.specs})` : ''}`;

/**
 * The items on the customer's passes. The server counts the card's own saved material as
 * used, so in edit mode it is added back (`committed`, per gate pass item).
 */
export function customerMaterialOptions(passes: GatePassDto[], committed: Record<string, number> = {}): CustomerMaterialOption[] {
  return passes.flatMap((gp) =>
    gp.items.map((item) => {
      const bal = gp.summary.item_balances.find((b) => b.gp_item_id === item.gp_item_id);
      return {
        gp_item_id: item.gp_item_id,
        gate_pass_id: gp.gate_pass_id,
        pass_number: gp.pass_number,
        material_type: item.material_type,
        specs: materialSpecs(item),
        received: item.quantity,
        length_ft: item.length ? (item.length_unit === 'INCHES' ? Number(item.length) / 12 : Number(item.length)) : null,
        max: (bal?.available ?? 0) + (committed[item.gp_item_id] ?? 0),
      };
    }),
  );
}

/** A sub-job or order item as far as its gate pass material goes. */
interface MaterialUser {
  key: string;
  material_source: MaterialSource;
  gp_item_id?: string;
  gp_quantity?: string;
}

/** Pieces per gate pass item taken by the order's customer items (one left out while it is being edited). */
export function usedByCard(items: readonly MaterialUser[], exceptKey?: string | null): Record<string, number> {
  const used: Record<string, number> = {};
  for (const j of items) {
    if (j.key === exceptKey || j.material_source !== MaterialSource.CUSTOMER || !j.gp_item_id) continue;
    used[j.gp_item_id] = (used[j.gp_item_id] ?? 0) + (Number(j.gp_quantity) || 0);
  }
  return used;
}

/**
 * Pieces of the customer's material a sheet item needs: its running feet over the length of
 * one gate pass piece, rounded up (10 pcs × 6 ft from 20 ft sheets → 3). Null when either
 * length is unknown, so nothing is suggested.
 */
export function suggestedPieces(option: Pick<CustomerMaterialOption, 'length_ft'> | undefined, lengthFt?: number, pieces?: number) {
  if (!option?.length_ft || !lengthFt || !pieces || lengthFt > option.length_ft) return null;
  const runningFt = lengthFt * pieces;
  return { pieces: Math.ceil(runningFt / option.length_ft - 1e-9), runningFt, pieceFt: option.length_ft };
}
