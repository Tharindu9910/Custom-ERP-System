import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { EntityManager } from 'typeorm';
import { MovementType, ReservationStatus, stockLevel, type StockOverride } from '@erp/shared';
import { ERR, errWith } from '../common/errors';
import type { Actor } from '../common/actor';
import { BranchContextService } from './branch-context.service';
import { RolePermissionsService } from './role-permissions.service';

export interface StockDeduction {
  item_id: string;
  quantity: number;
  line_id?: string | null;
  transfer_line_id?: string | null;
}

export interface StockReservationInput {
  item_id: string;
  quantity: number;
  line_id: string;
}

export interface StockShortage {
  item_id: string;
  item_name: string;
  unit: string;
  required: number;
  /** Free stock: on hand minus what open orders hold. */
  available: number;
  /** Held for other open orders (included in on hand, not in available). */
  reserved: number;
}

interface LockedStock {
  item_id: string;
  quantity: number;
  reserved: number;
  reorder_level: number;
}

interface OpenReservation {
  reservation_id: string;
  line_id: string;
  item_id: string;
  quantity: number;
  shortfall: number;
  override_reason: string | null;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The only writer of branch_stock and stock_reservation. Every change locks the stock
 * rows, writes a stock_movement (signed quantity + quantity_after), and keeps
 * stock_alert in step. Stock never goes negative (DB CHECK); an override deducts what
 * is there and records the shortfall on the OVERRIDE movement (Docs/decisions/0001).
 *
 * Open orders hold their branch material from creation until work starts
 * (Docs/decisions/0003): available = quantity - reserved_quantity, and anything that
 * isn't consuming its own reservation can only take available stock.
 */
@Injectable()
export class StockService {
  constructor(
    private readonly branches: BranchContextService,
    private readonly rolePermissions: RolePermissionsService,
  ) {}

  /**
   * Deducts several items all-or-nothing. A line's own reservation is consumed first;
   * anything beyond it comes from available stock. A shortfall already authorised by
   * an override when the order was created is taken as an override again, without a
   * second password. Any other shortage throws 409 STOCK_INSUFFICIENT listing every
   * shortage and whether the branch allows an override.
   */
  async deductMany(
    em: EntityManager,
    branchId: string,
    items: StockDeduction[],
    movementType: MovementType,
    actor: Actor,
    opts: { reason?: string; override?: StockOverride } = {},
  ): Promise<void> {
    const wanted = items.filter((i) => i.quantity > 0);
    if (wanted.length === 0) return;

    const locked = await this.lock(em, branchId, [...new Set(wanted.map((i) => i.item_id))]);
    const lineIds = wanted.map((i) => i.line_id).filter((x): x is string => !!x);
    const reservations = await this.openReservations(em, { lineIds });
    const byLine = new Map(reservations.map((r) => [r.line_id, r]));

    // Per item: what this call holds, what it needs beyond that, and what was authorised up front
    const held = new Map<string, number>();
    const extra = new Map<string, number>();
    const authorised = new Map<string, number>();
    for (const i of wanted) {
      const r = i.line_id ? byLine.get(i.line_id) : undefined;
      const own = r && r.item_id === i.item_id ? Math.min(r.quantity, i.quantity) : 0;
      held.set(i.item_id, round3((held.get(i.item_id) ?? 0) + own));
      extra.set(i.item_id, round3((extra.get(i.item_id) ?? 0) + i.quantity - own));
      if (r && r.item_id === i.item_id) authorised.set(i.item_id, round3((authorised.get(i.item_id) ?? 0) + r.shortfall));
    }

    const shortages: StockShortage[] = [];
    for (const [itemId, need] of extra) {
      const s = locked.get(itemId);
      const free = s ? round3(s.quantity - s.reserved) : 0;
      if (round3(need - free) > (authorised.get(itemId) ?? 0)) {
        shortages.push({ item_id: itemId, item_name: '', unit: '', required: round3(need + (held.get(itemId) ?? 0)), available: round3(free + (held.get(itemId) ?? 0)), reserved: round3((s?.reserved ?? 0) - (held.get(itemId) ?? 0)) });
      }
    }
    if (shortages.length > 0) await this.authoriseShortages(em, branchId, shortages, opts.override, actor);

    // Deduct per line so each movement points at the line that used the stock
    const stock = new Map([...locked].map(([id, s]) => [id, { quantity: s.quantity, reserved: s.reserved }]));
    for (const i of wanted) {
      const s = stock.get(i.item_id) ?? { quantity: 0, reserved: 0 };
      const r = i.line_id ? byLine.get(i.line_id) : undefined;
      const own = r && r.item_id === i.item_id ? Math.min(r.quantity, i.quantity) : 0;
      const fromFree = Math.min(round3(s.quantity - s.reserved), round3(i.quantity - own));
      const take = round3(own + Math.max(0, fromFree));
      s.quantity = round3(s.quantity - take);
      s.reserved = round3(s.reserved - own);
      stock.set(i.item_id, s);
      if (take > 0) {
        await em.query(`UPDATE branch_stock SET quantity = $3, reserved_quantity = $4 WHERE branch_id = $1 AND item_id = $2`, [
          branchId,
          i.item_id,
          s.quantity,
          s.reserved,
        ]);
      }
      if (r) await this.closeReservations(em, [r.reservation_id], ReservationStatus.CONSUMED, null);

      const shortBy = round3(i.quantity - take);
      const overrideReason = shortBy > 0 ? (opts.override?.reason ?? r?.override_reason ?? null) : null;
      await this.movement(em, {
        branchId,
        itemId: i.item_id,
        type: shortBy > 0 ? MovementType.OVERRIDE : movementType,
        quantity: -take,
        after: s.quantity,
        lineId: i.line_id ?? null,
        transferLineId: i.transfer_line_id ?? null,
        reason: shortBy > 0 ? `Override: ${overrideReason} (short by ${shortBy})` : (opts.reason ?? null),
        actor,
      });
      await this.syncAlert(em, branchId, i.item_id, s.quantity, locked.get(i.item_id)?.reorder_level ?? 0);
    }
  }

