import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { itemBalance, type AllocationLike, type GatePassItemLike } from '@erp/shared';
import type { Actor } from '../../common/actor';
import { ERR, errWith } from '../../common/errors';
import { EventsService } from '../../core/events.service';

interface LockedItem extends GatePassItemLike {
  gate_pass_id: string;
}

export interface CommittedAllocation {
  gp_item_id: string;
  quantity: number;
}

/**
 * Customer material on gate passes: commits onto an order and releases. Every write
 * locks the gate pass's item rows so two orders can never take the same pieces.
 */
@Injectable()
export class AllocationsService {
  private readonly logger = new Logger(AllocationsService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly events: EventsService,
  ) {}

  /**
   * Saves customer material onto an order, inside the order's transaction. Nothing is
   * held while the form is open: quantities are checked under lock only now, when the
   * order is placed. In edit mode the order's earlier commits are released first.
   */
  async commit(
    em: EntityManager,
    p: { order_id: string; gate_pass_id: string; customer_id: string; items: CommittedAllocation[]; replace: boolean },
    actor: Actor,
  ): Promise<CommittedAllocation[]> {
    const pass: { customer_id: string }[] = await em.query(
      `SELECT customer_id FROM gate_pass WHERE gate_pass_id = $1 AND branch_id = $2`,
      [p.gate_pass_id, actor.branch_id],
    );
    if (!pass[0]) throw new NotFoundException(ERR.GATE_PASS_NOT_FOUND);
    if (pass[0].customer_id !== p.customer_id) throw new BadRequestException(ERR.GATE_PASS_CUSTOMER_MISMATCH);

    const items = await this.lockItems(em, p.gate_pass_id, actor.branch_id);
    if (p.replace) await this.releaseForOrder(em, p.order_id, 'replaced_in_edit');

    const now = new Date();
    const all = await this.activeAllocations(em, items.map((i) => i.gp_item_id));
    for (const req of p.items) {
      const item = items.find((i) => i.gp_item_id === req.gp_item_id);
      if (!item) throw new NotFoundException(ERR.GATE_PASS_ITEM_NOT_FOUND);
      const { available } = itemBalance(item, all, { now });
      if (req.quantity > available) {
        throw new ConflictException(
          errWith(
            ERR.ALLOCATION_INSUFFICIENT,
            { gp_item_id: item.gp_item_id, requested: req.quantity, available },
            `Not enough ${item.material_type} left on the gate pass. Requested ${req.quantity}, available ${available}.`,
          ),
        );
      }
    }

    for (const req of p.items) {
      await em.query(
        `INSERT INTO material_allocation (gp_item_id, order_id, quantity, status, accepted_by)
         VALUES ($1, $2, $3, 'COMMITTED', $4)`,
        [req.gp_item_id, p.order_id, req.quantity, actor.user_id],
      );
    }
    return p.items;
  }

  /**
   * Saves customer material per line (job cards, Docs/decisions/0007): each line uses one
   * gate pass item, and a card may draw on several of the customer's passes. All items are
   * locked together and checked on the total each item gives across the lines. In edit mode
   * the order's earlier commits are released first. Returns the gate passes touched.
   */
  async commitLines(
    em: EntityManager,
    p: { order_id: string; customer_id: string; lines: { line_id: string; gp_item_id: string; quantity: number }[]; replace: boolean },
    actor: Actor,
  ): Promise<string[]> {
    if (p.replace) await this.releaseForOrder(em, p.order_id, 'replaced_in_edit');
    if (p.lines.length === 0) return [];

    const ids = [...new Set(p.lines.map((l) => l.gp_item_id))];
    // One lock order across passes, so two cards on the same passes can't deadlock
    const items: (LockedItem & { customer_id: string })[] = await em.query(
      `SELECT i.gp_item_id, i.gate_pass_id, i.material_type, i.thickness, i.length::float AS length, i.length_unit, i.color,
              i.quantity, i.condition_note, gp.customer_id
       FROM gate_pass_item i JOIN gate_pass gp ON gp.gate_pass_id = i.gate_pass_id
       WHERE i.gp_item_id = ANY($1::uuid[]) AND gp.branch_id = $2
       ORDER BY i.gp_item_id FOR UPDATE OF i`,
      [ids, actor.branch_id],
    );
    if (items.length !== ids.length) throw new NotFoundException(ERR.GATE_PASS_ITEM_NOT_FOUND);
    if (items.some((i) => i.customer_id !== p.customer_id)) throw new BadRequestException(ERR.GATE_PASS_CUSTOMER_MISMATCH);

    const now = new Date();
    const all = await this.activeAllocations(em, ids);
    for (const item of items) {
      const requested = p.lines.filter((l) => l.gp_item_id === item.gp_item_id).reduce((s, l) => s + l.quantity, 0);
      const { available } = itemBalance(item, all, { now });
      if (requested > available) {
        throw new ConflictException(
          errWith(
            ERR.ALLOCATION_INSUFFICIENT,
            { gp_item_id: item.gp_item_id, requested, available },
            `Not enough ${item.material_type} left on the gate pass. Requested ${requested}, available ${available}.`,
          ),
        );
      }
    }

    for (const l of p.lines) {
      await em.query(
        `INSERT INTO material_allocation (gp_item_id, order_id, line_id, quantity, status, accepted_by)
         VALUES ($1, $2, $3, $4, 'COMMITTED', $5)`,
        [l.gp_item_id, p.order_id, l.line_id, l.quantity, actor.user_id],
      );
    }
    return [...new Set(items.map((i) => i.gate_pass_id))];
  }

