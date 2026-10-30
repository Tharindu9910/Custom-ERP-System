import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  HARDWARE_STATUS_LABEL,
  LINE_STATUS_LABEL,
  LineStatus,
  OrderStatus,
  OrderType,
  ROOFING_STATUS_LABEL,
  WORKSHOP_STATUS_LABEL,
  HISTORY_PAGE_SIZE,
  balanceDue,
  hardwareDisplayStatus,
  jobCardMinAdvance,
  lineHasStarted,
  paymentStateFor,
  roofingDisplayStatus,
  toBranchDate,
  workshopDisplayStatus,
  type OrderHistoryQuery,
  type OrderPaymentState,
  type RoofingDisplayStatus,
  type RoofingQueueCounts,
  type RoofingQueueQuery,
  type WorkshopDisplayStatus,
  type WorkshopQueueQuery,
} from '@erp/shared';
import { ERR } from '../../common/errors';
import { BranchContextService } from '../../core/branch-context.service';
import type { OrderHeader } from '../../database/entities/order.entity';
import { parsePgArray } from '../gate-passes/gate-pass-view';

export interface OrderLineView {
  line_id: string;
  line_number: string;
  line_no: number;
  line_type: string;
  sub_type: string | null;
  status: LineStatus;
  status_label: string;
  material_source: string;
  item_id: string | null;
  item_name: string | null;
  item_unit: string | null;
  item_sku: string | null;
  spec: Record<string, unknown>;
  quantity: number | null;
  price_basis: string | null;
  unit_price: number;
  line_total: number;
  is_customized: boolean;
  customized_reason_code: string | null;
  work_info: string | null;
  notes: string | null;
  completed_at: string | null;
  version: number;
  workers: { employee_id: string; full_name: string; employee_code: string }[];
  started_at: string | null;
  started_by: string | null;
  inspected_by: string | null;
  /** The gate pass item a customer-material line uses (job cards, Docs/decisions/0007) */
  customer_material: LineCustomerMaterial | null;
}

export interface LineCustomerMaterial {
  gp_item_id: string;
  gate_pass_id: string;
  pass_number: string;
  material_type: string;
  thickness: string | null;
  length: number | null;
  length_unit: string | null;
  color: string | null;
  quantity: number;
}

export interface OrderDetail {
  order_id: string;
  order_number: string;
  order_type: OrderType;
  status: OrderStatus;
  display_status: string;
  display_label: string;
  version: number;
  customer: { customer_id: string; name: string; phone: string } | null;
  header: OrderHeader;
  subtotal: number;
  discount: number;
  total: number;
  paid_amount: number;
  balance: number;
  payment_state: OrderPaymentState;
  min_advance: number;
  created_at: string;
  created_by: string;
  created_by_name: string | null;
  actor_role_at_creation: string | null;
  released_to: string | null;
  released_at: string | null;
  released_by_name: string | null;
  release_notes: string | null;
  can_edit: boolean;
  /** Hardware sale placed by another branch's cashier (Docs/decisions/0006) */
  origin_branch_name: string | null;
  /** Roofing timeline (prototype OrderTimeline); null for job cards */
  milestones: OrderMilestones | null;
  workers: { employee_id: string; full_name: string; employee_code: string }[];
  lines: OrderLineView[];
  gate_pass: { gate_pass_id: string; pass_number: string } | null;
  customer_materials: {
    gp_item_id: string;
    material_type: string;
    thickness: string | null;
    length: number | null;
    length_unit: string | null;
    color: string | null;
    quantity: number;
    pass_number: string;
    /** Set on job cards (per-line material); null on roofing orders and older cards */
    line_id: string | null;
  }[];
  payments: {
    payment_id: string;
    kind: string;
    mode: string;
    amount: number;
    reference_number: string | null;
    receipt_no: string;
    paid_at: string;
    received_by_name: string | null;
    received_branch_name: string | null;
  }[];
  history: {
    history_id: string;
    line_id: string | null;
    line_number: string | null;
    event_type: string;
    from_status: string | null;
    to_status: string | null;
    result: string | null;
    note: string | null;
    actor_name: string | null;
    actor_role: string | null;
    created_at: string;
  }[];
}

