import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { HistoryEventType, OrderType, Role, type InspectionResult, type OrderStatus } from '@erp/shared';
import type { Actor } from '../../common/actor';
import { ERR } from '../../common/errors';
import type { OrderEntity } from '../../database/entities/order.entity';
import type { OrderLineEntity } from '../../database/entities/order-line.entity';

/**
 * BR21 "active session": the web app refreshes its access token every 15 minutes
 * while open (each refresh creates a new session row), so a live session created
 * within this window means the supervisor is using the system now.
 */
const SUPERVISOR_ACTIVE_WINDOW_MIN = 30;

/** Row locks, version checks, authority rules and the status history writer for orders. */
@Injectable()
export class OrderAccessService {
  async lockOrder(em: EntityManager, orderId: string, branchId: string, type?: OrderType): Promise<OrderEntity> {
    const rows: OrderEntity[] = await em.query(`SELECT * FROM "order" WHERE order_id = $1 AND branch_id = $2 FOR UPDATE`, [
      orderId,
      branchId,
    ]);
    const order = rows[0];
    if (!order) throw new NotFoundException(ERR.ORDER_NOT_FOUND);
    if (type && order.order_type !== type) throw new BadRequestException(ERR.ORDER_WRONG_TYPE);
    return order;
  }

  async lockLine(em: EntityManager, lineId: string, branchId: string): Promise<{ line: OrderLineEntity; order: OrderEntity }> {
    const lines: OrderLineEntity[] = await em.query(
      `SELECT l.* FROM order_line l JOIN "order" o ON o.order_id = l.order_id
       WHERE l.line_id = $1 AND o.branch_id = $2`,
      [lineId, branchId],
    );
    if (!lines[0]) throw new NotFoundException(ERR.LINE_NOT_FOUND);
    // Order first, then line — the same order every writer uses, so no deadlocks
    const order = await this.lockOrder(em, lines[0].order_id, branchId);
    const [line]: OrderLineEntity[] = await em.query(`SELECT * FROM order_line WHERE line_id = $1 FOR UPDATE`, [lineId]);
    return { line, order };
  }

  assertVersion(current: number, expected: number): void {
    if (current !== expected) throw new ConflictException(ERR.ORDER_VERSION_CONFLICT);
  }

  /**
   * BR21 Chief deference: a CHIEF may not change an order a SUPERVISOR created
   * while that supervisor is active at the branch.
   */
  async assertChiefMayModify(em: EntityManager, order: Pick<OrderEntity, 'created_by' | 'actor_role_at_creation'>, actor: Actor) {
    if (actor.role !== Role.CHIEF || order.actor_role_at_creation !== Role.SUPERVISOR) return;
    if (order.created_by === actor.user_id) return;
    const rows: unknown[] = await em.query(
      `SELECT 1 FROM user_session
       WHERE user_id = $1 AND is_active = true AND revoked_at IS NULL AND expires_at > now()
         AND created_at > LOCALTIMESTAMP - make_interval(mins => $2)
       LIMIT 1`,
      [order.created_by, SUPERVISOR_ACTIVE_WINDOW_MIN],
    );
    if (rows.length > 0) throw new ConflictException(ERR.ORDER_SUPERVISOR_ACTIVE);
  }

  async setOrderStatus(em: EntityManager, orderId: string, status: OrderStatus): Promise<void> {
    await em.query(`UPDATE "order" SET status = $2, version = version + 1, updated_at = now() WHERE order_id = $1`, [orderId, status]);
  }

  async history(
    em: EntityManager,
    actor: Actor,
    h: {
      order_id: string;
      line_id?: string | null;
      event_type: HistoryEventType;
      from_status?: string | null;
      to_status?: string | null;
      result?: InspectionResult | null;
      note?: string | null;
    },
  ): Promise<void> {
    await em.query(
      `INSERT INTO status_history (order_id, line_id, event_type, from_status, to_status, result, note, actor_id, actor_role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [h.order_id, h.line_id ?? null, h.event_type, h.from_status ?? null, h.to_status ?? null, h.result ?? null, h.note ?? null, actor.user_id, actor.role],
    );
  }
}
