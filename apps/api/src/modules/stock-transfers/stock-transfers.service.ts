import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import {
  BranchSettingsSchema,
  ItemType,
  MovementType,
  OPEN_TRANSFER_STATUSES,
  TransferStatus,
  isOpenTransfer,
  toBranchDate,
  transferDisplayStatus,
  transferNeedsAction,
  typeHasRoofing,
  type CreateStockTransferDto,
  type OpenRequestInfo,
  type ReceiveStockTransferDto,
  type RejectStockTransferDto,
  type SendStockTransferDto,
  type NetworkTransferQuery,
  type StockTransferQuery,
  type TransferDisplayStatus,
  type TransferItemSearch,
} from '@erp/shared';
import type { Actor } from '../../common/actor';
import { ERR, errWith } from '../../common/errors';
import { AuditService } from '../../core/audit.service';
import { BranchContextService } from '../../core/branch-context.service';
import { EventsService } from '../../core/events.service';
import { NumberService } from '../../core/number.service';
import { StockService } from '../../core/stock.service';
import { InventoryService } from '../inventory/inventory.service';

type Side = 'INCOMING' | 'OUTGOING';

export interface TransferLineView {
  transfer_line_id: string;
  item_id: string;
  name: string;
  sku: string;
  unit: string;
  category: string;
  qty_requested: number;
  qty_sent: number | null;
  qty_received: number | null;
  /** The viewing branch's own stock of this item (BR06: never the other branch's) */
  own_stock: number;
  /** Own stock minus what open orders hold: the most the viewer can send (Docs/decisions/0003) */
  own_available: number;
}

export interface TransferView {
  transfer_id: string;
  transfer_number: string;
  status: TransferStatus;
  display_status: TransferDisplayStatus;
  /** INCOMING = another branch asked us; OUTGOING = we asked another branch */
  side: Side;
  requesting_branch: { branch_id: string; name: string };
  supplying_branch: { branch_id: string; name: string };
  needed_before: string | null;
  is_urgent: boolean;
  notes: string | null;
  reject_reason: string | null;
  receive_notes: string | null;
  requested_by_name: string | null;
  sent_by_name: string | null;
  received_by_name: string | null;
  closed_by_name: string | null;
  created_at: Date;
  sent_at: Date | null;
  received_at: Date | null;
  closed_at: Date | null;
  /** Still open after the needed-by date */
  late: boolean;
  /** This branch has to act next (send/reject, or receive) */
  needs_action: boolean;
  lines: TransferLineView[];
}

export interface TransferCounts {
  to_us: number;
  ours: number;
  to_send: number;
  to_receive: number;
}

export interface NetworkTransferCounts {
  waiting: number;
  sent: number;
  late: number;
}

export interface TransferItemOption {
  item_id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  stock: number;
  reorder_level: number;
  open_request: OpenRequestInfo | null;
}

interface TransferRow {
  transfer_id: string;
  transfer_number: string;
  requesting_branch_id: string;
  supplying_branch_id: string;
  requesting_branch_name: string;
  supplying_branch_name: string;
  status: TransferStatus;
  needed_before: string | null;
  is_urgent: boolean;
  notes: string | null;
  reject_reason: string | null;
  receive_notes: string | null;
  requested_by_name: string | null;
  sent_by_name: string | null;
  received_by_name: string | null;
  closed_by_name: string | null;
  created_at: Date;
  sent_at: Date | null;
  received_at: Date | null;
  closed_at: Date | null;
}

interface LockedTransfer {
  transfer_id: string;
  transfer_number: string;
  requesting_branch_id: string;
  supplying_branch_id: string;
  status: TransferStatus;
}

interface LockedLine {
  transfer_line_id: string;
  item_id: string;
  name: string;
  qty_requested: number;
  qty_sent: number | null;
}

const HISTORY_LIMIT = 200;
const ITEM_SEARCH_LIMIT = 20;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

