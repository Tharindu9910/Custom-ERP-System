import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BranchSettingsSchema, OrderStatus, Role, balanceDue, toBranchDate } from '@erp/shared';
import type { Actor } from '../../common/actor';
import { ERR } from '../../common/errors';
import { BranchContextService } from '../../core/branch-context.service';
import { RolePermissionsService } from '../../core/role-permissions.service';
import { localDate } from '../orders/order-queries.service';

export interface HardwareStoreItem {
  item_id: string;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  price: number;
  /** On hand minus what open orders hold */
  available: number;
  reorder_level: number;
}

export interface HardwareStoreBranch {
  branch_id: string;
  name: string;
  is_own: boolean;
}

export interface HardwareStoreView {
  branch: HardwareStoreBranch;
  /** Own branch first; other branches only with create:cross_branch_hardware_sale */
  branches: HardwareStoreBranch[];
  /** Minimum advance % for an order on this branch when it is not the user's own */
  remote_min_advance_pct: number;
  items: HardwareStoreItem[];
}

export type HardwareColumn = 'AWAITING_PAYMENT' | 'PAID';

export interface HardwareQueueRow {
  order_id: string;
  order_number: string;
  column: HardwareColumn;
  status: OrderStatus;
  customer_name: string | null;
  customer_phone: string | null;
  /** Placed by another branch's cashier (advance taken there) */
  origin_branch_name: string | null;
  total: number;
  paid_amount: number;
  balance: number;
  line_count: number;
  total_qty: number;
  first_item_name: string | null;
  first_item_qty: number | null;
  first_item_unit: string | null;
  /** For search on the board */
  item_skus: string[];
  item_names: string[];
  created_by_name: string | null;
  created_at: string;
  paid_at: string | null;
  version: number;
}

export interface HardwareQueue {
  rows: HardwareQueueRow[];
  counts: { awaiting_payment: number; paid_today: number; awaiting_balance: number; paid_today_total: number };
}

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

