import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import {
  HistoryEventType,
  OrderStatus,
  OrderType,
  PaymentMode,
  jobCardMinAdvance,
  paymentKindFor,
  type BranchSettings,
  type CloseJobCardDto,
  type RecordPaymentDto,
  type SendToWorkshopDto,
} from '@erp/shared';
import type { Actor } from '../../common/actor';
import { ERR, errWith } from '../../common/errors';
import { AuditService } from '../../core/audit.service';
import { BranchContextService } from '../../core/branch-context.service';
import { EventsService } from '../../core/events.service';
import { NumberService } from '../../core/number.service';
import type { OrderEntity } from '../../database/entities/order.entity';
import { LedgerService } from '../ledger/ledger.service';
import { OrderAccessService } from './order-access.service';
import { OrderQueriesService, type OrderDetail } from './order-queries.service';

/**
 * Payments: the payment row, its ledger entries and the order's paid amount are
 * written in one transaction. Payments are never accepted offline (BR18) — the
 * client must be connected to call this.
 */
@Injectable()
export class PaymentsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly access: OrderAccessService,
    private readonly numbers: NumberService,
    private readonly ledger: LedgerService,
    private readonly branches: BranchContextService,
    private readonly queries: OrderQueriesService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  async record(orderId: string, dto: RecordPaymentDto, actor: Actor): Promise<OrderDetail> {
    const duplicate: { order_id: string }[] = await this.ds.query(`SELECT order_id FROM payment WHERE client_request_id = $1`, [
      dto.client_request_id,
    ]);
    if (duplicate[0]) return this.queries.detail(duplicate[0].order_id, actor.branch_id);

    const settings = (await this.branches.get(actor.branch_id)).settings;
    let paymentId = '';
    await this.ds.transaction(async (em) => {
      const order = await this.access.lockOrder(em, orderId, actor.branch_id);
      // Hardware sales are paid in full through /hardware-sales/:id/pay, which also deducts stock
      if (order.order_type === OrderType.HARDWARE_SALE) throw new BadRequestException(ERR.ORDER_WRONG_TYPE);
      if (order.status === OrderStatus.CLOSED || order.status === OrderStatus.VOIDED) {
        throw new ConflictException(ERR.PAYMENT_ORDER_CLOSED);
      }
      paymentId = await this.insertPayment(em, order, dto, settings, actor);

      // BR05: a job card enters the Workshop Queue once the minimum advance is paid
      if (order.order_type === OrderType.JOB_CARD && order.status === OrderStatus.DRAFT) {
        if (order.paid_amount + dto.amount >= (await this.minAdvance(em, orderId))) {
          await this.enterQueue(em, orderId, actor, 'Minimum advance paid — sent to the Workshop Queue');
        }
      }
      // An unpaid roofing order enters the Order Queue once the minimum to place is paid
      if (order.order_type === OrderType.ROOFING_ORDER && order.status === OrderStatus.DRAFT) {
        if (order.paid_amount + dto.amount >= minToPlace(order)) {
          await this.enterQueue(em, orderId, actor, 'Minimum paid — sent to the Order Queue');
        }
      }
      // A completed card paid in full waits for the supervisor's hand-over (Docs/decisions/0005); paying never closes it
    });

    this.audit.record(actor, { type: 'payment', id: paymentId }, 'RECORD_PAYMENT', {
      after: { order_id: orderId, amount: dto.amount, mode: dto.mode },
    });
    this.events.changed(actor.branch_id, 'orders', 'payments');
    return this.queries.detail(orderId, actor.branch_id);
  }

  /**
   * Every new job card waits at the cashier (Docs/decisions/0005). With nothing due (a Rs 0
   * minimum advance) the cashier sends it on without taking money.
   */
  async sendToWorkshop(orderId: string, dto: SendToWorkshopDto, actor: Actor): Promise<OrderDetail> {
    await this.ds.transaction(async (em) => {
      const order = await this.access.lockOrder(em, orderId, actor.branch_id, OrderType.JOB_CARD);
      this.access.assertVersion(order.version, dto.version);
      if (order.status !== OrderStatus.DRAFT) throw new ConflictException(ERR.ORDER_INVALID_TRANSITION);
      if (order.paid_amount < (await this.minAdvance(em, orderId))) throw new ConflictException(ERR.ORDER_NOT_PAID);
      await this.enterQueue(em, orderId, actor, 'No advance required — sent to the Workshop Queue by the cashier');
    });
    this.events.changed(actor.branch_id, 'orders');
    return this.queries.detail(orderId, actor.branch_id);
  }

  /** The same for an unpaid roofing order whose branch minimum to place is Rs 0 (or already paid). */
  async sendToOrderQueue(orderId: string, dto: SendToWorkshopDto, actor: Actor): Promise<OrderDetail> {
    await this.ds.transaction(async (em) => {
      const order = await this.access.lockOrder(em, orderId, actor.branch_id, OrderType.ROOFING_ORDER);
      this.access.assertVersion(order.version, dto.version);
      if (order.status !== OrderStatus.DRAFT) throw new ConflictException(ERR.ORDER_INVALID_TRANSITION);
      if (order.paid_amount < minToPlace(order)) throw new ConflictException(ERR.ORDER_NOT_PAID);
      await this.enterQueue(em, orderId, actor, 'No payment required — sent to the Order Queue by the cashier');
    });
    this.events.changed(actor.branch_id, 'orders');
    return this.queries.detail(orderId, actor.branch_id);
  }

  /** The sum of the sub-job advances saved with the card (Docs/decisions/0010). */
  private async minAdvance(em: EntityManager, orderId: string): Promise<number> {
    const lines: { advance: number }[] = await em.query(
      `SELECT suggested_advance AS advance FROM order_line WHERE order_id = $1 AND status <> 'CANCELLED'`,
      [orderId],
    );
    return jobCardMinAdvance(lines);
  }

  /** DRAFT → IN_QUEUE: the order leaves the cashier for the Workshop or Order Queue. */
  private async enterQueue(em: EntityManager, orderId: string, actor: Actor, note: string): Promise<void> {
    await this.access.setOrderStatus(em, orderId, OrderStatus.IN_QUEUE);
    await this.access.history(em, actor, {
      order_id: orderId,
      event_type: HistoryEventType.STATUS_CHANGE,
      from_status: OrderStatus.DRAFT,
      to_status: OrderStatus.IN_QUEUE,
      note,
    });
  }

  /** Check & Hand Over (supervisor): a completed job card with nothing owed becomes CLOSED (Docs/decisions/0005). */
  async close(orderId: string, dto: CloseJobCardDto, actor: Actor): Promise<OrderDetail> {
    await this.ds.transaction(async (em) => {
      const order = await this.access.lockOrder(em, orderId, actor.branch_id, OrderType.JOB_CARD);
      this.access.assertVersion(order.version, dto.version);
      await this.closeLocked(em, order, dto, actor);
    });
    this.audit.record(actor, { type: 'order', id: orderId }, 'CLOSE_JOB_CARD', { after: { released_to: dto.released_to ?? null } });
    this.events.changed(actor.branch_id, 'orders');
    return this.queries.detail(orderId, actor.branch_id);
  }

  /** Closes a locked job card. Paid amount is re-read so a payment earlier in the transaction counts. */
  private async closeLocked(em: EntityManager, order: OrderEntity, dto: { released_to?: string; notes?: string }, actor: Actor): Promise<void> {
    if (order.status !== OrderStatus.COMPLETED) throw new ConflictException(ERR.ORDER_INVALID_TRANSITION);
    const [{ total, paid_amount }]: { total: number; paid_amount: number }[] = await em.query(`SELECT total, paid_amount FROM "order" WHERE order_id = $1`, [
      order.order_id,
    ]);
    if (paid_amount < total) throw new ConflictException(errWith(ERR.ORDER_BALANCE_DUE, { balance: total - paid_amount }));
    await em.query(
      `UPDATE "order" SET status = 'CLOSED', released_to = $2, released_by = $3, released_at = now(), release_notes = $4,
              version = version + 1, updated_at = now()
       WHERE order_id = $1`,
      [order.order_id, dto.released_to?.trim() || null, actor.user_id, dto.notes?.trim() || null],
    );
    await this.access.history(em, actor, {
      order_id: order.order_id,
      event_type: HistoryEventType.STATUS_CHANGE,
      from_status: OrderStatus.COMPLETED,
      to_status: OrderStatus.CLOSED,
      note: dto.released_to?.trim() ? `Handed over to ${dto.released_to.trim()}${dto.notes?.trim() ? ` · ${dto.notes.trim()}` : ''}` : (dto.notes?.trim() ?? null),
    });
  }

  /**
   * Validates and writes one payment against a locked order (also used when a
   * roofing order is placed with its first payment).
   */
  async insertPayment(
    em: EntityManager,
    order: Pick<OrderEntity, 'order_id' | 'total' | 'paid_amount'> & { order_type?: OrderType },
    dto: { client_request_id?: string; amount: number; mode: PaymentMode; reference?: string },
    settings: BranchSettings,
    actor: Actor,
  ): Promise<string> {
    const balance = order.total - order.paid_amount;
    if (dto.amount <= 0) throw new BadRequestException(ERR.PAYMENT_BELOW_MINIMUM);
    if (dto.amount > balance) throw new BadRequestException(errWith(ERR.PAYMENT_ABOVE_BALANCE, { balance }));
    if (!settings.general.payment_modes.includes(dto.mode)) throw new BadRequestException(ERR.PAYMENT_MODE_NOT_ALLOWED);
    if (dto.mode !== PaymentMode.CASH && settings.general.require_payment_reference && !dto.reference?.trim()) {
      throw new BadRequestException(ERR.PAYMENT_REFERENCE_REQUIRED);
    }

    const receiptNo = await this.numbers.next(em, 'RECEIPT', settings.number_prefixes);
    const kind = paymentKindFor(order.paid_amount, dto.amount, order.total);
    const [{ payment_id }]: { payment_id: string }[] = await em.query(
      `INSERT INTO payment (order_id, kind, mode, amount, reference_number, receipt_no, received_by, received_branch_id, client_request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING payment_id`,
      [order.order_id, kind, dto.mode, dto.amount, dto.reference?.trim() || null, receiptNo, actor.user_id, actor.branch_id, dto.client_request_id ?? null],
    );
    await this.ledger.recordPayment({ payment_id, order_id: order.order_id, amount: dto.amount, kind, order_type: order.order_type }, actor, em);
    await em.query(`UPDATE "order" SET paid_amount = paid_amount + $2, version = version + 1, updated_at = now() WHERE order_id = $1`, [
      order.order_id,
      dto.amount,
    ]);
    return payment_id;
  }
}

/** The minimum fixed when an unpaid roofing order was submitted (header.min_to_place). */
const minToPlace = (order: Pick<OrderEntity, 'header'>) => Number(order.header?.min_to_place ?? 0);