export interface Milestone {
  at: string | null;
  by: string | null;
  note?: string | null;
}

export interface OrderMilestones {
  placed: Milestone;
  started: Milestone;
  completed: Milestone;
  released: Milestone;
  cancelled: Milestone | null;
}

export interface RoofingQueueRow {
  order_id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  technician: string | null;
  created_at: string;
  released_at: string | null;
  status: OrderStatus;
  display_status: RoofingDisplayStatus;
  display_label: string;
  item_count: number;
  running_ft: number;
  has_customer_material: boolean;
  total: number;
  paid_amount: number;
  balance: number;
  payment_state: OrderPaymentState;
  version: number;
}

/** Released / Cancelled / All lists are capped; counts are always exact. */
const QUEUE_HISTORY_LIMIT = 200;

export interface WorkshopQueueRow {
  order_id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  job_date: string;
  created_at: string;
  status: OrderStatus;
  display_status: WorkshopDisplayStatus;
  display_label: string;
  line_count: number;
  completed_count: number;
  /** Sub-jobs started or done; Mark Completed needs every one started */
  started_count: number;
  total: number;
  paid_amount: number;
  balance: number;
  min_advance: number;
  payment_state: OrderPaymentState;
  version: number;
  can_edit: boolean;
}

export type CashierColumn = 'AWAITING_PAYMENT' | 'READY_FOR_COLLECTION' | 'ROOFING_BALANCE';

/** One job card or roofing order in the History popup. */
export interface OrderHistoryRow {
  order_id: string;
  order_number: string;
  /** The job date / order date on the form (branch time) */
  date: string;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  created_by_name: string | null;
  item_count: number;
  total: number;
  paid_amount: number;
  balance: number;
  status: OrderStatus;
  display_label: string;
}

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

