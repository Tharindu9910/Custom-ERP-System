import { MaterialSource, formatGatePassLength } from '@erp/shared';
import type { GatePassDto } from '@/modules/gate-passes/hooks/useGatePasses';
import type { SubJobForm } from './sub-job-form';

/** One gate pass item the customer brought, as the sub-job editor offers it (Docs/decisions/0007). */
export interface CustomerMaterialOption {
  gp_item_id: string;
  gate_pass_id: string;
  pass_number: string;
  material_type: string;
  /** "2mm · 8 ft · Blue" */
  specs: string;
  received: number;
  /** Pieces this card may take, before what its sub-jobs use */
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
        max: (bal?.available ?? 0) + (committed[item.gp_item_id] ?? 0),
      };
    }),
  );
}

/** Pieces per gate pass item taken by the card's customer sub-jobs (one left out while it is being edited). */
export function usedByCard(subJobs: SubJobForm[], exceptKey?: string | null): Record<string, number> {
  const used: Record<string, number> = {};
  for (const j of subJobs) {
    if (j.key === exceptKey || j.material_source !== MaterialSource.CUSTOMER || !j.gp_item_id) continue;
    used[j.gp_item_id] = (used[j.gp_item_id] ?? 0) + (Number(j.gp_quantity) || 0);
  }
  return used;
}