const ROW_SELECT = `
  SELECT t.transfer_id, t.transfer_number, t.requesting_branch_id, t.supplying_branch_id,
         rb.name AS requesting_branch_name, sb.name AS supplying_branch_name, t.status,
         to_char(t.needed_before, 'YYYY-MM-DD') AS needed_before, t.is_urgent, t.notes, t.reject_reason, t.receive_notes,
         ru.full_name AS requested_by_name, su.full_name AS sent_by_name, rcu.full_name AS received_by_name, cu.full_name AS closed_by_name,
         t.created_at, t.sent_at, t.received_at, t.closed_at
  FROM stock_transfer t
  JOIN branch rb ON rb.branch_id = t.requesting_branch_id
  JOIN branch sb ON sb.branch_id = t.supplying_branch_id
  LEFT JOIN "user" ru ON ru.user_id = t.requested_by
  LEFT JOIN "user" su ON su.user_id = t.sent_by
  LEFT JOIN "user" rcu ON rcu.user_id = t.received_by
  LEFT JOIN "user" cu ON cu.user_id = t.closed_by`;

/**
 * Stock requests between branches (prototype Stock Request): Waiting → Sent →
 * Received, or Rejected / Cancelled. The asking branch's supervisor creates,
 * cancels and receives; the asked branch's supervisor sends or rejects. Stock
 * leaves the supplier when sent and arrives when received, so nothing is counted
 * twice. Each side only ever sees its own stock (BR06).
 */