@Injectable()
export class OrderQueriesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly branches: BranchContextService,
  ) {}

  async findByRequestId(requestId: string, branchId: string): Promise<string | null> {
    const rows: { order_id: string }[] = await this.ds.query(
      `SELECT order_id FROM "order" WHERE client_request_id = $1 AND branch_id = $2`,
      [requestId, branchId],
    );
    return rows[0]?.order_id ?? null;
  }

  async detail(orderId: string, branchId: string): Promise<OrderDetail> {
    const rows = await this.ds.query(
      `SELECT o.*, c.customer_id AS c_id, c.name AS c_name, c.phone AS c_phone,
              cu.full_name AS created_by_name, ru.full_name AS released_by_name, ob.name AS origin_branch_name
       FROM "order" o
       LEFT JOIN customer c ON c.customer_id = o.customer_id
       LEFT JOIN branch ob ON ob.branch_id = o.origin_branch_id
       LEFT JOIN "user" cu ON cu.user_id = o.created_by
       LEFT JOIN "user" ru ON ru.user_id = o.released_by
       WHERE o.order_id = $1 AND o.branch_id = $2`,
      [orderId, branchId],
    );
    const o = rows[0];
    if (!o) throw new NotFoundException(ERR.ORDER_NOT_FOUND);

    const [lines, assignments, history, payments, materials, settings] = await Promise.all([
      this.ds.query(
        `SELECT l.*, i.name AS item_name, i.unit AS item_unit, i.sku AS item_sku FROM order_line l LEFT JOIN item i ON i.item_id = l.item_id
         WHERE l.order_id = $1 ORDER BY l.line_no`,
        [orderId],
      ),
      this.ds.query(
        `SELECT a.line_id, e.employee_id, e.full_name, e.employee_code FROM line_assignment a
         JOIN employee e ON e.employee_id = a.employee_id JOIN order_line l ON l.line_id = a.line_id
         WHERE l.order_id = $1 ORDER BY e.full_name`,
        [orderId],
      ),
      this.ds.query(
        `SELECT h.history_id, h.line_id, l.line_number, h.event_type, h.from_status, h.to_status, h.result, h.note,
                u.full_name AS actor_name, h.actor_role, h.created_at
         FROM status_history h LEFT JOIN "user" u ON u.user_id = h.actor_id LEFT JOIN order_line l ON l.line_id = h.line_id
         WHERE h.order_id = $1 ORDER BY h.created_at, h.history_id`,
        [orderId],
      ),
      this.ds.query(
        `SELECT p.payment_id, p.kind, p.mode, p.amount, p.reference_number, p.receipt_no, p.paid_at, u.full_name AS received_by_name,
                rb.name AS received_branch_name
         FROM payment p LEFT JOIN "user" u ON u.user_id = p.received_by LEFT JOIN branch rb ON rb.branch_id = p.received_branch_id
         WHERE p.order_id = $1 AND p.status = 'COMPLETED' ORDER BY p.paid_at`,
        [orderId],
      ),
      this.ds.query(
        `SELECT i.gp_item_id, i.material_type, i.thickness, i.length::float AS length, i.length_unit, i.color,
                a.quantity, a.line_id, gp.pass_number, gp.gate_pass_id
         FROM material_allocation a JOIN gate_pass_item i ON i.gp_item_id = a.gp_item_id
         JOIN gate_pass gp ON gp.gate_pass_id = i.gate_pass_id
         WHERE a.order_id = $1 AND a.status = 'COMMITTED' ORDER BY i.material_type`,
        [orderId],
      ),
      this.branches.get(branchId).then((b) => b.settings),
    ]);

    type HistoryRow = OrderDetail['history'][number] & { created_at: Date };
    const hist: HistoryRow[] = history;
    const lineViews: OrderLineView[] = lines.map((l: Record<string, any>) => {
      const started = hist.filter((h) => h.line_id === l.line_id && h.to_status === LineStatus.IN_PROGRESS).at(-1);
      const inspected = hist.filter((h) => h.line_id === l.line_id && h.event_type === 'INSPECTION').at(-1);
      return {
        line_id: l.line_id,
        line_number: l.line_number,
        line_no: l.line_no,
        line_type: l.line_type,
        sub_type: l.sub_type,
        status: l.status,
        status_label: LINE_STATUS_LABEL[l.status as LineStatus],
        material_source: l.material_source,
        item_id: l.item_id,
        item_name: l.item_name,
        item_unit: l.item_unit,
        item_sku: l.item_sku,
        spec: l.spec,
        quantity: l.quantity === null ? null : Number(l.quantity),
        price_basis: l.price_basis,
        unit_price: l.unit_price,
        line_total: l.line_total,
        is_customized: l.is_customized,
        customized_reason_code: l.customized_reason_code,
        work_info: l.work_info,
        notes: l.notes,
        completed_at: iso(l.completed_at),
        version: l.version,
        workers: assignments
          .filter((a: { line_id: string }) => a.line_id === l.line_id)
          .map(({ employee_id, full_name, employee_code }: Record<string, string>) => ({ employee_id, full_name, employee_code })),
        started_at: iso(started?.created_at ?? null),
        started_by: started?.actor_name ?? null,
        inspected_by: inspected?.actor_name ?? null,
        customer_material: lineMaterial(materials, l.line_id),
      };
    });

    const active = lineViews.filter((l) => l.status !== LineStatus.CANCELLED);
    const statuses = active.map((l) => l.status);
    const isRoofing = o.order_type === OrderType.ROOFING_ORDER;
    const isHardware = o.order_type === OrderType.HARDWARE_SALE;
    const display = isHardware
      ? hardwareDisplayStatus(o.status)
      : isRoofing
        ? roofingDisplayStatus(o.status, statuses)
        : workshopDisplayStatus(o.status);
    const label = isHardware
      ? HARDWARE_STATUS_LABEL[display as keyof typeof HARDWARE_STATUS_LABEL]
      : isRoofing
        ? ROOFING_STATUS_LABEL[display as keyof typeof ROOFING_STATUS_LABEL]
        : WORKSHOP_STATUS_LABEL[display as keyof typeof WORKSHOP_STATUS_LABEL];
    const workerMap = new Map<string, OrderDetail['workers'][number]>();
    active.forEach((l) => l.workers.forEach((w) => workerMap.set(w.employee_id, w)));
    const gp = materials[0];

    return {
      order_id: o.order_id,
      order_number: o.order_number,
      order_type: o.order_type,
      status: o.status,
      display_status: display,
      display_label: label,
      version: o.version,
      customer: o.c_id ? { customer_id: o.c_id, name: o.c_name, phone: o.c_phone } : null,
      header: o.header ?? {},
      subtotal: o.subtotal,
      discount: o.discount,
      total: o.total,
      paid_amount: o.paid_amount,
      balance: balanceDue(o.total, o.paid_amount),
      payment_state: paymentStateFor(o.total, o.paid_amount),
      min_advance: isRoofing || isHardware ? 0 : jobCardMinAdvance(active, settings),
      created_at: iso(o.created_at)!,
      created_by: o.created_by,
      created_by_name: o.created_by_name,
      actor_role_at_creation: o.actor_role_at_creation,
      released_to: o.released_to,
      released_at: iso(o.released_at),
      released_by_name: o.released_by_name,
      release_notes: o.release_notes,
      can_edit: isHardware
        ? false
        : isRoofing
        ? o.status === OrderStatus.IN_QUEUE && settings.orders.allow_cashier_edit_before_start && !active.some((l) => lineHasStarted(l.status))
        : (o.status === OrderStatus.DRAFT || o.status === OrderStatus.IN_QUEUE) && !active.some((l) => lineHasStarted(l.status)),
      origin_branch_name: o.origin_branch_name ?? null,
      milestones: isRoofing ? milestones(o, hist, active) : null,
      workers: [...workerMap.values()],
      lines: lineViews,
      gate_pass: gp ? { gate_pass_id: gp.gate_pass_id, pass_number: gp.pass_number } : null,
      customer_materials: materials.map(({ gate_pass_id: _g, ...m }: Record<string, unknown>) => m) as OrderDetail['customer_materials'],
      payments: payments.map((p: Record<string, any>) => ({ ...p, paid_at: iso(p.paid_at) })),
      history: hist.map((h) => ({ ...h, created_at: iso(h.created_at)! })),
    };
  }

  /**
   * Order Queue (roofing). Active orders (Placed / In Progress / Ready) are always
   * loaded — the derived Ready status needs their lines. Released and Cancelled are
   * counted in SQL and listed newest first, capped at QUEUE_HISTORY_LIMIT. Every
   * count uses the same search/date filter as the list.
   */
  async roofingQueue(q: RoofingQueueQuery, branchId: string): Promise<{ rows: RoofingQueueRow[]; counts: RoofingQueueCounts; has_more: boolean }> {
    const params: unknown[] = [branchId];
    const where = [`o.branch_id = $1`, `o.order_type = 'ROOFING_ORDER'`];
    if (q.search) {
      params.push(`%${q.search}%`);
      const n = params.length;
      where.push(`(o.order_number ILIKE $${n} OR c.name ILIKE $${n} OR c.phone ILIKE $${n} OR o.header->>'technician' ILIKE $${n})`);
    }
    if (q.placed_on) {
      params.push(q.placed_on);
      where.push(`${localDate('o.created_at')} = $${params.length}`);
    }
    const filter = where.join(' AND ');

    const select = (statusClause: string, limit?: number) =>
      this.ds.query(
        `SELECT o.order_id, o.order_number, o.status, o.total, o.paid_amount, o.version, o.created_at, o.released_at,
                o.header->>'technician' AS technician, EXISTS (SELECT 1 FROM material_allocation ma WHERE ma.order_id = o.order_id AND ma.status = 'COMMITTED') AS has_customer_material,
                c.name AS customer_name, c.phone AS customer_phone,
                array_agg(l.status ORDER BY l.line_no) FILTER (WHERE l.status <> 'CANCELLED') AS line_statuses,
                count(l.line_id) FILTER (WHERE l.status <> 'CANCELLED' OR o.status = 'VOIDED')::int AS item_count,
                COALESCE(sum(l.quantity) FILTER (WHERE l.line_type = 'ROOFING_SHEET' AND (l.status <> 'CANCELLED' OR o.status = 'VOIDED')), 0)::float AS running_ft
         FROM "order" o JOIN customer c ON c.customer_id = o.customer_id
         LEFT JOIN order_line l ON l.order_id = o.order_id
         WHERE ${filter} AND ${statusClause}
         GROUP BY o.order_id, c.name, c.phone
         ORDER BY o.created_at DESC
         ${limit ? `LIMIT ${limit + 1}` : ''}`,
        params,
      );

    const [activeRaw, totals] = await Promise.all([
      select(`o.status IN ('IN_QUEUE', 'IN_PROGRESS')`),
      this.ds.query(
        `SELECT count(*) FILTER (WHERE o.status = 'CLOSED')::int AS released,
                count(*) FILTER (WHERE o.status = 'CLOSED' AND ${localDate('o.released_at')} = $${params.length + 1})::int AS released_today,
                count(*) FILTER (WHERE o.status = 'VOIDED')::int AS cancelled,
                count(*)::int AS all
         FROM "order" o JOIN customer c ON c.customer_id = o.customer_id
         WHERE ${filter} AND o.status IN ('IN_QUEUE', 'IN_PROGRESS', 'CLOSED', 'VOIDED')`,
        [...params, toBranchDate()],
      ),
    ]);
    const active = (activeRaw as Record<string, any>[]).map(roofingRow);
    const t = totals[0] as { released: number; released_today: number; cancelled: number; all: number };
    const counts: RoofingQueueCounts = {
      active: active.length,
      placed: active.filter((r) => r.display_status === 'PLACED').length,
      in_progress: active.filter((r) => r.display_status === 'IN_PROGRESS').length,
      ready: active.filter((r) => r.display_status === 'READY').length,
      ready_unpaid: active.filter((r) => r.display_status === 'READY' && r.balance > 0).length,
      released: t.released,
      released_today: t.released_today,
      cancelled: t.cancelled,
      all: t.all,
      balance_due: active.reduce((s, r) => s + r.balance, 0),
    };

    const history = async (clause: string) => {
      const rows = (await select(clause, QUEUE_HISTORY_LIMIT)) as Record<string, any>[];
      return { rows: rows.slice(0, QUEUE_HISTORY_LIMIT).map(roofingRow), has_more: rows.length > QUEUE_HISTORY_LIMIT };
    };
    switch (q.tab) {
      case 'ACTIVE':
        return { rows: active, counts, has_more: false };
      case 'PLACED':
      case 'IN_PROGRESS':
      case 'READY':
        return { rows: active.filter((r) => r.display_status === q.tab), counts, has_more: false };
      case 'RELEASED':
        return { ...(await history(`o.status = 'CLOSED'`)), counts };
      case 'CANCELLED':
        return { ...(await history(`o.status = 'VOIDED'`)), counts };
      case 'ALL':
        return { ...(await history(`o.status IN ('IN_QUEUE', 'IN_PROGRESS', 'CLOSED', 'VOIDED')`)), counts };
    }
  }

  /**
   * History popup on the Create pages: every job card / roofing order at the branch
   * (any status) whose form date is in From–To, newest first. One query per page:
   * the total comes back with the rows (count(*) OVER ()).
   */
  async history(
    type: OrderType.JOB_CARD | OrderType.ROOFING_ORDER,
    q: OrderHistoryQuery,
    branchId: string,
  ): Promise<{ rows: OrderHistoryRow[]; total: number; page: number; page_size: number }> {
    const dateKey = type === OrderType.JOB_CARD ? 'job_date' : 'order_date';
    const date = `COALESCE(o.header->>'${dateKey}', ${localDate('o.created_at')})`;
    const params: unknown[] = [branchId, type, q.from, q.to];
    const where = [`o.branch_id = $1`, `o.order_type = $2`, `${date} BETWEEN $3 AND $4`];
    if (q.search) {
      params.push(`%${q.search}%`);
      where.push(`(o.order_number ILIKE $${params.length} OR c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length})`);
    }
    params.push(HISTORY_PAGE_SIZE, (q.page - 1) * HISTORY_PAGE_SIZE);
    const rows: Record<string, any>[] = await this.ds.query(
      `SELECT o.order_id, o.order_number, o.status, o.total, o.paid_amount, o.created_at, ${date} AS date,
              c.name AS customer_name, c.phone AS customer_phone, u.full_name AS created_by_name,
              (SELECT array_agg(l.status ORDER BY l.line_no) FROM order_line l WHERE l.order_id = o.order_id AND l.status <> 'CANCELLED') AS line_statuses,
              (SELECT count(*) FROM order_line l WHERE l.order_id = o.order_id AND (l.status <> 'CANCELLED' OR o.status = 'VOIDED'))::int AS item_count,
              count(*) OVER ()::int AS total_rows
       FROM "order" o
       LEFT JOIN customer c ON c.customer_id = o.customer_id
       LEFT JOIN "user" u ON u.user_id = o.created_by
       WHERE ${where.join(' AND ')}
       ORDER BY ${date} DESC, o.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return {
      rows: rows.map((r) => {
        const statuses = parsePgArray(r.line_statuses) as LineStatus[];
        return {
          order_id: r.order_id,
          order_number: r.order_number,
          date: r.date,
          created_at: iso(r.created_at)!,
          customer_name: r.customer_name,
          customer_phone: r.customer_phone,
          created_by_name: r.created_by_name,
          item_count: r.item_count,
          total: r.total,
          paid_amount: r.paid_amount,
          balance: balanceDue(r.total, r.paid_amount),
          status: r.status,
          display_label:
            type === OrderType.JOB_CARD
              ? WORKSHOP_STATUS_LABEL[workshopDisplayStatus(r.status)]
              : ROOFING_STATUS_LABEL[roofingDisplayStatus(r.status, statuses)],
        };
      }),
      // Past the last page there are no rows to carry the count; the client only pages within total
      total: rows[0]?.total_rows ?? 0,
      page: q.page,
      page_size: HISTORY_PAGE_SIZE,
    };
  }

  /**
   * Workshop Queue board (Docs/decisions/0005): the supervisor's columns side by side,
   * In Queue → In Progress → Completed. Unpaid (DRAFT) cards belong to the cashier.
   * Counts are taken over the same search as the rows, so a column count equals its cards.
   */
  async workshopQueue(q: WorkshopQueueQuery, branchId: string) {
    const params: unknown[] = [branchId];
    const where = [`o.branch_id = $1`, `o.order_type = 'JOB_CARD'`, `o.status IN ('IN_QUEUE', 'IN_PROGRESS', 'COMPLETED')`];
    if (q.search) {
      params.push(`%${q.search}%`);
      where.push(`(o.order_number ILIKE $${params.length} OR c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length})`);
    }
    const rows = await this.ds.query(
      `SELECT o.order_id, o.order_number, o.status, o.total, o.paid_amount, o.version, o.created_at, o.header->>'job_date' AS job_date,
              c.name AS customer_name, c.phone AS customer_phone,
              array_agg(l.status ORDER BY l.line_no) FILTER (WHERE l.status <> 'CANCELLED') AS line_statuses,
              array_agg(l.line_total) FILTER (WHERE l.status <> 'CANCELLED') AS line_totals,
              array_agg(l.is_customized) FILTER (WHERE l.status <> 'CANCELLED') AS line_custom
       FROM "order" o JOIN customer c ON c.customer_id = o.customer_id
       LEFT JOIN order_line l ON l.order_id = o.order_id
       WHERE ${where.join(' AND ')}
       GROUP BY o.order_id, c.name, c.phone
       ORDER BY o.created_at`,
      params,
    );
    const settings = (await this.branches.get(branchId)).settings;

    const all: WorkshopQueueRow[] = rows.map((r: Record<string, any>) => {
      const statuses = parsePgArray(r.line_statuses) as LineStatus[];
      const totals = (r.line_totals ?? []) as number[];
      const custom = (r.line_custom ?? []) as boolean[];
      const display = workshopDisplayStatus(r.status);
      return {
        order_id: r.order_id,
        order_number: r.order_number,
        customer_name: r.customer_name,
        customer_phone: r.customer_phone,
        job_date: r.job_date ?? toBranchDate(r.created_at),
        created_at: iso(r.created_at)!,
        status: r.status,
        display_status: display,
        display_label: WORKSHOP_STATUS_LABEL[display],
        line_count: statuses.length,
        completed_count: statuses.filter((s) => s === LineStatus.COMPLETED).length,
        started_count: statuses.filter((s) => lineHasStarted(s)).length,
        total: r.total,
        paid_amount: r.paid_amount,
        balance: balanceDue(r.total, r.paid_amount),
        min_advance: jobCardMinAdvance(totals.map((t, i) => ({ line_total: t, is_customized: custom[i] })), settings),
        payment_state: paymentStateFor(r.total, r.paid_amount),
        version: r.version,
        can_edit: (r.status === OrderStatus.DRAFT || r.status === OrderStatus.IN_QUEUE) && !statuses.some((s) => lineHasStarted(s)),
      };
    });

    const counts = {
      pending: all.filter((r) => r.display_status === 'PENDING').length,
      in_progress: all.filter((r) => r.display_status === 'IN_PROGRESS').length,
      completed: all.filter((r) => r.display_status === 'COMPLETED').length,
    };
    return { rows: all, counts };
  }

  /**
   * Cashier Queue board (Docs/decisions/0005): job cards waiting for the advance,
   * completed job cards waiting for collection, and roofing orders with a balance due.
   */
  async cashierQueue(branchId: string) {
    const rows = await this.ds.query(
      `SELECT o.order_id, o.order_number, o.order_type, o.status, o.total, o.paid_amount, o.version, o.created_at,
              c.name AS customer_name, c.phone AS customer_phone,
              array_agg(l.status) FILTER (WHERE l.status <> 'CANCELLED') AS line_statuses,
              array_agg(l.line_total) FILTER (WHERE l.status <> 'CANCELLED') AS line_totals,
              array_agg(l.is_customized) FILTER (WHERE l.status <> 'CANCELLED') AS line_custom
       FROM "order" o LEFT JOIN customer c ON c.customer_id = o.customer_id
       LEFT JOIN order_line l ON l.order_id = o.order_id
       WHERE o.branch_id = $1
         AND ((o.order_type = 'JOB_CARD' AND o.status IN ('DRAFT', 'COMPLETED'))
           OR (o.order_type = 'ROOFING_ORDER' AND o.status IN ('IN_QUEUE', 'IN_PROGRESS') AND o.paid_amount < o.total))
       GROUP BY o.order_id, c.name, c.phone
       ORDER BY o.created_at`,
      [branchId],
    );
    const settings = (await this.branches.get(branchId)).settings;
    return rows.map((r: Record<string, any>) => {
      const statuses = parsePgArray(r.line_statuses) as LineStatus[];
      const totals = (r.line_totals ?? []) as number[];
      const custom = (r.line_custom ?? []) as boolean[];
      const isRoofing = r.order_type === OrderType.ROOFING_ORDER;
      const display = isRoofing ? roofingDisplayStatus(r.status, statuses) : workshopDisplayStatus(r.status);
      const column: CashierColumn = isRoofing ? 'ROOFING_BALANCE' : r.status === OrderStatus.DRAFT ? 'AWAITING_PAYMENT' : 'READY_FOR_COLLECTION';
      const minAdvance = isRoofing ? 0 : jobCardMinAdvance(totals.map((t, i) => ({ line_total: t, is_customized: custom[i] })), settings);
      return {
        order_id: r.order_id,
        order_number: r.order_number,
        order_type: r.order_type,
        status: r.status,
        column,
        display_label: isRoofing ? ROOFING_STATUS_LABEL[display as keyof typeof ROOFING_STATUS_LABEL] : WORKSHOP_STATUS_LABEL[display as keyof typeof WORKSHOP_STATUS_LABEL],
        customer_name: r.customer_name,
        customer_phone: r.customer_phone,
        total: r.total,
        paid_amount: r.paid_amount,
        balance: balanceDue(r.total, r.paid_amount),
        min_advance: minAdvance,
        advance_due: r.status === OrderStatus.DRAFT ? Math.max(0, minAdvance - r.paid_amount) : 0,
        line_count: statuses.length,
        created_at: iso(r.created_at),
        version: r.version,
      };
    });
  }
}

/** A timestamp column as a YYYY-MM-DD date in the branch timezone (stored as UTC). */
export const localDate = (col: string) => `to_char((${col} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Colombo', 'YYYY-MM-DD')`;

function roofingRow(r: Record<string, any>): RoofingQueueRow {
  const statuses = parsePgArray(r.line_statuses) as LineStatus[];
  const display = roofingDisplayStatus(r.status, statuses);
  return {
    order_id: r.order_id,
    order_number: r.order_number,
    customer_name: r.customer_name,
    customer_phone: r.customer_phone,
    technician: r.technician,
    created_at: iso(r.created_at)!,
    released_at: iso(r.released_at),
    status: r.status,
    display_status: display,
    display_label: ROOFING_STATUS_LABEL[display],
    item_count: r.item_count,
    running_ft: Number(r.running_ft),
    has_customer_material: r.has_customer_material,
    total: r.total,
    paid_amount: r.paid_amount,
    balance: balanceDue(r.total, r.paid_amount),
    payment_state: paymentStateFor(r.total, r.paid_amount),
    version: r.version,
  };
}

/** Placed → Started → Completed → Released (or Cancelled), from the order and its history. */
function milestones(
  o: Record<string, any>,
  hist: { line_id: string | null; event_type: string; to_status: string | null; note: string | null; actor_name: string | null; created_at: Date }[],
  active: OrderLineView[],
): OrderMilestones {
  const orderEvent = (to: OrderStatus) => hist.filter((h) => h.line_id === null && h.to_status === to).at(-1);
  const started = orderEvent(OrderStatus.IN_PROGRESS);
  const cancelled = orderEvent(OrderStatus.VOIDED);
  const done = active.length > 0 && active.every((l) => l.status === LineStatus.COMPLETED);
  const lastDone = done ? active.reduce((a, l) => (!a || (l.completed_at ?? '') > (a.completed_at ?? '') ? l : a), null as OrderLineView | null) : null;
  return {
    placed: { at: iso(o.created_at), by: o.created_by_name },
    started: { at: iso(started?.created_at ?? null), by: started?.actor_name ?? null },
    completed: { at: lastDone?.completed_at ?? null, by: lastDone?.inspected_by ?? null },
    released: {
      at: iso(o.released_at),
      by: o.released_by_name,
      note: o.released_to ? `Handed to ${o.released_to}${o.release_notes ? ` · ${o.release_notes}` : ''}` : null,
    },
    cancelled: cancelled ? { at: iso(cancelled.created_at), by: cancelled.actor_name, note: cancelled.note } : null,
  };
}

function lineMaterial(materials: Record<string, any>[], lineId: string): LineCustomerMaterial | null {
  const m = materials.find((x) => x.line_id === lineId);
  return m
    ? {
        gp_item_id: m.gp_item_id,
        gate_pass_id: m.gate_pass_id,
        pass_number: m.pass_number,
        material_type: m.material_type,
        thickness: m.thickness,
        length: m.length,
        length_unit: m.length_unit,
        color: m.color,
        quantity: m.quantity,
      }
    : null;
}
