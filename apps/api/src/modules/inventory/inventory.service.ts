import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import {
  ItemType,
  MovementType,
  OPEN_TRANSFER_STATUSES,
  freeStock,
  stockAlertInfo,
  stockLevel,
  typeHasRoofing,
  type AlertSeverity,
  type InventoryQuery,
  type OpenRequestInfo,
  type StockAlertQuery,
  type StockLevel,
} from '@erp/shared';
import { ERR } from '../../common/errors';
import type { Actor } from '../../common/actor';
import { AuditService } from '../../core/audit.service';
import { BranchContextService } from '../../core/branch-context.service';
import { EventsService } from '../../core/events.service';
import { StockService } from '../../core/stock.service';

export interface StockRow {
  item_id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  item_type: ItemType;
  /** On hand (physical). Health and alerts use `free`, not this. */
  stock: number;
  /** Held for open orders until their work starts (Docs/decisions/0003) */
  reserved: number;
  /** On hand minus reserved: what a new order or a stock request send can take */
  available: number;
  reorder_level: number;
  /** Free for new work: available minus what open orders booked beyond stock (Docs/decisions/0009) */
  free: number;
  /** From free stock, so booked sheets count */
  level: StockLevel;
  /** Our branch's request for this item that has not arrived yet */
  open_request: OpenRequestInfo | null;
}

export interface InventoryCounts {
  all: number;
  healthy: number;
  low: number;
  out: number;
}

export interface AlertRow extends StockRow {
  severity: AlertSeverity;
  /** How much brings the item back to its minimum */
  deficit: number;
}

export interface AlertCounts {
  /** Below minimum and not asked for yet: what Restock and its badge count */
  needs_restock: number;
  critical: number;
  low: number;
  healthy: number;
  /** Below minimum but already on an open request (shown apart, Docs/decisions/0012) */
  requested: number;
}

/** An open order holding this item at our branch. */
export interface ReservationRow {
  reservation_id: string;
  order_id: string;
  order_number: string;
  line_number: string;
  quantity: number;
  /** Authorised by a stock override, not held */
  shortfall: number;
  created_at: Date;
}

export interface MovementRow {
  movement_id: string;
  movement_type: MovementType;
  quantity: number;
  quantity_after: number;
  reason: string | null;
  /** Order line or stock request the movement belongs to */
  document_number: string | null;
  created_by_name: string | null;
  moved_at: Date;
}

/** A branch shown as a column / tag on the network (all-branches) screens. */
export interface NetworkBranch {
  branch_id: string;
  code: string;
  name: string;
  is_main: boolean;
}

/** One item across the network: each branch's stock plus the total. */
export interface NetworkStockRow {
  item_id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  item_type: ItemType;
  total: number;
  /** Worst level at any branch, so a shortage anywhere is visible */
  level: StockLevel;
  /** Keyed by branch_id; missing = the branch keeps no stock of this item */
  stocks: Record<string, { stock: number; reserved: number; reorder_level: number; level: StockLevel }>;
}

export interface NetworkAlertRow extends AlertRow {
  branch: NetworkBranch;
  /** What the main branch could send of this item: its available stock (null when this is the main branch or it keeps none) */
  main_stock: number | null;
}

const MOVEMENT_LIMIT = 15;
const LEVEL_RANK: Record<StockLevel, number> = { HEALTHY: 0, LOW: 1, OUT: 2 };

const LEVEL_FILTER: Record<InventoryQuery['status'], StockLevel | null> = { ALL: null, HEALTHY: 'HEALTHY', LOW: 'LOW', OUT: 'OUT' };

/**
 * Inventory and Stock Alerts read the branch's own stock only (BR06); the network
 * methods are the head-office view of every branch (Docs/decisions/0002). Health
 * and shortfall come from the shared stock-status rules, so both screens and
 * the stock_alert rows that StockService maintains always agree.
 */
