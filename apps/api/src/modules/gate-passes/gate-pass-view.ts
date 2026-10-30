import type { EntityManager } from 'typeorm';
import {
  LineStatus,
  OrderStatus,
  OrderType,
  ROOFING_STATUS_LABEL,
  WORKSHOP_STATUS_LABEL,
  allActiveLinesCompleted,
  gatePassSummary,
  isReservationActive,
  roofingDisplayStatus,
  workshopDisplayStatus,
  type AllocationLike,
  type GatePassItemLike,
  type GatePassSummary,
  type LinkedOrderLike,
} from '@erp/shared';

export interface GatePassRow {
  gate_pass_id: string;
  pass_number: string;
  branch_id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  notes: string | null;
  issued_by_name: string | null;
  created_at: Date;
}

export interface LinkedDocument {
  order_id: string | null;
  document_number: string;
  document_type: 'JOB_CARD' | 'ROOFING_ORDER' | 'DRAFT';
  status_label: string;
  allocated_at: string;
  closed_at: string | null;
  items: { material_type: string; quantity: number; specs: string }[];
}

export interface GatePassView extends GatePassRow {
  items: GatePassItemLike[];
  summary: GatePassSummary;
  linked_documents: LinkedDocument[];
}

const specsOf = (i: GatePassItemLike) =>
  [i.thickness ? `${i.thickness}mm` : null, i.length ? `${Number(i.length)} ${i.length_unit === 'INCHES' ? 'inches' : 'ft'}` : null, i.color]
    .filter(Boolean)
    .join(' · ');

/**
 * Builds the gate pass view (balances, derived status, linked documents) for a set
 * of passes with a fixed number of queries. Used by list, detail and "available".
 */
export async function buildGatePassViews(em: EntityManager, passes: GatePassRow[], now = new Date()): Promise<GatePassView[]> {
  if (passes.length === 0) return [];
  const ids = passes.map((p) => p.gate_pass_id);

  const items: (GatePassItemLike & { gate_pass_id: string })[] = await em.query(
    `SELECT gp_item_id, gate_pass_id, material_type, thickness, length::float AS length, length_unit, color, quantity, condition_note
     FROM gate_pass_item WHERE gate_pass_id = ANY($1::uuid[]) ORDER BY gate_pass_id, gp_item_id`,
    [ids],
  );
  const allocations: (AllocationLike & { gate_pass_id: string })[] = await em.query(
    `SELECT a.allocation_id, a.gp_item_id, a.order_id, a.draft_id, a.quantity, a.status, a.expires_at, a.created_at, i.gate_pass_id
     FROM material_allocation a JOIN gate_pass_item i ON i.gp_item_id = a.gp_item_id
     WHERE i.gate_pass_id = ANY($1::uuid[]) AND a.status <> 'RELEASED'`,
    [ids],
  );

  const orderIds = [...new Set(allocations.map((a) => a.order_id).filter((x): x is string => !!x))];
  const orders: {
    order_id: string;
    order_number: string;
    order_type: OrderType;
    status: OrderStatus;
    released_at: Date | null;
    line_statuses: LineStatus[];
    last_completed: Date | null;
  }[] = orderIds.length
    ? await em.query(
        `SELECT o.order_id, o.order_number, o.order_type, o.status, o.released_at,
                COALESCE(array_agg(l.status) FILTER (WHERE l.line_id IS NOT NULL), '{}') AS line_statuses,
                max(l.completed_at) AS last_completed
         FROM "order" o LEFT JOIN order_line l ON l.order_id = o.order_id
         WHERE o.order_id = ANY($1::uuid[]) GROUP BY o.order_id`,
        [orderIds],
      )
    : [];

  const linked = new Map<string, LinkedOrderLike>();
  for (const o of orders) {
    const statuses = parsePgArray(o.line_statuses) as LineStatus[];
    if (o.order_type === OrderType.ROOFING_ORDER) {
      const d = roofingDisplayStatus(o.status, statuses);
      linked.set(o.order_id, {
        order_id: o.order_id,
        order_number: o.order_number,
        order_type: o.order_type,
        status_label: ROOFING_STATUS_LABEL[d],
        terminal: d === 'RELEASED',
        closed_at: o.released_at,
      });
    } else {
      const d = workshopDisplayStatus(o.status);
      linked.set(o.order_id, {
        order_id: o.order_id,
        order_number: o.order_number,
        order_type: o.order_type,
        status_label: WORKSHOP_STATUS_LABEL[d],
        // The material is used once the work is completed (prototype rule): every sub-job
        // done counts, even before the supervisor marks the card Completed
        terminal: d === 'COMPLETED' || d === 'CLOSED' || allActiveLinesCompleted(statuses),
        closed_at: o.last_completed,
      });
    }
  }

  return passes.map((p) => {
    const myItems = items.filter((i) => i.gate_pass_id === p.gate_pass_id);
    const myAllocs = allocations.filter((a) => a.gate_pass_id === p.gate_pass_id);
    const myOrderIds = [...new Set(myAllocs.map((a) => a.order_id).filter((x): x is string => !!x))];
    const myOrders = myOrderIds.map((id) => linked.get(id)).filter((x): x is LinkedOrderLike => !!x);
    const summary = gatePassSummary(myItems, myAllocs, myOrders, now);

    const itemById = new Map(myItems.map((i) => [i.gp_item_id, i]));
    const docs = new Map<string, LinkedDocument>();
    for (const a of myAllocs) {
      const isDraft = !a.order_id;
      if (isDraft && !isReservationActive(a, now)) continue;
      const key = a.order_id ?? `draft:${a.draft_id}`;
      const order = a.order_id ? linked.get(a.order_id) : undefined;
      let doc = docs.get(key);
      if (!doc) {
        doc = {
          order_id: a.order_id,
          document_number: order?.order_number ?? 'Draft',
          document_type: isDraft ? 'DRAFT' : (order?.order_type as 'JOB_CARD' | 'ROOFING_ORDER'),
          status_label: order?.status_label ?? 'In draft',
          allocated_at: new Date(a.created_at).toISOString(),
          closed_at: order?.terminal && order.closed_at ? new Date(order.closed_at).toISOString() : null,
          items: [],
        };
        docs.set(key, doc);
      }
      const item = itemById.get(a.gp_item_id);
      if (item) doc.items.push({ material_type: item.material_type, quantity: a.quantity, specs: specsOf(item) });
    }

    return { ...p, items: myItems, summary, linked_documents: [...docs.values()] };
  });
}

/** node-postgres returns enum arrays as "{A,B}" strings. */
export function parsePgArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string') return v.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
  return [];
}