@Injectable()
export class StockTransfersService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly numbers: NumberService,
    private readonly branches: BranchContextService,
    private readonly stock: StockService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  /** Other active branches that take stock requests. Names only (BR06). Main branch first. */
  async targets(branchId: string): Promise<{ branch_id: string; name: string; is_main: boolean }[]> {
    const rows: { branch_id: string; name: string; is_main: boolean; settings: unknown }[] = await this.ds.query(
      `SELECT branch_id, name, is_main, settings FROM branch WHERE is_active AND branch_id <> $1 ORDER BY is_main DESC, name`,
      [branchId],
    );
    return rows
      .filter((r) => BranchSettingsSchema.parse(r.settings ?? {}).features.stockRequest)
      .map((r) => ({ branch_id: r.branch_id, name: r.name, is_main: r.is_main }));
  }

  /** Item picker for the New Request form, with our own stock and open requests. */
  async searchItems(q: TransferItemSearch, branchId: string): Promise<TransferItemOption[]> {
    const branch = await this.branches.get(branchId);
    const params: unknown[] = [branchId];
    const where = ['i.is_active'];
    if (!typeHasRoofing(branch.branch_type)) where.push(`i.item_type <> '${ItemType.COIL}'`);
    if (q.ids) {
      params.push(q.ids);
      where.push(`i.item_id = ANY($${params.length}::uuid[])`);
    } else if (q.q) {
      params.push(`%${q.q}%`);
      where.push(`(i.name ILIKE $${params.length} OR i.sku ILIKE $${params.length} OR i.category ILIKE $${params.length})`);
    }
    const rows: { item_id: string; name: string; sku: string; category: string; unit: string; stock: string | null; reorder_level: string | null }[] =
      await this.ds.query(
        `SELECT i.item_id, i.name, i.sku, COALESCE(i.category, 'Other') AS category, i.unit, s.quantity AS stock, s.reorder_level
         FROM item i LEFT JOIN branch_stock s ON s.item_id = i.item_id AND s.branch_id = $1
         WHERE ${where.join(' AND ')}
         ORDER BY (s.item_id IS NULL), i.name
         LIMIT ${q.ids ? 100 : ITEM_SEARCH_LIMIT}`,
        params,
      );
    const open = await this.inventory.openRequests(branchId, rows.map((r) => r.item_id));
    return rows.map((r) => ({
      item_id: r.item_id,
      name: r.name,
      sku: r.sku,
      category: r.category,
      unit: r.unit,
      stock: Number(r.stock ?? 0),
      reorder_level: Number(r.reorder_level ?? 0),
      open_request: open.get(r.item_id) ?? null,
    }));
  }

  async create(dto: CreateStockTransferDto, actor: Actor): Promise<TransferView> {
    const existing = await this.findByRequestId(this.ds.manager, dto.client_request_id, actor.branch_id);
    if (existing) return this.get(existing, actor.branch_id);

    if (dto.supplying_branch_id === actor.branch_id) throw new BadRequestException(ERR.TRANSFER_SAME_BRANCH);
    const targets = await this.targets(actor.branch_id);
    if (!targets.some((t) => t.branch_id === dto.supplying_branch_id)) throw new BadRequestException(ERR.TRANSFER_BRANCH_UNAVAILABLE);
    if (dto.needed_before < toBranchDate()) throw new BadRequestException(ERR.TRANSFER_DATE_PAST);

    const branch = await this.branches.get(actor.branch_id);
    const itemIds = dto.lines.map((l) => l.item_id);

    const id = await this.ds.transaction(async (em) => {
      // One create at a time per branch, so two requests can't both pass the open-request check
      await em.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`stock_request:${actor.branch_id}`]);
      const again = await this.findByRequestId(em, dto.client_request_id, actor.branch_id);
      if (again) return again;

      const items: { item_id: string; name: string }[] = await em.query(
        `SELECT item_id, name FROM item WHERE item_id = ANY($1::uuid[]) AND is_active`,
        [itemIds],
      );
      if (items.length !== itemIds.length) throw new NotFoundException(ERR.STOCK_ITEM_NOT_FOUND);

      const open = await this.inventory.openRequests(actor.branch_id, itemIds, em);
      if (open.size > 0) {
        const names = items.filter((i) => open.has(i.item_id)).map((i) => i.name);
        throw new ConflictException(
          errWith(ERR.TRANSFER_DUPLICATE_ITEM, { items: names }, `Already requested and not received yet: ${names.join(', ')}`),
        );
      }

      const number = await this.numbers.next(em, 'STOCK_TRANSFER', branch.settings.number_prefixes);
      const [{ transfer_id }]: { transfer_id: string }[] = await em.query(
        `INSERT INTO stock_transfer (transfer_number, requesting_branch_id, supplying_branch_id, status, needed_before, is_urgent, notes, requested_by, client_request_id)
         VALUES ($1, $2, $3, 'PENDING', $4, $5, $6, $7, $8) RETURNING transfer_id`,
        [number, actor.branch_id, dto.supplying_branch_id, dto.needed_before, dto.is_urgent, dto.notes || null, actor.user_id, dto.client_request_id],
      );
      for (const l of dto.lines) {
        await em.query(`INSERT INTO stock_transfer_line (transfer_id, item_id, qty_requested) VALUES ($1, $2, $3)`, [transfer_id, l.item_id, l.quantity]);
      }
      return transfer_id;
    });

    this.audit.record(actor, { type: 'stock_transfer', id }, 'CREATE', {
      after: { supplying_branch_id: dto.supplying_branch_id, lines: dto.lines.length, is_urgent: dto.is_urgent },
    });
    this.events.changed(actor.branch_id, 'transfers');
    this.events.changed(dto.supplying_branch_id, 'transfers');
    return this.get(id, actor.branch_id);
  }

  async list(q: StockTransferQuery, branchId: string): Promise<{ rows: TransferView[]; counts: TransferCounts; has_more: boolean }> {
    const side: Side = q.direction;
    const params: unknown[] = [branchId];
    const where = [side === 'INCOMING' ? 't.supplying_branch_id = $1' : 't.requesting_branch_id = $1'];
    if (q.open) {
      params.push(OPEN_TRANSFER_STATUSES);
      where.push(`t.status = ANY($${params.length}::transfer_status_enum[])`);
    }
    if (q.q) {
      params.push(`%${q.q}%`);
      const p = `$${params.length}`;
      const other = side === 'INCOMING' ? 'rb' : 'sb';
      where.push(`(t.transfer_number ILIKE ${p} OR ${other}.name ILIKE ${p} OR EXISTS (
        SELECT 1 FROM stock_transfer_line l JOIN item i ON i.item_id = l.item_id
        WHERE l.transfer_id = t.transfer_id AND (i.name ILIKE ${p} OR i.sku ILIKE ${p})))`);
    }
    const actionable = side === 'INCOMING' ? `t.status IN ('PENDING', 'APPROVED')` : `t.status = 'ISSUED'`;
    const rows: TransferRow[] = await this.ds.query(
      `${ROW_SELECT} WHERE ${where.join(' AND ')}
       ORDER BY (${actionable}) DESC, t.created_at DESC
       LIMIT ${HISTORY_LIMIT + 1}`,
      params,
    );
    const has_more = rows.length > HISTORY_LIMIT;
    const views = await this.views(this.ds.manager, rows.slice(0, HISTORY_LIMIT), branchId);

    // Header totals and the action badges are for the whole branch, not the search
    const [c]: { to_us: number; ours: number; to_send: number; to_receive: number }[] = await this.ds.query(
      `SELECT count(*) FILTER (WHERE supplying_branch_id = $1)::int AS to_us,
              count(*) FILTER (WHERE requesting_branch_id = $1)::int AS ours,
              count(*) FILTER (WHERE supplying_branch_id = $1 AND status IN ('PENDING', 'APPROVED'))::int AS to_send,
              count(*) FILTER (WHERE requesting_branch_id = $1 AND status = 'ISSUED')::int AS to_receive
       FROM stock_transfer WHERE $1 IN (requesting_branch_id, supplying_branch_id)`,
      [branchId],
    );
    return { rows: views, counts: c, has_more };
  }

  /**
   * Head office: every request in the network, read-only (Docs/decisions/0002).
   * Lines carry no own_stock and nothing needs action from the viewer.
   */
  async networkList(q: NetworkTransferQuery): Promise<{ rows: TransferView[]; counts: NetworkTransferCounts; has_more: boolean }> {
    const params: unknown[] = [];
    const where = ['true'];
    if (q.open) {
      params.push(OPEN_TRANSFER_STATUSES);
      where.push(`t.status = ANY($${params.length}::transfer_status_enum[])`);
    }
    if (q.q) {
      params.push(`%${q.q}%`);
      const p = `$${params.length}`;
      where.push(`(t.transfer_number ILIKE ${p} OR rb.name ILIKE ${p} OR sb.name ILIKE ${p} OR EXISTS (
        SELECT 1 FROM stock_transfer_line l JOIN item i ON i.item_id = l.item_id
        WHERE l.transfer_id = t.transfer_id AND (i.name ILIKE ${p} OR i.sku ILIKE ${p})))`);
    }
    const rows: TransferRow[] = await this.ds.query(
      `${ROW_SELECT} WHERE ${where.join(' AND ')}
       ORDER BY (t.status IN ('PENDING', 'APPROVED', 'ISSUED')) DESC, t.created_at DESC
       LIMIT ${HISTORY_LIMIT + 1}`,
      params,
    );
    const has_more = rows.length > HISTORY_LIMIT;
    const views = await this.views(this.ds.manager, rows.slice(0, HISTORY_LIMIT), null);
    // Totals are network-wide, not the search (same rule as the branch view)
    const [c]: NetworkTransferCounts[] = await this.ds.query(
      `SELECT count(*) FILTER (WHERE status IN ('PENDING', 'APPROVED'))::int AS waiting,
              count(*) FILTER (WHERE status = 'ISSUED')::int AS sent,
              count(*) FILTER (WHERE status IN ('PENDING', 'APPROVED', 'ISSUED') AND needed_before < $1::date)::int AS late
       FROM stock_transfer`,
      [toBranchDate()],
    );
    return { rows: views, counts: c, has_more };
  }

  /** A request this branch is on, as either side. Others get 404. */
  async get(transferId: string, branchId: string, em: EntityManager = this.ds.manager): Promise<TransferView> {
    const rows: TransferRow[] = await em.query(
      `${ROW_SELECT} WHERE t.transfer_id = $1 AND $2 IN (t.requesting_branch_id, t.supplying_branch_id)`,
      [transferId, branchId],
    );
    if (rows.length === 0) throw new NotFoundException(ERR.TRANSFER_NOT_FOUND);
    const [view] = await this.views(em, rows, branchId);
    return view;
  }

  /** Supplier sends what it can: stock leaves now (TRANSFER_OUT) and arrives on receive. */
  async send(transferId: string, dto: SendStockTransferDto, actor: Actor): Promise<TransferView> {
    const t = await this.ds.transaction(async (em) => {
      const t = await this.lock(em, transferId, actor.branch_id);
      if (t.supplying_branch_id !== actor.branch_id) throw new ForbiddenException(ERR.TRANSFER_WRONG_BRANCH);
      if (t.status !== TransferStatus.PENDING && t.status !== TransferStatus.APPROVED) throw new ConflictException(ERR.TRANSFER_INVALID_STATE);

      const lines = await this.lockedLines(em, transferId);
      const sent = this.quantities(lines, dto.lines.map((l) => [l.transfer_line_id, l.qty_sent]));
      const overAsked = lines.filter((l) => sent.get(l.transfer_line_id)! > l.qty_requested);
      if (overAsked.length > 0) {
        throw new BadRequestException(
          errWith(ERR.TRANSFER_QTY_OVER, { lines: overAsked.map((l) => ({ item_name: l.name, asked: l.qty_requested, qty: sent.get(l.transfer_line_id) })) },
            `You can't send more than was asked: ${overAsked.map((l) => l.name).join(', ')}`),
        );
      }
      if ([...sent.values()].every((q) => q <= 0)) throw new BadRequestException(ERR.TRANSFER_NOTHING_SENT);

      // Only free stock can be sent: what open orders hold here stays here (Docs/decisions/0003)
      const have = await this.stock.lockAvailable(em, actor.branch_id, lines.map((l) => l.item_id));
      const short = lines.filter((l) => sent.get(l.transfer_line_id)! > (have.get(l.item_id) ?? 0));
      if (short.length > 0) {
        throw new ConflictException(
          errWith(ERR.TRANSFER_QTY_OVER, { lines: short.map((l) => ({ item_name: l.name, available: have.get(l.item_id) ?? 0, qty: sent.get(l.transfer_line_id) })) },
            `Not enough available stock to send: ${short.map((l) => l.name).join(', ')}`),
        );
      }

      await this.stock.deductMany(
        em,
        actor.branch_id,
        lines.map((l) => ({ item_id: l.item_id, quantity: sent.get(l.transfer_line_id)!, transfer_line_id: l.transfer_line_id })),
        MovementType.TRANSFER_OUT,
        actor,
        { reason: `Sent for ${t.transfer_number}` },
      );
      for (const l of lines) {
        await em.query(`UPDATE stock_transfer_line SET qty_sent = $2 WHERE transfer_line_id = $1`, [l.transfer_line_id, sent.get(l.transfer_line_id)]);
      }
      await em.query(`UPDATE stock_transfer SET status = 'ISSUED', sent_by = $2, sent_at = now() WHERE transfer_id = $1`, [transferId, actor.user_id]);
      return t;
    });

    this.audit.record(actor, { type: 'stock_transfer', id: transferId }, 'SEND', { before: { status: t.status }, after: { status: TransferStatus.ISSUED } });
    this.events.changed(t.supplying_branch_id, 'transfers', 'stock');
    this.events.changed(t.requesting_branch_id, 'transfers');
    return this.get(transferId, actor.branch_id);
  }

  /** Requester counts what arrived; that much is added (TRANSFER_IN). A shortfall stays on record. */
  async receive(transferId: string, dto: ReceiveStockTransferDto, actor: Actor): Promise<TransferView> {
    const t = await this.ds.transaction(async (em) => {
      const t = await this.lock(em, transferId, actor.branch_id);
      if (t.requesting_branch_id !== actor.branch_id) throw new ForbiddenException(ERR.TRANSFER_WRONG_BRANCH);
      if (t.status !== TransferStatus.ISSUED) throw new ConflictException(ERR.TRANSFER_INVALID_STATE);

      const lines = await this.lockedLines(em, transferId);
      const got = this.quantities(lines, dto.lines.map((l) => [l.transfer_line_id, l.qty_received]));
      const over = lines.filter((l) => got.get(l.transfer_line_id)! > (l.qty_sent ?? 0));
      if (over.length > 0) {
        throw new BadRequestException(
          errWith(ERR.TRANSFER_QTY_OVER, { lines: over.map((l) => ({ item_name: l.name, sent: l.qty_sent ?? 0, qty: got.get(l.transfer_line_id) })) },
            `More than was sent: ${over.map((l) => l.name).join(', ')}. Check the count again.`),
        );
      }

      for (const l of lines) {
        const qty = got.get(l.transfer_line_id)!;
        await this.stock.add(em, actor.branch_id, { item_id: l.item_id, quantity: qty, transfer_line_id: l.transfer_line_id }, MovementType.TRANSFER_IN, actor, `Received from ${t.transfer_number}`);
        await em.query(`UPDATE stock_transfer_line SET qty_received = $2 WHERE transfer_line_id = $1`, [l.transfer_line_id, qty]);
      }
      await em.query(
        `UPDATE stock_transfer SET status = 'CONFIRMED', received_by = $2, received_at = now(), receive_notes = $3, closed_by = $2, closed_at = now()
         WHERE transfer_id = $1`,
        [transferId, actor.user_id, dto.notes || null],
      );
      return t;
    });

    this.audit.record(actor, { type: 'stock_transfer', id: transferId }, 'RECEIVE', { before: { status: t.status }, after: { status: TransferStatus.CONFIRMED } });
    this.events.changed(t.requesting_branch_id, 'transfers', 'stock');
    this.events.changed(t.supplying_branch_id, 'transfers');
    return this.get(transferId, actor.branch_id);
  }

  async reject(transferId: string, dto: RejectStockTransferDto, actor: Actor): Promise<TransferView> {
    return this.close(transferId, actor, 'SUPPLYING', TransferStatus.REJECTED, dto.reason);
  }

  async cancel(transferId: string, actor: Actor): Promise<TransferView> {
    return this.close(transferId, actor, 'REQUESTING', TransferStatus.CANCELLED);
  }

  /** Reject (asked branch) or cancel (asking branch) a request that is still waiting. */
  private async close(
    transferId: string,
    actor: Actor,
    who: 'SUPPLYING' | 'REQUESTING',
    status: TransferStatus.REJECTED | TransferStatus.CANCELLED,
    reason?: string,
  ): Promise<TransferView> {
    const t = await this.ds.transaction(async (em) => {
      const t = await this.lock(em, transferId, actor.branch_id);
      const mine = who === 'SUPPLYING' ? t.supplying_branch_id : t.requesting_branch_id;
      if (mine !== actor.branch_id) throw new ForbiddenException(ERR.TRANSFER_WRONG_BRANCH);
      if (t.status !== TransferStatus.PENDING && t.status !== TransferStatus.APPROVED) throw new ConflictException(ERR.TRANSFER_INVALID_STATE);
      await em.query(
        `UPDATE stock_transfer SET status = $2, reject_reason = $3, closed_by = $4, closed_at = now() WHERE transfer_id = $1`,
        [transferId, status, reason ?? null, actor.user_id],
      );
      return t;
    });

    this.audit.record(actor, { type: 'stock_transfer', id: transferId }, status === TransferStatus.REJECTED ? 'REJECT' : 'CANCEL', {
      before: { status: t.status },
      after: { status, ...(reason ? { reason } : {}) },
    });
    this.events.changed(t.requesting_branch_id, 'transfers');
    this.events.changed(t.supplying_branch_id, 'transfers');
    return this.get(transferId, actor.branch_id);
  }

  private async findByRequestId(em: EntityManager, clientRequestId: string, branchId: string): Promise<string | null> {
    const rows: { transfer_id: string }[] = await em.query(
      `SELECT transfer_id FROM stock_transfer WHERE client_request_id = $1 AND requesting_branch_id = $2`,
      [clientRequestId, branchId],
    );
    return rows[0]?.transfer_id ?? null;
  }

  private async lock(em: EntityManager, transferId: string, branchId: string): Promise<LockedTransfer> {
    const rows: LockedTransfer[] = await em.query(
      `SELECT transfer_id, transfer_number, requesting_branch_id, supplying_branch_id, status FROM stock_transfer
       WHERE transfer_id = $1 AND $2 IN (requesting_branch_id, supplying_branch_id) FOR UPDATE`,
      [transferId, branchId],
    );
    if (rows.length === 0) throw new NotFoundException(ERR.TRANSFER_NOT_FOUND);
    return rows[0];
  }

  private async lockedLines(em: EntityManager, transferId: string): Promise<LockedLine[]> {
    const rows: { transfer_line_id: string; item_id: string; name: string; qty_requested: string; qty_sent: string | null }[] = await em.query(
      `SELECT l.transfer_line_id, l.item_id, i.name, l.qty_requested, l.qty_sent
       FROM stock_transfer_line l JOIN item i ON i.item_id = l.item_id
       WHERE l.transfer_id = $1 ORDER BY l.item_id FOR UPDATE OF l`,
      [transferId],
    );
    return rows.map((r) => ({ ...r, qty_requested: Number(r.qty_requested), qty_sent: r.qty_sent === null ? null : Number(r.qty_sent) }));
  }

  /** Quantity per line from the body; lines left out count as 0, unknown lines are refused. */
  private quantities(lines: LockedLine[], given: [string, number][]): Map<string, number> {
    const map = new Map(lines.map((l) => [l.transfer_line_id, 0]));
    for (const [id, qty] of given) {
      if (!map.has(id)) throw new BadRequestException(ERR.TRANSFER_LINE_UNKNOWN);
      map.set(id, round3(qty));
    }
    return map;
  }

  /** branchId null = head-office view: no side, no own stock, never needs action. */
  private async views(em: EntityManager, rows: TransferRow[], branchId: string | null): Promise<TransferView[]> {
    if (rows.length === 0) return [];
    const lines: (Omit<TransferLineView, 'qty_requested' | 'qty_sent' | 'qty_received' | 'own_stock' | 'own_available'> & {
      transfer_id: string;
      qty_requested: string;
      qty_sent: string | null;
      qty_received: string | null;
      own_stock: string | null;
      own_available: string | null;
    })[] = await em.query(
      `SELECT l.transfer_id, l.transfer_line_id, l.item_id, i.name, i.sku, i.unit, COALESCE(i.category, 'Other') AS category,
              l.qty_requested, l.qty_sent, l.qty_received, s.quantity AS own_stock,
              s.quantity - s.reserved_quantity AS own_available
       FROM stock_transfer_line l
       JOIN item i ON i.item_id = l.item_id
       LEFT JOIN branch_stock s ON s.item_id = l.item_id AND s.branch_id = $2::uuid
       WHERE l.transfer_id = ANY($1::uuid[])
       ORDER BY i.name`,
      [rows.map((r) => r.transfer_id), branchId],
    );
    const num = (v: string | null) => (v === null ? null : Number(v));
    const today = toBranchDate();
    return rows.map((r) => {
      const side: Side = r.supplying_branch_id === branchId ? 'INCOMING' : 'OUTGOING';
      return {
        transfer_id: r.transfer_id,
        transfer_number: r.transfer_number,
        status: r.status,
        display_status: transferDisplayStatus(r.status),
        side,
        requesting_branch: { branch_id: r.requesting_branch_id, name: r.requesting_branch_name },
        supplying_branch: { branch_id: r.supplying_branch_id, name: r.supplying_branch_name },
        needed_before: r.needed_before,
        is_urgent: r.is_urgent,
        notes: r.notes,
        reject_reason: r.reject_reason,
        receive_notes: r.receive_notes,
        requested_by_name: r.requested_by_name,
        sent_by_name: r.sent_by_name,
        received_by_name: r.received_by_name,
        closed_by_name: r.closed_by_name,
        created_at: r.created_at,
        sent_at: r.sent_at,
        received_at: r.received_at,
        closed_at: r.closed_at,
        late: isOpenTransfer(r.status) && !!r.needed_before && r.needed_before < today,
        needs_action: branchId !== null && transferNeedsAction(r.status, side),
        lines: lines
          .filter((l) => l.transfer_id === r.transfer_id)
          .map((l) => ({
            transfer_line_id: l.transfer_line_id,
            item_id: l.item_id,
            name: l.name,
            sku: l.sku,
            unit: l.unit,
            category: l.category,
            qty_requested: Number(l.qty_requested),
            qty_sent: num(l.qty_sent),
            qty_received: num(l.qty_received),
            own_stock: Number(l.own_stock ?? 0),
            own_available: Number(l.own_available ?? 0),
          })),
      };
    });
  }
}