  /** Frees everything committed to an order (void, cancel, gate pass unassigned on edit). */
  async releaseForOrder(em: EntityManager, orderId: string, reason: string): Promise<number> {
    const rows: unknown[] = await em.query(
      `UPDATE material_allocation SET status = 'RELEASED', release_reason = $2, released_at = now()
       WHERE order_id = $1 AND status <> 'RELEASED' RETURNING allocation_id`,
      [orderId, reason],
    );
    return affected(rows);
  }

  /** Gate pass ids with committed material on an order. */
  async gatePassIdsForOrder(em: EntityManager, orderId: string): Promise<string[]> {
    const rows: { gate_pass_id: string }[] = await em.query(
      `SELECT DISTINCT i.gate_pass_id FROM material_allocation a JOIN gate_pass_item i ON i.gp_item_id = a.gp_item_id
       WHERE a.order_id = $1`,
      [orderId],
    );
    return rows.map((r) => r.gate_pass_id);
  }

  /** Releases leftover draft reservations from before allocations were saved only on placing (draft_expired). */
  @Cron(CronExpression.EVERY_MINUTE)
  async expireReservations(): Promise<void> {
    try {
      const rows: { branch_id: string }[] = await this.ds.query(
        `WITH expired AS (
           UPDATE material_allocation SET status = 'RELEASED', release_reason = 'draft_expired', released_at = now()
           WHERE status = 'RESERVED' AND expires_at < now() RETURNING gp_item_id
         )
         SELECT DISTINCT gp.branch_id FROM expired e
         JOIN gate_pass_item i ON i.gp_item_id = e.gp_item_id JOIN gate_pass gp ON gp.gate_pass_id = i.gate_pass_id`,
      );
      rows.forEach((r) => this.events.changed(r.branch_id, 'gate_passes'));
    } catch (e) {
      this.logger.error('Failed to expire reservations', e as Error);
    }
  }

  private async lockItems(em: EntityManager, gatePassId: string, branchId: string): Promise<LockedItem[]> {
    const items: LockedItem[] = await em.query(
      `SELECT i.gp_item_id, i.gate_pass_id, i.material_type, i.thickness, i.length::float AS length, i.length_unit, i.color,
              i.quantity, i.condition_note
       FROM gate_pass_item i JOIN gate_pass gp ON gp.gate_pass_id = i.gate_pass_id
       WHERE i.gate_pass_id = $1 AND gp.branch_id = $2
       ORDER BY i.gp_item_id FOR UPDATE OF i`,
      [gatePassId, branchId],
    );
    if (items.length === 0) throw new NotFoundException(ERR.GATE_PASS_NOT_FOUND);
    return items;
  }

  private async activeAllocations(em: EntityManager, itemIds: string[]): Promise<AllocationLike[]> {
    return em.query(
      `SELECT allocation_id, gp_item_id, order_id, draft_id, quantity, status, expires_at, created_at
       FROM material_allocation WHERE gp_item_id = ANY($1::uuid[]) AND status <> 'RELEASED'`,
      [itemIds],
    );
  }
}

/** TypeORM returns [rows, count] for UPDATE … RETURNING on postgres. */
function affected(result: unknown[]): number {
  if (result.length === 2 && Array.isArray(result[0]) && typeof result[1] === 'number') return result[1];
  return result.length;
}