@Injectable()
export class InventoryService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly branches: BranchContextService,
    private readonly stock: StockService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  async list(q: InventoryQuery, branchId: string): Promise<{ rows: StockRow[]; counts: InventoryCounts; categories: string[] }> {
    const all = await this.stockRows(branchId);
    const searched = all.filter((r) => matches(r, q.q, q.category));
    const want = LEVEL_FILTER[q.status];
    const rows = searched.filter((r) => !want || r.level === want);
    rows.sort((a, b) =>
      q.sort === 'STOCK_ASC' ? a.free - b.free || a.name.localeCompare(b.name)
      : q.sort === 'STOCK_DESC' ? b.free - a.free || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name),
    );
    // Counts follow search and category (not the status tab), so each tab count matches its list
    const counts: InventoryCounts = {
      all: searched.length,
      healthy: searched.filter((r) => r.level === 'HEALTHY').length,
      low: searched.filter((r) => r.level === 'LOW').length,
      out: searched.filter((r) => r.level === 'OUT').length,
    };
    return { rows, counts, categories: categoriesOf(all) };
  }

  async alerts(q: StockAlertQuery, branchId: string): Promise<{ rows: AlertRow[]; requested: AlertRow[]; counts: AlertCounts; categories: string[] }> {
    const all = (await this.stockRows(branchId)).map((r) => ({ ...r, ...stockAlertInfo(r.free, r.reorder_level) }));
    return filterAlerts(all, q);
  }

  /** Items still to restock at one branch: the sidebar badge (same rule as the Restock list). */
  async alertCount(branchId: string): Promise<{ count: number }> {
    return { count: (await this.stockRows(branchId)).filter(needsRestock).length };
  }

  /**
   * A branch manager sets an item's minimum (Docs/decisions/0012). Restock, the badge and
   * the stock_alert history follow straight away.
   */
  async setMinimum(itemId: string, reorderLevel: number, actor: Actor): Promise<StockRow & { movements: MovementRow[]; reservations: ReservationRow[] }> {
    const before = await this.ds.transaction((em) => this.stock.setMinimum(em, actor.branch_id, itemId, reorderLevel));
    if (before === null) throw new NotFoundException(ERR.STOCK_ITEM_NOT_FOUND);
    if (before !== reorderLevel) {
      this.audit.record(actor, { type: 'branch_stock', id: itemId }, 'SET_MINIMUM', { before: { reorder_level: before }, after: { reorder_level: reorderLevel } });
      this.events.changed(actor.branch_id, 'stock');
    }
    return this.item(itemId, actor.branch_id);
  }

  /** Head office on "All branches": alerts across every branch with Stock Alerts on. */
  async networkAlertCount(): Promise<{ count: number }> {
    const branches = await this.networkBranches('stockAlerts');
    const counts = await Promise.all(branches.map((b) => this.alertCount(b.branch_id)));
    return { count: counts.reduce((sum, c) => sum + c.count, 0) };
  }

  /**
   * Head office (global roles): every branch's stock in one table, main branch first.
   * Same search / category / status rules as one branch's Inventory; status is the
   * worst level at any branch.
   */
  async networkList(q: InventoryQuery): Promise<{ branches: NetworkBranch[]; rows: NetworkStockRow[]; counts: InventoryCounts; categories: string[] }> {
    const branches = await this.networkBranches('inventory');
    const perBranch = await Promise.all(branches.map((b) => this.stockRows(b.branch_id)));
    const byItem = new Map<string, NetworkStockRow>();
    branches.forEach((b, i) => {
      for (const r of perBranch[i]) {
        const row = byItem.get(r.item_id) ?? {
          item_id: r.item_id, name: r.name, sku: r.sku, category: r.category, unit: r.unit, item_type: r.item_type,
          total: 0, level: 'HEALTHY' as StockLevel, stocks: {},
        };
        row.stocks[b.branch_id] = { stock: r.stock, reserved: r.reserved, reorder_level: r.reorder_level, level: r.level };
        row.total = round3(row.total + r.stock);
        if (LEVEL_RANK[r.level] > LEVEL_RANK[row.level]) row.level = r.level;
        byItem.set(r.item_id, row);
      }
    });
    const all = [...byItem.values()];
    const searched = all.filter((r) => matches(r, q.q, q.category));
    const want = LEVEL_FILTER[q.status];
    const rows = searched.filter((r) => !want || r.level === want);
    rows.sort((a, b) =>
      q.sort === 'STOCK_ASC' ? a.total - b.total || a.name.localeCompare(b.name)
      : q.sort === 'STOCK_DESC' ? b.total - a.total || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name),
    );
    const counts: InventoryCounts = {
      all: searched.length,
      healthy: searched.filter((r) => r.level === 'HEALTHY').length,
      low: searched.filter((r) => r.level === 'LOW').length,
      out: searched.filter((r) => r.level === 'OUT').length,
    };
    return { branches, rows, counts, categories: categoriesOf(all) };
  }

  /** Head office: stock alerts at every branch, with what the main branch could cover. */
  async networkAlerts(
    q: StockAlertQuery,
  ): Promise<{ branches: NetworkBranch[]; rows: NetworkAlertRow[]; requested: NetworkAlertRow[]; counts: AlertCounts; categories: string[] }> {
    const branches = await this.networkBranches('stockAlerts');
    const main = (await this.networkBranches('inventory')).find((b) => b.is_main) ?? null;
    const mainIndex = branches.findIndex((b) => b.branch_id === main?.branch_id);
    const perBranch = await Promise.all(branches.map((b) => this.stockRows(b.branch_id)));
    // The main branch's rows are already loaded when it is one of the alert branches; load them again only if it is not
    const mainRows = mainIndex >= 0 ? perBranch[mainIndex] : main ? await this.stockRows(main.branch_id) : [];
    // Only free stock can be sent (Docs/decisions/0003)
    const mainStock = new Map(mainRows.map((r) => [r.item_id, r.available]));
    const all: NetworkAlertRow[] = branches.flatMap((b, i) =>
      perBranch[i].map((r) => ({
        ...r,
        ...stockAlertInfo(r.free, r.reorder_level),
        branch: b,
        main_stock: b.is_main ? null : (mainStock.get(r.item_id) ?? null),
      })),
    );
    return { branches, ...filterAlerts(all, q) };
  }

  /** Active branches with the module switched on, main first. */
  private async networkBranches(feature: 'inventory' | 'stockAlerts'): Promise<NetworkBranch[]> {
    const ids: { branch_id: string }[] = await this.ds.query(`SELECT branch_id FROM branch WHERE is_active ORDER BY is_main DESC, name`);
    const ctx = await Promise.all(ids.map((r) => this.branches.get(r.branch_id)));
    return ctx
      .filter((b) => b.settings.features[feature])
      .map((b) => ({ branch_id: b.branch_id, code: b.code, name: b.name, is_main: b.is_main }));
  }

  /** One item at our branch: stock, open request and recent movements. */
  async item(itemId: string, branchId: string): Promise<StockRow & { movements: MovementRow[]; reservations: ReservationRow[] }> {
    const items: Omit<StockRow, 'level' | 'open_request' | 'stock' | 'reserved' | 'available' | 'free' | 'reorder_level'>[] = await this.ds.query(
      `SELECT item_id, name, sku, COALESCE(category, 'Other') AS category, unit, item_type FROM item WHERE item_id = $1 AND is_active`,
      [itemId],
    );
    if (items.length === 0) throw new NotFoundException(ERR.STOCK_ITEM_NOT_FOUND);
    const stock: { quantity: string; reserved_quantity: string; reorder_level: string }[] = await this.ds.query(
      `SELECT quantity, reserved_quantity, reorder_level FROM branch_stock WHERE branch_id = $1 AND item_id = $2`,
      [branchId, itemId],
    );
    const qty = Number(stock[0]?.quantity ?? 0);
    const reserved = Number(stock[0]?.reserved_quantity ?? 0);
    const reorder = Number(stock[0]?.reorder_level ?? 0);
    const open = await this.openRequests(branchId, [itemId]);

    const movements: (Omit<MovementRow, 'quantity' | 'quantity_after'> & { quantity: string; quantity_after: string })[] = await this.ds.query(
      `SELECT m.movement_id, m.movement_type, m.quantity, m.quantity_after, m.reason, m.moved_at,
              COALESCE(ol.line_number, t.transfer_number) AS document_number, u.full_name AS created_by_name
       FROM stock_movement m
       LEFT JOIN order_line ol ON ol.line_id = m.line_id
       LEFT JOIN stock_transfer_line tl ON tl.transfer_line_id = m.transfer_line_id
       LEFT JOIN stock_transfer t ON t.transfer_id = tl.transfer_id
       LEFT JOIN "user" u ON u.user_id = m.created_by
       WHERE m.branch_id = $1 AND m.item_id = $2
       ORDER BY m.moved_at DESC
       LIMIT ${MOVEMENT_LIMIT}`,
      [branchId, itemId],
    );

    const reservations: (Omit<ReservationRow, 'quantity' | 'shortfall'> & { quantity: string; shortfall: string })[] = await this.ds.query(
      `SELECT r.reservation_id, r.order_id, o.order_number, ol.line_number, r.quantity, r.shortfall, r.created_at
       FROM stock_reservation r
       JOIN "order" o ON o.order_id = r.order_id
       JOIN order_line ol ON ol.line_id = r.line_id
       WHERE r.branch_id = $1 AND r.item_id = $2 AND r.status = 'RESERVED'
       ORDER BY r.created_at`,
      [branchId, itemId],
    );

    const shortfall = reservations.reduce((sum, r) => sum + Number(r.shortfall), 0);
    const free = freeStock(qty, reserved, shortfall);
    return {
      ...items[0],
      stock: qty,
      reserved,
      available: round3(qty - reserved),
      free,
      reorder_level: reorder,
      level: stockLevel(free, reorder),
      open_request: open.get(itemId) ?? null,
      movements: movements.map((m) => ({ ...m, quantity: Number(m.quantity), quantity_after: Number(m.quantity_after) })),
      reservations: reservations.map((r) => ({ ...r, quantity: Number(r.quantity), shortfall: Number(r.shortfall) })),
    };
  }

  /**
   * Items our branch asked for that have not arrived. Sent wins over Waiting
   * when an item is on more than one open request (prototype rule).
   */
  async openRequests(branchId: string, itemIds?: string[], em: EntityManager = this.ds.manager): Promise<Map<string, OpenRequestInfo>> {
    const rows: { item_id: string; status: string; transfer_number: string; qty_requested: string; qty_sent: string | null }[] = await em.query(
      `SELECT l.item_id, t.status, t.transfer_number, l.qty_requested, l.qty_sent
       FROM stock_transfer t JOIN stock_transfer_line l ON l.transfer_id = t.transfer_id
       WHERE t.requesting_branch_id = $1 AND t.status = ANY($2::transfer_status_enum[])
         ${itemIds ? 'AND l.item_id = ANY($3::uuid[])' : ''}
       ORDER BY t.created_at`,
      itemIds ? [branchId, OPEN_TRANSFER_STATUSES, itemIds] : [branchId, OPEN_TRANSFER_STATUSES],
    );
    const map = new Map<string, OpenRequestInfo>();
    for (const r of rows) {
      const sent = r.status === 'ISSUED';
      const qty = sent ? Number(r.qty_sent ?? 0) : Number(r.qty_requested);
      const prev = map.get(r.item_id);
      map.set(r.item_id, {
        status: prev?.status === 'SENT' || sent ? 'SENT' : 'WAITING',
        qty: round3((prev?.qty ?? 0) + qty),
        transfer_numbers: [...(prev?.transfer_numbers ?? []), r.transfer_number],
      });
    }
    return map;
  }

  /** Every item the branch keeps stock of. Coils only where the branch does roofing. */
  private async stockRows(branchId: string): Promise<StockRow[]> {
    const branch = await this.branches.get(branchId);
    const rows: {
      item_id: string;
      name: string;
      sku: string;
      category: string;
      unit: string;
      item_type: ItemType;
      quantity: string;
      reserved_quantity: string;
      reorder_level: string;
      shortfall: string | null;
    }[] =
      await this.ds.query(
        // Booked beyond stock (override shortfall) on open orders counts against free stock
        `SELECT i.item_id, i.name, i.sku, COALESCE(i.category, 'Other') AS category, i.unit, i.item_type, s.quantity, s.reserved_quantity, s.reorder_level, b.shortfall
         FROM branch_stock s JOIN item i ON i.item_id = s.item_id
         LEFT JOIN (SELECT item_id, SUM(shortfall) AS shortfall FROM stock_reservation WHERE branch_id = $1 AND status = 'RESERVED' GROUP BY item_id) b ON b.item_id = s.item_id
         WHERE s.branch_id = $1 AND i.is_active ${typeHasRoofing(branch.branch_type) ? '' : `AND i.item_type <> 'COIL'`}`,
        [branchId],
      );
    const open = await this.openRequests(branchId);
    return rows.map((r) => {
      const stock = Number(r.quantity);
      const reserved = Number(r.reserved_quantity);
      const reorder = Number(r.reorder_level);
      const free = freeStock(stock, reserved, Number(r.shortfall ?? 0));
      return {
        item_id: r.item_id,
        name: r.name,
        sku: r.sku,
        category: r.category,
        unit: r.unit,
        item_type: r.item_type,
        stock,
        reserved,
        available: round3(stock - reserved),
        free,
        reorder_level: reorder,
        level: stockLevel(free, reorder),
        open_request: open.get(r.item_id) ?? null,
      };
    });
  }
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Below its minimum and not on an open request yet: Restock's to-do (Docs/decisions/0012). */
const needsRestock = (r: Pick<StockRow, 'level' | 'open_request'>) => r.level !== 'HEALTHY' && !r.open_request;

