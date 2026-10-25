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
  type RecordPaymentDto,
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
      if (order.status === OrderStatus.CLOSED || order.status === OrderStatus.VOIDED) {
        throw new ConflictException(ERR.PAYMENT_ORDER_CLOSED);
      }
      paymentId = await this.insertPayment(em, order, dto, settings, actor);

      // BR05: a job card enters the Workshop Queue once the minimum advance is paid
      if (order.order_type === OrderType.JOB_CARD && order.status === OrderStatus.DRAFT) {
        const lines: { line_total: number; is_customized: boolean }[] = await em.query(
          `SELECT line_total, is_customized FROM order_line WHERE order_id = $1 AND status <> 'CANCELLED'`,
          [orderId],
        );
        if (order.paid_amount + dto.amount >= jobCardMinAdvance(lines, settings)) {
          await this.access.setOrderStatus(em, orderId, OrderStatus.IN_QUEUE);
          await this.access.history(em, actor, {
            order_id: orderId,
            event_type: HistoryEventType.STATUS_CHANGE,
            from_status: OrderStatus.DRAFT,
            to_status: OrderStatus.IN_QUEUE,
            note: 'Minimum advance paid — sent to the Workshop Queue',
          });
        }
      }
    });

    this.audit.record(actor, { type: 'payment', id: paymentId }, 'RECORD_PAYMENT', {
      after: { order_id: orderId, amount: dto.amount, mode: dto.mode },
    });
    this.events.changed(actor.branch_id, 'orders', 'payments');
    return this.queries.detail(orderId, actor.branch_id);
  }

  /**
   * Validates and writes one payment against a locked order (also used when a
   * roofing order is placed with its first payment).
   */
  async insertPayment(
    em: EntityManager,
    order: Pick<OrderEntity, 'order_id' | 'total' | 'paid_amount'>,
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
      `INSERT INTO payment (order_id, kind, mode, amount, reference_number, receipt_no, received_by, client_request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING payment_id`,
      [order.order_id, kind, dto.mode, dto.amount, dto.reference?.trim() || null, receiptNo, actor.user_id, dto.client_request_id ?? null],
    );
    await this.ledger.recordPayment({ payment_id, order_id: order.order_id, amount: dto.amount, kind }, actor, em);
    await em.query(`UPDATE "order" SET paid_amount = paid_amount + $2, version = version + 1, updated_at = now() WHERE order_id = $1`, [
      order.order_id,
      dto.amount,
    ]);
    return payment_id;
  }
}