  /**
   * Holds branch material for an order's lines, all-or-nothing, when the order is
   * created or edited. Only available stock can be held; with a valid override the
   * rest is recorded as an authorised shortfall. Nothing physically moves, so no
   * stock_movement is written.
   */
  async reserveMany(
    em: EntityManager,
    branchId: string,
    orderId: string,
    items: StockReservationInput[],
    actor: Actor,
    opts: { override?: StockOverride } = {},
  ): Promise<void> {
    const wanted = items.filter((i) => i.quantity > 0);
    if (wanted.length === 0) return;

    const totals = new Map<string, number>();
    for (const i of wanted) totals.set(i.item_id, round3((totals.get(i.item_id) ?? 0) + i.quantity));
    const locked = await this.lock(em, branchId, [...totals.keys()]);

    const shortages: StockShortage[] = [];
    for (const [itemId, required] of totals) {
      const s = locked.get(itemId);
      const available = s ? round3(s.quantity - s.reserved) : 0;
      if (available < required) shortages.push({ item_id: itemId, item_name: '', unit: '', required, available, reserved: s?.reserved ?? 0 });
    }
    if (shortages.length > 0) await this.authoriseShortages(em, branchId, shortages, opts.override, actor);

    const free = new Map([...locked].map(([id, s]) => [id, round3(s.quantity - s.reserved)]));
    const added = new Map<string, number>();
    for (const i of wanted) {
      const hold = Math.min(free.get(i.item_id) ?? 0, i.quantity);
      free.set(i.item_id, round3((free.get(i.item_id) ?? 0) - hold));
      added.set(i.item_id, round3((added.get(i.item_id) ?? 0) + hold));
      const shortfall = round3(i.quantity - hold);
      await em.query(
        `INSERT INTO stock_reservation (branch_id, item_id, order_id, line_id, quantity, shortfall, override_reason, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [branchId, i.item_id, orderId, i.line_id, hold, shortfall, shortfall > 0 ? opts.override!.reason : null, actor.user_id],
      );
    }
    for (const [itemId, qty] of added) {
      if (qty > 0) {
        await em.query(`UPDATE branch_stock SET reserved_quantity = reserved_quantity + $3 WHERE branch_id = $1 AND item_id = $2`, [
          branchId,
          itemId,
          qty,
        ]);
      }
    }
  }

  /** Frees everything an order still holds (edit, void, cancel). Returns how many lines were released. */
  async releaseForOrder(em: EntityManager, orderId: string, reason: string): Promise<number> {
    const open = await this.openReservations(em, { orderId });
    if (open.length === 0) return 0;
    const branch: { branch_id: string }[] = await em.query(`SELECT branch_id FROM "order" WHERE order_id = $1`, [orderId]);
    // Lock the stock rows first (same order as every other writer) so this can't deadlock
    await this.lock(em, branch[0].branch_id, [...new Set(open.map((r) => r.item_id))]);
    await this.closeReservations(em, open.map((r) => r.reservation_id), ReservationStatus.RELEASED, reason);

    const totals = new Map<string, number>();
    for (const r of open) totals.set(r.item_id, round3((totals.get(r.item_id) ?? 0) + r.quantity));
    for (const [itemId, qty] of [...totals].sort(([a], [b]) => a.localeCompare(b))) {
      if (qty > 0) {
        await em.query(`UPDATE branch_stock SET reserved_quantity = reserved_quantity - $3 WHERE branch_id = $1 AND item_id = $2`, [
          branch[0].branch_id,
          itemId,
          qty,
        ]);
      }
    }
    return open.length;
  }

  /** Adds stock (transfer received, adjustment). Creates the branch_stock row if needed. */
  async add(
    em: EntityManager,
    branchId: string,
    item: StockDeduction,
    movementType: MovementType,
    actor: Actor,
    reason?: string,
  ): Promise<void> {
    if (item.quantity <= 0) return;
    const rows: { quantity: string; reorder_level: string }[] = await em.query(
      `INSERT INTO branch_stock (branch_id, item_id, quantity) VALUES ($1, $2, $3)
       ON CONFLICT (branch_id, item_id) DO UPDATE SET quantity = branch_stock.quantity + EXCLUDED.quantity
       RETURNING quantity, reorder_level`,
      [branchId, item.item_id, item.quantity],
    );
    const after = Number(rows[0].quantity);
    await this.movement(em, {
      branchId,
      itemId: item.item_id,
      type: movementType,
      quantity: item.quantity,
      after,
      lineId: item.line_id ?? null,
      transferLineId: item.transfer_line_id ?? null,
      reason: reason ?? null,
      actor,
    });
    await this.syncAlert(em, branchId, item.item_id, after, Number(rows[0].reorder_level));
  }

  /** Current quantities for the given items at a branch (0 when there is no row). */
  async quantities(em: EntityManager, branchId: string, itemIds: string[]): Promise<Map<string, number>> {
    if (itemIds.length === 0) return new Map();
    const rows: { item_id: string; quantity: string }[] = await em.query(
      `SELECT item_id, quantity FROM branch_stock WHERE branch_id = $1 AND item_id = ANY($2::uuid[])`,
      [branchId, itemIds],
    );
    const map = new Map(itemIds.map((id) => [id, 0]));
    rows.forEach((r) => map.set(r.item_id, Number(r.quantity)));
    return map;
  }

  /**
   * Locks the stock rows (FOR UPDATE) and returns the available quantity (on hand
   * minus what open orders hold), 0 when the branch has no row. For checks that must
   * not race a deduction, e.g. sending a stock request, which has no override path.
   */
  async lockAvailable(em: EntityManager, branchId: string, itemIds: string[]): Promise<Map<string, number>> {
    const locked = await this.lock(em, branchId, itemIds);
    return new Map(
      itemIds.map((id) => {
        const s = locked.get(id);
        return [id, s ? round3(s.quantity - s.reserved) : 0];
      }),
    );
  }

  private async lock(em: EntityManager, branchId: string, itemIds: string[]): Promise<Map<string, LockedStock>> {
    // Lock in a fixed order so two concurrent starts cannot deadlock
    const rows: { item_id: string; quantity: string; reserved_quantity: string; reorder_level: string }[] = await em.query(
      `SELECT item_id, quantity, reserved_quantity, reorder_level FROM branch_stock
       WHERE branch_id = $1 AND item_id = ANY($2::uuid[]) ORDER BY item_id FOR UPDATE`,
      [branchId, itemIds],
    );
    return new Map(
      rows.map((r) => [
        r.item_id,
        { item_id: r.item_id, quantity: Number(r.quantity), reserved: Number(r.reserved_quantity), reorder_level: Number(r.reorder_level) },
      ]),
    );
  }

  /** Open (RESERVED) reservations for the given lines or order, locked. */
  private async openReservations(em: EntityManager, by: { lineIds?: string[]; orderId?: string }): Promise<OpenReservation[]> {
    if (by.lineIds && by.lineIds.length === 0) return [];
    const rows: { reservation_id: string; line_id: string; item_id: string; quantity: string; shortfall: string; override_reason: string | null }[] =
      await em.query(
        `SELECT reservation_id, line_id, item_id, quantity, shortfall, override_reason FROM stock_reservation
         WHERE status = 'RESERVED' AND ${by.lineIds ? 'line_id = ANY($1::uuid[])' : 'order_id = $1'}
         ORDER BY reservation_id FOR UPDATE`,
        [by.lineIds ?? by.orderId],
      );
    return rows.map((r) => ({ ...r, quantity: Number(r.quantity), shortfall: Number(r.shortfall) }));
  }

  private async closeReservations(em: EntityManager, ids: string[], status: ReservationStatus, reason: string | null): Promise<void> {
    await em.query(
      `UPDATE stock_reservation SET status = $2, release_reason = $3, closed_at = now() WHERE reservation_id = ANY($1::uuid[])`,
      [ids, status, reason],
    );
  }

  /**
   * Fills in names, then throws 409 unless a valid override covers the shortages.
   * Using an override needs override:stock (Role Permissions) as well as the branch password.
   */
  private async authoriseShortages(
    em: EntityManager,
    branchId: string,
    shortages: StockShortage[],
    override: StockOverride | undefined,
    actor: Pick<Actor, 'role'>,
  ): Promise<void> {
    await this.describe(em, shortages);
    const branch = await this.branches.get(branchId);
    const overrideAllowed = branch.settings.stock_override_enabled && branch.stock_override_configured;
    if (!override) {
      throw new ConflictException(errWith(ERR.STOCK_INSUFFICIENT, { shortages, override_allowed: overrideAllowed }));
    }
    if (!(await this.rolePermissions.has(actor.role, 'override:stock'))) {
      throw new ForbiddenException(ERR.AUTH_INSUFFICIENT_PERMISSION);
    }
    if (!overrideAllowed) throw new BadRequestException(ERR.STOCK_OVERRIDE_DISABLED);
    await this.checkOverridePassword(em, branchId, override.password);
  }

  private async describe(em: EntityManager, shortages: StockShortage[]): Promise<void> {
    const rows: { item_id: string; name: string; unit: string }[] = await em.query(
      `SELECT item_id, name, unit FROM item WHERE item_id = ANY($1::uuid[])`,
      [shortages.map((s) => s.item_id)],
    );
    const byId = new Map(rows.map((r) => [r.item_id, r]));
    shortages.forEach((s) => {
      s.item_name = byId.get(s.item_id)?.name ?? 'Unknown item';
      s.unit = byId.get(s.item_id)?.unit ?? '';
    });
  }

  private async checkOverridePassword(em: EntityManager, branchId: string, password: string): Promise<void> {
    const rows: { hash: string | null }[] = await em.query(
      `SELECT stock_override_password_hash AS hash FROM branch WHERE branch_id = $1`,
      [branchId],
    );
    const hash = rows[0]?.hash;
    if (!hash || !(await bcrypt.compare(password, hash))) {
      throw new BadRequestException(ERR.STOCK_OVERRIDE_PASSWORD_WRONG);
    }
  }

  private async movement(
    em: EntityManager,
    m: {
      branchId: string;
      itemId: string;
      type: MovementType;
      quantity: number;
      after: number;
      lineId: string | null;
      transferLineId: string | null;
      reason: string | null;
      actor: Actor;
    },
  ): Promise<void> {
    await em.query(
      // clock_timestamp(), not the column default now(): several movements in one transaction
      // would otherwise share a timestamp and "latest" (quantity_after) would be ambiguous
      `INSERT INTO stock_movement (branch_id, item_id, movement_type, quantity, quantity_after, line_id, transfer_line_id, reason, created_by, moved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, clock_timestamp() AT TIME ZONE current_setting('TimeZone'))`,
      [m.branchId, m.itemId, m.type, m.quantity, m.after, m.lineId, m.transferLineId, m.reason, m.actor.user_id],
    );
  }

  /** One unresolved alert per branch item while it is low or out; resolved once healthy again. */
  private async syncAlert(em: EntityManager, branchId: string, itemId: string, quantity: number, reorder: number): Promise<void> {
    if (stockLevel(quantity, reorder) === 'HEALTHY') {
      await em.query(
        `UPDATE stock_alert SET status = 'RESOLVED' WHERE branch_id = $1 AND item_id = $2 AND status <> 'RESOLVED'`,
        [branchId, itemId],
      );
      return;
    }
    await em.query(
      `INSERT INTO stock_alert (branch_id, item_id, quantity_at_alert) VALUES ($1, $2, $3)
       ON CONFLICT (branch_id, item_id) WHERE status <> 'RESOLVED' DO NOTHING`,
      [branchId, itemId, quantity],
    );
  }
}