/** Reads for the Hardware Store and Hardware Queue (Docs/decisions/0006). One query per screen. */
@Injectable()
export class HardwareQueriesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly branches: BranchContextService,
    private readonly rolePermissions: RolePermissionsService,
  ) {}

  async mayOrderCrossBranch(actor: Actor): Promise<boolean> {
    return actor.role === Role.SUPER_ADMIN || this.rolePermissions.has(actor.role, 'create:cross_branch_hardware_sale');
  }

  /**
   * Branches the user can sell from: always their own; with the cross-branch permission
   * also every active branch that has both the Hardware Store and the Hardware Queue on
   * (the balance must be collectable there).
   */
  async sellableBranches(actor: Actor): Promise<HardwareStoreBranch[]> {
    const own = await this.branches.get(actor.branch_id);
    const result: HardwareStoreBranch[] = [{ branch_id: own.branch_id, name: own.name, is_own: true }];
    if (!(await this.mayOrderCrossBranch(actor))) return result;

    const rows: { branch_id: string; name: string; settings: unknown }[] = await this.ds.query(
      `SELECT branch_id, name, settings FROM branch WHERE is_active = true AND branch_id <> $1 ORDER BY is_main DESC, name`,
      [actor.branch_id],
    );
    for (const r of rows) {
      const features = BranchSettingsSchema.parse(r.settings ?? {}).features;
      if (features.hardwareStore && features.hardwareQueue) result.push({ branch_id: r.branch_id, name: r.name, is_own: false });
    }
    return result;
  }

  /**
   * Hardware catalogue with one branch's available stock. Another branch's stock is
   * shown only to users who may order there — hardware rows only (narrow BR06 exception).
   */
  async storeItems(actor: Actor, branchId?: string): Promise<HardwareStoreView> {
    const branches = await this.sellableBranches(actor);
    const target = branchId ?? actor.branch_id;
    const branch = branches.find((b) => b.branch_id === target);
    if (!branch) throw new ForbiddenException(target === actor.branch_id ? ERR.FEATURE_DISABLED : ERR.HARDWARE_CROSS_BRANCH_DENIED);

    const [rows, ctx] = await Promise.all([
      this.ds.query(
        `SELECT i.item_id, i.sku, i.name, i.category, i.unit, i.price,
                (s.quantity - s.reserved_quantity)::float AS available, s.reorder_level::float AS reorder_level
         FROM item i JOIN branch_stock s ON s.item_id = i.item_id AND s.branch_id = $1
         WHERE i.item_type = 'HARDWARE' AND i.is_active = true
         ORDER BY i.category NULLS LAST, i.name`,
        [target],
      ),
      this.branches.get(target),
    ]);
    return {
      branch,
      branches,
      remote_min_advance_pct: ctx.settings.orders.hardware_remote_min_advance_pct,
      items: rows.map((r: HardwareStoreItem) => ({ ...r, available: Math.max(0, Number(r.available)), reorder_level: Number(r.reorder_level) })),
    };
  }

  /**
   * Hardware Queue board: everything awaiting payment, plus what was paid today
   * (branch local day). Counts come from the same rows, so they always match the lists.
   */
  async queue(branchId: string): Promise<HardwareQueue> {
    const rows: Record<string, any>[] = await this.ds.query(
      `SELECT o.order_id, o.order_number, o.status, o.total, o.paid_amount, o.created_at, o.released_at, o.version,
              c.name AS customer_name, c.phone AS customer_phone, ob.name AS origin_branch_name, u.full_name AS created_by_name,
              l.line_count, l.total_qty, l.first_item_name, l.first_item_qty, l.first_item_unit, l.item_skus, l.item_names
       FROM "order" o
       LEFT JOIN customer c ON c.customer_id = o.customer_id
       LEFT JOIN branch ob ON ob.branch_id = o.origin_branch_id
       LEFT JOIN "user" u ON u.user_id = o.created_by
       CROSS JOIN LATERAL (
         SELECT count(*)::int AS line_count,
                COALESCE(sum(ol.quantity), 0)::float AS total_qty,
                (array_agg(i.name ORDER BY ol.line_no))[1] AS first_item_name,
                (array_agg(ol.quantity::float ORDER BY ol.line_no))[1] AS first_item_qty,
                (array_agg(i.unit ORDER BY ol.line_no))[1] AS first_item_unit,
                COALESCE(json_agg(i.sku ORDER BY ol.line_no), '[]'::json) AS item_skus,
                COALESCE(json_agg(i.name ORDER BY ol.line_no), '[]'::json) AS item_names
         FROM order_line ol JOIN item i ON i.item_id = ol.item_id
         WHERE ol.order_id = o.order_id AND ol.status <> 'CANCELLED'
       ) l
       WHERE o.branch_id = $1 AND o.order_type = 'HARDWARE_SALE'
         AND (o.status = 'IN_QUEUE' OR (o.status = 'CLOSED' AND ${localDate('o.released_at')} = $2))
       ORDER BY o.created_at`,
      [branchId, toBranchDate()],
    );

    const mapped: HardwareQueueRow[] = rows.map((r) => ({
      order_id: r.order_id,
      order_number: r.order_number,
      column: r.status === OrderStatus.CLOSED ? 'PAID' : 'AWAITING_PAYMENT',
      status: r.status,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      origin_branch_name: r.origin_branch_name,
      total: r.total,
      paid_amount: r.paid_amount,
      balance: balanceDue(r.total, r.paid_amount),
      line_count: r.line_count,
      total_qty: Number(r.total_qty),
      first_item_name: r.first_item_name,
      first_item_qty: r.first_item_qty === null ? null : Number(r.first_item_qty),
      first_item_unit: r.first_item_unit,
      item_skus: r.item_skus ?? [],
      item_names: r.item_names ?? [],
      created_by_name: r.created_by_name,
      created_at: iso(r.created_at)!,
      paid_at: iso(r.released_at),
      version: r.version,
    }));
    // Awaiting: oldest first (serve in order). Paid: latest first.
    const awaiting = mapped.filter((r) => r.column === 'AWAITING_PAYMENT');
    const paid = mapped.filter((r) => r.column === 'PAID').sort((a, b) => (b.paid_at ?? '').localeCompare(a.paid_at ?? ''));
    return {
      rows: [...awaiting, ...paid],
      counts: {
        awaiting_payment: awaiting.length,
        paid_today: paid.length,
        awaiting_balance: awaiting.reduce((s, r) => s + r.balance, 0),
        paid_today_total: paid.reduce((s, r) => s + r.total, 0),
      },
    };
  }
}
