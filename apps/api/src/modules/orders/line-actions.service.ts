import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import {
  HistoryEventType,
  InspectionResult,
  LineStatus,
  MaterialSource,
  MovementType,
  OrderStatus,
  OrderType,
  allActiveLinesCompleted,
  canTransitionLine,
  type CompleteJobCardDto,
  type CompleteWorkDto,
  type StartJobCardDto,
  type StartWorkDto,
  type StockOverride,
} from '@erp/shared';
import type { Actor } from '../../common/actor';
import { ERR } from '../../common/errors';
import { AuditService } from '../../core/audit.service';
import { EventsService } from '../../core/events.service';
import { StockService } from '../../core/stock.service';
import { AllocationsService } from '../gate-passes/allocations.service';
import { GatePassesService } from '../gate-passes/gate-passes.service';
import { OrderAccessService } from './order-access.service';
import { OrderQueriesService, type OrderDetail } from './order-queries.service';
import type { OrderEntity } from '../../database/entities/order.entity';
import type { OrderLineEntity } from '../../database/entities/order-line.entity';

/**
 * Workshop floor actions. The supervisor moves the job card itself (Start Job,
 * Mark Completed — Docs/decisions/0005); single sub-jobs can also be started and
 * completed from the card, but they never move the card.
 */
@Injectable()
export class LineActionsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly access: OrderAccessService,
    private readonly stock: StockService,
    private readonly allocations: AllocationsService,
    private readonly gatePasses: GatePassesService,
    private readonly queries: OrderQueriesService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  /**
   * Start Job: IN_QUEUE → IN_PROGRESS, and the chosen sub-jobs start. Branch material
   * for those sub-jobs is deducted now (BR10); not enough stock returns 409 with
   * override_allowed, and a valid override is recorded and audited.
   */
  async startCard(orderId: string, dto: StartJobCardDto, actor: Actor): Promise<OrderDetail> {
    let usedOverride = false;
    await this.ds.transaction(async (em) => {
      const order = await this.access.lockOrder(em, orderId, actor.branch_id, OrderType.JOB_CARD);
      if (order.status === OrderStatus.DRAFT) throw new ConflictException(ERR.ORDER_NOT_PAID);
      if (order.status !== OrderStatus.IN_QUEUE) throw new ConflictException(ERR.ORDER_INVALID_TRANSITION);
      this.access.assertVersion(order.version, dto.version);
      await this.access.assertChiefMayModify(em, order, actor);

      const lines = await this.lockLines(em, orderId);
      const chosen = lines.filter((l) => dto.line_ids.includes(l.line_id));
      if (chosen.length !== new Set(dto.line_ids).size || chosen.some((l) => !canTransitionLine(l.status, LineStatus.IN_PROGRESS))) {
        throw new ConflictException(ERR.ORDER_INVALID_TRANSITION);
      }
      usedOverride = await this.startLines(em, order, chosen, actor, dto.override);

      await this.access.setOrderStatus(em, orderId, OrderStatus.IN_PROGRESS);
      await this.access.history(em, actor, {
        order_id: orderId,
        event_type: HistoryEventType.STATUS_CHANGE,
        from_status: OrderStatus.IN_QUEUE,
        to_status: OrderStatus.IN_PROGRESS,
        note: dto.override ? `Started with stock override: ${dto.override.reason}` : null,
      });
    });

    this.audit.record(actor, { type: 'order', id: orderId }, usedOverride ? 'START_JOB_CARD_WITH_STOCK_OVERRIDE' : 'START_JOB_CARD', {
      after: usedOverride ? { override_reason: dto.override?.reason } : undefined,
    });
    this.events.changed(actor.branch_id, 'orders', 'stock');
    return this.queries.detail(orderId, actor.branch_id);
  }

  /**
   * Mark Completed: IN_PROGRESS → COMPLETED. Every active sub-job must have started;
   * the ones still in progress are completed with the actor as inspector (BR07).
   */
  async completeCard(orderId: string, dto: CompleteJobCardDto, actor: Actor): Promise<OrderDetail> {
    await this.ds.transaction(async (em) => {
      const order = await this.access.lockOrder(em, orderId, actor.branch_id, OrderType.JOB_CARD);
      if (order.status !== OrderStatus.IN_PROGRESS) throw new ConflictException(ERR.ORDER_INVALID_TRANSITION);
      this.access.assertVersion(order.version, dto.version);
      await this.access.assertChiefMayModify(em, order, actor);

      const lines = (await this.lockLines(em, orderId)).filter((l) => l.status !== LineStatus.CANCELLED);
      if (lines.length === 0 || lines.some((l) => l.status === LineStatus.PENDING || l.status === LineStatus.ASSIGNED)) {
        throw new ConflictException(ERR.ORDER_LINES_NOT_STARTED);
      }
      await this.completeLines(
        em,
        order,
        lines.filter((l) => l.status === LineStatus.IN_PROGRESS),
        actor,
        dto.note,
      );

      await this.access.setOrderStatus(em, orderId, OrderStatus.COMPLETED);
      await this.access.history(em, actor, {
        order_id: orderId,
        event_type: HistoryEventType.STATUS_CHANGE,
        from_status: OrderStatus.IN_PROGRESS,
        to_status: OrderStatus.COMPLETED,
        note: dto.note ?? null,
      });
    });

    this.audit.record(actor, { type: 'order', id: orderId }, 'COMPLETE_JOB_CARD');
    this.events.changed(actor.branch_id, 'orders', 'gate_passes');
    return this.queries.detail(orderId, actor.branch_id);
  }

  /** Starts one sub-job of a card that is already In Progress (Start Job moves the card). */
  async start(lineId: string, dto: StartWorkDto, actor: Actor): Promise<OrderDetail> {
    let orderId = '';
    let usedOverride = false;
    await this.ds.transaction(async (em) => {
      const { line, order } = await this.access.lockLine(em, lineId, actor.branch_id);
      orderId = order.order_id;
      if (order.order_type !== OrderType.JOB_CARD) throw new ConflictException(ERR.ORDER_WRONG_TYPE);
      if (order.status === OrderStatus.DRAFT) throw new ConflictException(ERR.ORDER_NOT_PAID);
      if (order.status === OrderStatus.IN_QUEUE) throw new ConflictException(ERR.ORDER_NOT_STARTED);
      if (order.status !== OrderStatus.IN_PROGRESS) throw new ConflictException(ERR.ORDER_INVALID_TRANSITION);
      this.access.assertVersion(line.version, dto.version);
      if (!canTransitionLine(line.status, LineStatus.IN_PROGRESS)) throw new ConflictException(ERR.ORDER_INVALID_TRANSITION);
      await this.access.assertChiefMayModify(em, order, actor);
      usedOverride = await this.startLines(em, order, [line], actor, dto.override);
    });

    this.audit.record(actor, { type: 'order_line', id: lineId }, usedOverride ? 'START_LINE_WITH_STOCK_OVERRIDE' : 'START_LINE', {
      after: usedOverride ? { override_reason: dto.override?.reason } : undefined,
    });
    this.events.changed(actor.branch_id, 'orders', 'stock');
    return this.queries.detail(orderId, actor.branch_id);
  }

  /** Completes one sub-job after inspection (BR07). The card stays In Progress until Mark Completed. */
  async complete(lineId: string, dto: CompleteWorkDto, actor: Actor): Promise<OrderDetail> {
    let orderId = '';
    await this.ds.transaction(async (em) => {
      const { line, order } = await this.access.lockLine(em, lineId, actor.branch_id);
      orderId = order.order_id;
      if (order.order_type !== OrderType.JOB_CARD) throw new ConflictException(ERR.ORDER_WRONG_TYPE);
      if (order.status !== OrderStatus.IN_PROGRESS) throw new ConflictException(ERR.ORDER_INVALID_TRANSITION);
      this.access.assertVersion(line.version, dto.version);
      if (!canTransitionLine(line.status, LineStatus.COMPLETED)) throw new ConflictException(ERR.ORDER_INVALID_TRANSITION);
      await this.access.assertChiefMayModify(em, order, actor);
      await this.completeLines(em, order, [line], actor, dto.note);
      await em.query(`UPDATE "order" SET version = version + 1, updated_at = now() WHERE order_id = $1`, [order.order_id]);
    });

    this.audit.record(actor, { type: 'order_line', id: lineId }, 'COMPLETE_LINE');
    this.events.changed(actor.branch_id, 'orders', 'gate_passes');
    return this.queries.detail(orderId, actor.branch_id);
  }

  /** The card's lines, locked in line order (the order is already locked: order first, then lines). */
  private async lockLines(em: EntityManager, orderId: string): Promise<OrderLineEntity[]> {
    return em.query(`SELECT * FROM order_line WHERE order_id = $1 ORDER BY line_no FOR UPDATE`, [orderId]);
  }

  /** Deducts branch material for the lines in one call, then marks them started. Returns whether an override was used. */
  private async startLines(em: EntityManager, order: OrderEntity, lines: OrderLineEntity[], actor: Actor, override?: StockOverride): Promise<boolean> {
    const deductions = lines
      .filter((l) => l.item_id && l.material_source === MaterialSource.BRANCH && l.quantity)
      .map((l) => ({ item_id: l.item_id!, quantity: Number(l.quantity), line_id: l.line_id }));
    if (deductions.length) {
      await this.stock.deductMany(em, actor.branch_id, deductions, MovementType.JOB_USAGE, actor, {
        reason: `${order.order_number} · ${lines.map((l) => l.line_number).join(', ')}`,
        override,
      });
    }
    for (const line of lines) {
      await em.query(`UPDATE order_line SET status = 'IN_PROGRESS', version = version + 1 WHERE line_id = $1`, [line.line_id]);
      await this.access.history(em, actor, {
        order_id: order.order_id,
        line_id: line.line_id,
        event_type: HistoryEventType.STATUS_CHANGE,
        from_status: line.status,
        to_status: LineStatus.IN_PROGRESS,
        note: override && deductions.length ? `Started with stock override: ${override.reason}` : null,
      });
    }
    return !!override && deductions.length > 0;
  }

  /** Marks the lines completed (inspection PASS by the actor) and syncs gate passes once every line is done. */
  private async completeLines(em: EntityManager, order: OrderEntity, lines: OrderLineEntity[], actor: Actor, note?: string): Promise<void> {
    for (const line of lines) {
      await em.query(`UPDATE order_line SET status = 'COMPLETED', completed_at = now(), version = version + 1 WHERE line_id = $1`, [line.line_id]);
      await this.access.history(em, actor, {
        order_id: order.order_id,
        line_id: line.line_id,
        event_type: HistoryEventType.INSPECTION,
        result: InspectionResult.PASS,
        note: note ?? null,
      });
      await this.access.history(em, actor, {
        order_id: order.order_id,
        line_id: line.line_id,
        event_type: HistoryEventType.STATUS_CHANGE,
        from_status: line.status,
        to_status: LineStatus.COMPLETED,
      });
    }

    // Once the work is done the customer's material counts as used
    const statuses: { status: LineStatus }[] = await em.query(`SELECT status FROM order_line WHERE order_id = $1`, [order.order_id]);
    if (allActiveLinesCompleted(statuses.map((s) => s.status))) {
      const gatePassIds = await this.allocations.gatePassIdsForOrder(em, order.order_id);
      if (gatePassIds.length) await this.gatePasses.syncStoredStatus(em, gatePassIds, actor.branch_id);
    }
  }
}
