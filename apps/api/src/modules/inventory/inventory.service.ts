import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import {
  ItemType,
  MovementType,
  OPEN_TRANSFER_STATUSES,
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
import { BranchContextService } from '../../core/branch-context.service';

export interface StockRow {
  item_id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  item_type: ItemType;
  /** On hand (physical). Health and alerts are based on this. */
  stock: number;
  /** Held for open orders until their work starts (Docs/decisions/0003) */
  reserved: number;
  /** On hand minus reserved: what a new order or a stock request send can take */
  available: number;
  reorder_level: number;
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
  needs_restock: number;
  critical: number;
  low: number;
  healthy: number;
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
  ) {}

  async list(q: InventoryQuery, branchId: string): Promise<{ rows: StockRow[]; counts: InventoryCounts; categories: string[] }> {
    const all = await this.stockRows(branchId);
    const searched = all.filter((r) => matches(r, q.q, q.category));
    const want = LEVEL_FILTER[q.status];
    const rows = searched.filter((r) => !want || r.level === want);
    rows.sort((a, b) =>
      q.sort === 'STOCK_ASC' ? a.stock - b.stock || a.name.localeCompare(b.name)
      : q.sort === 'STOCK_DESC' ? b.stock - a.stock || a.name.localeCompare(b.name)
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

  async alerts(q: StockAlertQuery, branchId: string): Promise<{ rows: AlertRow[]; counts: AlertCounts; categories: string[] }> {
    const all = (await this.stockRows(branchId)).map((r) => ({ ...r, ...stockAlertInfo(r.stock, r.reorder_level) }));
    return filterAlerts(all, q);
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
  async networkAlerts(q: StockAlertQuery): Promise<{ branches: NetworkBranch[]; rows: NetworkAlertRow[]; counts: AlertCounts; categories: string[] }> {
    const branches = await this.networkBranches('stockAlerts');
    const main = (await this.networkBranches('inventory')).find((b) => b.is_main) ?? null;
    const [perBranch, mainRows] = await Promise.all([
      Promise.all(branches.map((b) => this.stockRows(b.branch_id))),
      main ? this.stockRows(main.branch_id) : Promise.resolve([]),
    ]);
    // Only free stock can be sent (Docs/decisions/0003)
    const mainStock = new Map(mainRows.map((r) => [r.item_id, r.available]));
    const all: NetworkAlertRow[] = branches.flatMap((b, i) =>
      perBranch[i].map((r) => ({
        ...r,
        ...stockAlertInfo(r.stock, r.reorder_level),
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
    const items: Omit<StockRow, 'level' | 'open_request' | 'stock' | 'reserved' | 'available' | 'reorder_level'>[] = await this.ds.query(
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

    return {
      ...items[0],
      stock: qty,
      reserved,
      available: round3(qty - reserved),
      reorder_level: reorder,
      level: stockLevel(qty, reorder),
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
    }[] =
      await this.ds.query(
        `SELECT i.item_id, i.name, i.sku, COALESCE(i.category, 'Other') AS category, i.unit, i.item_type, s.quantity, s.reserved_quantity, s.reorder_level
         FROM branch_stock s JOIN item i ON i.item_id = s.item_id
         WHERE s.branch_id = $1 AND i.is_active ${typeHasRoofing(branch.branch_type) ? '' : `AND i.item_type <> 'COIL'`}`,
        [branchId],
      );
    const open = await this.openRequests(branchId);
    return rows.map((r) => {
      const stock = Number(r.quantity);
      const reserved = Number(r.reserved_quantity);
      const reorder = Number(r.reorder_level);
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
        reorder_level: reorder,
        level: stockLevel(stock, reorder),
        open_request: open.get(r.item_id) ?? null,
      };
    });
  }
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Stock Alerts tab filter, sort and counts — shared by one branch and the network view. */
function filterAlerts<T extends Pick<AlertRow, 'name' | 'sku' | 'category' | 'severity' | 'deficit'>>(
  all: T[],
  q: StockAlertQuery,
): { rows: T[]; counts: AlertCounts; categories: string[] } {
  const searched = all.filter((r) => matches(r, q.q, q.category));
  const rows = searched
    .filter((r) => (q.filter === 'NEEDS_RESTOCK' ? r.severity !== 'NORMAL' : r.severity === q.filter))
    // Out of stock first, then the biggest shortfall
    .sort((a, b) => Number(b.severity === 'CRITICAL') - Number(a.severity === 'CRITICAL') || b.deficit - a.deficit || a.name.localeCompare(b.name));
  const counts: AlertCounts = {
    needs_restock: searched.filter((r) => r.severity !== 'NORMAL').length,
    critical: searched.filter((r) => r.severity === 'CRITICAL').length,
    low: searched.filter((r) => r.severity === 'LOW').length,
    healthy: searched.filter((r) => r.severity === 'NORMAL').length,
  };
  return { rows, counts, categories: categoriesOf(all) };
}

type Searchable = Pick<StockRow, 'name' | 'sku' | 'category'>;

function matches(r: Searchable, q?: string, category?: string): boolean {
  if (category && r.category !== category) return false;
  if (!q) return true;
  const s = q.toLowerCase();
  return r.name.toLowerCase().includes(s) || r.sku.toLowerCase().includes(s) || r.category.toLowerCase().includes(s);
}

const categoriesOf = (rows: Searchable[]) => [...new Set(rows.map((r) => r.category))].sort();
