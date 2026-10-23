import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
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
  type CompleteWorkDto,
  type StartWorkDto,
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

/** Workshop floor actions on a single job card line (sub-job). */
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
   * Starts a line. Only paid job cards are in the queue (BR05). Branch material for
   * Cut/Bend is deducted now (BR10); not enough stock returns 409 with
   * override_allowed, and a valid override is recorded and audited.
   */
  async start(lineId: string, dto: StartWorkDto, actor: Actor): Promise<OrderDetail> {
    let orderId = '';
    let usedOverride = false;
    await this.ds.transaction(async (em) => {
      const { line, order } = await this.access.lockLine(em, lineId, actor.branch_id);
      orderId = order.order_id;
      if (order.order_type !== OrderType.JOB_CARD) throw new ConflictException(ERR.ORDER_WRONG_TYPE);
      if (order.status === OrderStatus.DRAFT) throw new ConflictException(ERR.ORDER_NOT_PAID);
      if (order.status !== OrderStatus.IN_QUEUE && order.status !== OrderStatus.IN_PROGRESS) {
        throw new ConflictException(ERR.ORDER_INVALID_TRANSITION);
      }
      this.access.assertVersion(line.version, dto.version);
      if (!canTransitionLine(line.status, LineStatus.IN_PROGRESS)) throw new ConflictException(ERR.ORDER_INVALID_TRANSITION);
      await this.access.assertChiefMayModify(em, order, actor);

      if (line.item_id && line.material_source === MaterialSource.BRANCH && line.quantity) {
        usedOverride = !!dto.override;
        await this.stock.deductMany(
          em,
          actor.branch_id,
          [{ item_id: line.item_id, quantity: Number(line.quantity), line_id: line.line_id }],
          MovementType.JOB_USAGE,
          actor,
          { reason: `${order.order_number} · ${line.line_number}`, override: dto.override },
        );
      }

      await em.query(`UPDATE order_line SET status = 'IN_PROGRESS', version = version + 1 WHERE line_id = $1`, [lineId]);
      await this.access.history(em, actor, {
        order_id: order.order_id,
        line_id: lineId,
        event_type: HistoryEventType.STATUS_CHANGE,
        from_status: line.status,
        to_status: LineStatus.IN_PROGRESS,
        note: dto.override ? `Started with stock override: ${dto.override.reason}` : null,
      });
      if (order.status === OrderStatus.IN_QUEUE) {
        await this.access.setOrderStatus(em, order.order_id, OrderStatus.IN_PROGRESS);
        await this.access.history(em, actor, {
          order_id: order.order_id,
          event_type: HistoryEventType.STATUS_CHANGE,
          from_status: OrderStatus.IN_QUEUE,
          to_status: OrderStatus.IN_PROGRESS,
        });
      }
    });

    this.audit.record(actor, { type: 'order_line', id: lineId }, usedOverride ? 'START_LINE_WITH_STOCK_OVERRIDE' : 'START_LINE', {
      after: usedOverride ? { override_reason: dto.override?.reason } : undefined,
    });
    this.events.changed(actor.branch_id, 'orders', 'stock');
    return this.queries.detail(orderId, actor.branch_id);
  }

  /** Completes a line after inspection; the actor is recorded as inspector (BR07). */
  async complete(lineId: string, dto: CompleteWorkDto, actor: Actor): Promise<OrderDetail> {
    let orderId = '';
    await this.ds.transaction(async (em) => {
      const { line, order } = await this.access.lockLine(em, lineId, actor.branch_id);
      orderId = order.order_id;
      if (order.order_type !== OrderType.JOB_CARD) throw new ConflictException(ERR.ORDER_WRONG_TYPE);
      this.access.assertVersion(line.version, dto.version);
      if (!canTransitionLine(line.status, LineStatus.COMPLETED)) throw new ConflictException(ERR.ORDER_INVALID_TRANSITION);
      await this.access.assertChiefMayModify(em, order, actor);

      await em.query(`UPDATE order_line SET status = 'COMPLETED', completed_at = now(), version = version + 1 WHERE line_id = $1`, [lineId]);
      await em.query(`UPDATE "order" SET version = version + 1, updated_at = now() WHERE order_id = $1`, [order.order_id]);
      await this.access.history(em, actor, {
        order_id: order.order_id,
        line_id: lineId,
        event_type: HistoryEventType.INSPECTION,
        result: InspectionResult.PASS,
        note: dto.note ?? null,
      });
      await this.access.history(em, actor, {
        order_id: order.order_id,
        line_id: lineId,
        event_type: HistoryEventType.STATUS_CHANGE,
        from_status: line.status,
        to_status: LineStatus.COMPLETED,
      });

      // Once the work is done the customer's material counts as used
      const statuses: { status: LineStatus }[] = await em.query(`SELECT status FROM order_line WHERE order_id = $1`, [order.order_id]);
      if (allActiveLinesCompleted(statuses.map((s) => s.status))) {
        const gatePassIds = await this.allocations.gatePassIdsForOrder(em, order.order_id);
        if (gatePassIds.length) await this.gatePasses.syncStoredStatus(em, gatePassIds, actor.branch_id);
      }
    });

    this.audit.record(actor, { type: 'order_line', id: lineId }, 'COMPLETE_LINE');
    this.events.changed(actor.branch_id, 'orders', 'gate_passes');
    return this.queries.detail(orderId, actor.branch_id);
  }
}