/**
 * Restock list filter, sort and counts — shared by one branch and the network view.
 * Items already asked for leave the to-do list and are returned apart as `requested`,
 * so the list empties as the branch acts.
 */
function filterAlerts<T extends Pick<AlertRow, 'name' | 'sku' | 'category' | 'severity' | 'deficit' | 'level' | 'open_request'>>(
  all: T[],
  q: StockAlertQuery,
): { rows: T[]; requested: T[]; counts: AlertCounts; categories: string[] } {
  const searched = all.filter((r) => matches(r, q.q, q.category));
  const todo = searched.filter(needsRestock);
  // Out of stock first, then the biggest shortfall
  const bySeverity = (a: T, b: T) => Number(b.severity === 'CRITICAL') - Number(a.severity === 'CRITICAL') || b.deficit - a.deficit || a.name.localeCompare(b.name);
  const rows = todo.filter((r) => q.filter === 'NEEDS_RESTOCK' || r.severity === q.filter).sort(bySeverity);
  const requested = searched.filter((r) => r.level !== 'HEALTHY' && r.open_request).sort(bySeverity);
  const counts: AlertCounts = {
    needs_restock: todo.length,
    critical: todo.filter((r) => r.severity === 'CRITICAL').length,
    low: todo.filter((r) => r.severity === 'LOW').length,
    healthy: searched.filter((r) => r.severity === 'NORMAL').length,
    requested: requested.length,
  };
  return { rows, requested, counts, categories: categoriesOf(all) };
}

type Searchable = Pick<StockRow, 'name' | 'sku' | 'category'>;

function matches(r: Searchable, q?: string, category?: string): boolean {
  if (category && r.category !== category) return false;
  if (!q) return true;
  const s = q.toLowerCase();
  return r.name.toLowerCase().includes(s) || r.sku.toLowerCase().includes(s) || r.category.toLowerCase().includes(s);
}

const categoriesOf = (rows: Searchable[]) => [...new Set(rows.map((r) => r.category))].sort();
