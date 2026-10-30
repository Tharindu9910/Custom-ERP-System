import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import {
  HistoryEventType,
  LineStatus,
  MovementType,
  OrderStatus,
  OrderType,
  Role,
  canTransitionHardware,
  canTransitionHardwareLine,
  formatRs,
  hardwareAdvanceRange,
  hardwareLineTotal,
  type CancelHardwareSaleDto,
  type CreateHardwareSaleDto,
  type PayHardwareSaleDto,
} from '@erp/shared';
import type { Actor } from '../../common/actor';
import { ERR, errWith } from '../../common/errors';
import { AuditService } from '../../core/audit.service';
import { BranchContextService } from '../../core/branch-context.service';
import { EventsService } from '../../core/events.service';
import { NumberService } from '../../core/number.service';
import { RolePermissionsService } from '../../core/role-permissions.service';
import { StockService } from '../../core/stock.service';
import type { OrderEntity } from '../../database/entities/order.entity';
import { CustomersService } from '../customers/customers.service';
import { LedgerService } from '../ledger/ledger.service';
import { OrderAccessService } from '../orders/order-access.service';
import { OrderQueriesService, type OrderDetail } from '../orders/order-queries.service';
import { PaymentsService } from '../orders/payments.service';
import { HardwareQueriesService } from './hardware-queries.service';

/** Money columns are INT cents; a bigger total must be refused, not overflow in Postgres. */
const MAX_CENTS = 2_147_483_647;

interface PricedLine {
  item_id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

/**
 * Hardware sales (Docs/decisions/0006). Three ways to place an order, decided here
 * from what is sent and what the user may do — never from the client's say-so:
 *
 *   own branch, no payment     → Awaiting Payment (supervisor sends it to the cashier)
 *   own branch, full payment   → Paid in one transaction (cashier counter sale)
 *   other branch, advance only → owned by that branch, Awaiting Payment of the balance
 *
 * Stock is held when the order is placed and deducted when it is paid in full
 * (Docs/decisions/0003). Every write is one transaction; audit and live nudges follow
 * the commit.
 */
@Injectable()
export class HardwareSalesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly access: OrderAccessService,
    private readonly payments: PaymentsService,
    private readonly queries: OrderQueriesService,
    private readonly hardware: HardwareQueriesService,
    private readonly customers: CustomersService,
    private readonly ledger: LedgerService,
    private readonly stock: StockService,
    private readonly numbers: NumberService,
    private readonly branches: BranchContextService,
    private readonly rolePermissions: RolePermissionsService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  async create(dto: CreateHardwareSaleDto, actor: Actor): Promise<OrderDetail> {
    const existing = await this.findPlaced(dto.client_request_id, actor.branch_id);
    if (existing) return this.queries.detail(existing.order_id, existing.branch_id);

    const targetId = dto.branch_id ?? actor.branch_id;
    const crossBranch = targetId !== actor.branch_id;
    const payment = dto.payment;

    // Who may do what is checked before anything is written
    if (payment && !(await this.may(actor, 'process:payment'))) throw new ForbiddenException(ERR.HARDWARE_PAYMENT_DENIED);
    if (crossBranch) {
      const allowed = await this.hardware.sellableBranches(actor);
      if (!allowed.some((b) => b.branch_id === targetId)) {
        throw new ForbiddenException((await this.hardware.mayOrderCrossBranch(actor)) ? ERR.HARDWARE_BRANCH_UNAVAILABLE : ERR.HARDWARE_CROSS_BRANCH_DENIED);
      }
      if (!payment) throw new BadRequestException(ERR.HARDWARE_ADVANCE_RANGE);
    }

    const [target, here] = await Promise.all([this.branches.get(targetId), this.branches.get(actor.branch_id)]);
    let closed = false;
    let paymentId: string | null = null;

    const orderId = await this.placeOnce(dto.client_request_id, actor.branch_id, () => this.ds.transaction(async (em) => {
      const lines = await this.price(em, dto.lines);
      const total = lines.reduce((s, l) => s + l.line_total, 0);
      if (total <= 0) throw new BadRequestException(ERR.HARDWARE_ITEM_INVALID);

      if (payment && crossBranch) {
        const range = hardwareAdvanceRange(total, target.settings.orders.hardware_remote_min_advance_pct);
        if (payment.amount < range.min || payment.amount > range.max) {
          throw new BadRequestException(
            errWith(ERR.HARDWARE_ADVANCE_RANGE, range, `Take an advance between ${formatRs(range.min)} and ${formatRs(range.max)} — the balance is collected at ${target.name}`),
          );
        }
      }
      if (payment && !crossBranch && payment.amount !== total) {
        throw new BadRequestException(errWith(ERR.HARDWARE_PAYMENT_NOT_FULL, { balance: total }));
      }

      const customerId = dto.customer ? await this.customers.findOrCreateForIntake(em, dto.customer, actor.branch_id, actor.user_id) : null;
      const orderNumber = await this.numbers.next(em, 'HARDWARE_SALE', target.settings.number_prefixes);
      const header = dto.notes?.trim() ? { notes: dto.notes.trim() } : {};
      const [order]: Pick<OrderEntity, 'order_id' | 'total' | 'paid_amount' | 'order_type' | 'status' | 'branch_id'>[] = await em.query(
        `INSERT INTO "order" (branch_id, origin_branch_id, customer_id, order_type, section_type, service_type, order_number, status,
                              subtotal, discount, total, header, created_by, actor_role_at_creation, client_request_id)
         VALUES ($1, $2, $3, 'HARDWARE_SALE', 'HARDWARE', 'BUY_MATERIALS', $4, 'IN_QUEUE', $5, 0, $5, $6::jsonb, $7, $8, $9)
         RETURNING order_id, total, paid_amount, order_type, status, branch_id`,
        [targetId, crossBranch ? actor.branch_id : null, customerId, orderNumber, total, JSON.stringify(header), actor.user_id, actor.role, dto.client_request_id],
      );

      const holds: { item_id: string; quantity: number; line_id: string }[] = [];
      for (const [i, l] of lines.entries()) {
        const lineNumber = await this.numbers.next(em, 'ORDER_LINE', target.settings.number_prefixes);
        const [{ line_id }]: { line_id: string }[] = await em.query(
          `INSERT INTO order_line (order_id, line_number, line_no, line_type, status, material_source, item_id, quantity,
                                   price_basis, unit_price, line_total, created_by, actor_role_at_creation)
           VALUES ($1, $2, $3, 'HARDWARE', 'PENDING', 'BRANCH', $4, $5, 'PER_PIECE', $6, $7, $8, $9)
           RETURNING line_id`,
          [order.order_id, lineNumber, i + 1, l.item_id, l.quantity, l.unit_price, l.line_total, actor.user_id, actor.role],
        );
        holds.push({ item_id: l.item_id, quantity: l.quantity, line_id });
      }
      // Held at the branch that has the goods; no override — the store only sells what is free
      await this.stock.reserveMany(em, targetId, order.order_id, holds, actor);

      await this.access.history(em, actor, {
        order_id: order.order_id,
        event_type: HistoryEventType.STATUS_CHANGE,
        to_status: OrderStatus.IN_QUEUE,
        note: crossBranch ? `Placed at ${here.name} — balance collected at ${target.name}` : 'Hardware order placed',
      });

      if (payment) {
        // Money is taken here, so this branch's payment rules apply and the receipt is recorded against it
        paymentId = await this.payments.insertPayment(em, order, { ...payment, client_request_id: dto.client_request_id }, here.settings, actor);
        if (!crossBranch) {
          await this.closeLocked(em, order, actor);
          closed = true;
        }
      }
      return order.order_id;
    }));
    if (typeof orderId !== 'string') return this.queries.detail(orderId.order_id, orderId.branch_id);

    this.audit.record(actor, { type: 'order', id: orderId, version: 1 }, 'PLACE_HARDWARE_SALE', {
      after: { branch_id: targetId, origin_branch_id: crossBranch ? actor.branch_id : null, lines: dto.lines.length, payment: payment?.amount ?? 0 },
    });
    if (paymentId) {
      this.audit.record(actor, { type: 'payment', id: paymentId }, 'RECORD_PAYMENT', { after: { order_id: orderId, amount: payment!.amount, mode: payment!.mode } });
    }
    if (closed) this.audit.record(actor, { type: 'order', id: orderId }, 'PAY_HARDWARE_SALE', { after: { amount: payment!.amount } });
    this.events.changed(targetId, 'orders', 'stock', ...(payment ? (['payments'] as const) : []));
    if (crossBranch) this.events.changed(actor.branch_id, 'payments');
    return this.queries.detail(orderId, targetId);
  }

  /** Collect the balance at the branch that owns the order; the sale completes and stock leaves. */
  async pay(orderId: string, dto: PayHardwareSaleDto, actor: Actor): Promise<OrderDetail> {
    const duplicate: { order_id: string }[] = await this.ds.query(`SELECT order_id FROM payment WHERE client_request_id = $1`, [dto.client_request_id]);
    if (duplicate[0]) return this.queries.detail(duplicate[0].order_id, actor.branch_id);

    const settings = (await this.branches.get(actor.branch_id)).settings;
    let paymentId = '';
    await this.ds.transaction(async (em) => {
      const order = await this.access.lockOrder(em, orderId, actor.branch_id, OrderType.HARDWARE_SALE);
      this.access.assertVersion(order.version, dto.version);
      if (!canTransitionHardware(order.status, OrderStatus.CLOSED)) throw new ConflictException(ERR.ORDER_INVALID_TRANSITION);
      const balance = order.total - order.paid_amount;
      if (dto.amount !== balance) throw new BadRequestException(errWith(ERR.HARDWARE_PAYMENT_NOT_FULL, { balance }));

      paymentId = await this.payments.insertPayment(em, order, dto, settings, actor);
      await this.closeLocked(em, order, actor);
    });

    this.audit.record(actor, { type: 'payment', id: paymentId }, 'RECORD_PAYMENT', { after: { order_id: orderId, amount: dto.amount, mode: dto.mode } });
    this.audit.record(actor, { type: 'order', id: orderId, version: dto.version }, 'PAY_HARDWARE_SALE', { after: { amount: dto.amount } });
    this.events.changed(actor.branch_id, 'orders', 'payments', 'stock');
    return this.queries.detail(orderId, actor.branch_id);
  }

  /**
   * Cancel an order still awaiting payment: held stock is freed. An advance already
   * taken is not refunded (RULE 17 / BR16) — it is recorded as a loss at the branch
   * that received it.
   */
  async cancel(orderId: string, dto: CancelHardwareSaleDto, actor: Actor): Promise<OrderDetail> {
    let originBranch: string | null = null;
    await this.ds.transaction(async (em) => {
      const order = await this.access.lockOrder(em, orderId, actor.branch_id, OrderType.HARDWARE_SALE);
      this.access.assertVersion(order.version, dto.version);
      if (!canTransitionHardware(order.status, OrderStatus.VOIDED)) throw new ConflictException(ERR.ORDER_INVALID_TRANSITION);
      originBranch = order.origin_branch_id;

      await this.stock.releaseForOrder(em, orderId, `Hardware order cancelled: ${dto.reason}`);
      await this.setLines(em, orderId, LineStatus.CANCELLED);
      await em.query(
        `UPDATE "order" SET status = 'VOIDED', header = header || jsonb_build_object('cancel_reason', $2::text),
                version = version + 1, updated_at = now()
         WHERE order_id = $1`,
        [orderId, dto.reason],
      );

      const paid: { payment_id: string; amount: number; received_branch_id: string }[] = await em.query(
        `SELECT payment_id, amount, received_branch_id FROM payment WHERE order_id = $1 AND status = 'COMPLETED' AND kind <> 'REVERSAL'`,
        [orderId],
      );
      for (const p of paid) {
        await this.ledger.recordCancellationLoss({ payment_id: p.payment_id, order_id: orderId, amount: p.amount }, { ...actor, branch_id: p.received_branch_id }, em);
      }

      await this.access.history(em, actor, {
        order_id: orderId,
        event_type: HistoryEventType.STATUS_CHANGE,
        from_status: order.status,
        to_status: OrderStatus.VOIDED,
        note: paid.length > 0 ? `Cancelled: ${dto.reason} (advance of ${formatRs(paid.reduce((s, p) => s + p.amount, 0))} not refunded)` : `Cancelled: ${dto.reason}`,
      });
    });

    this.audit.record(actor, { type: 'order', id: orderId, version: dto.version }, 'CANCEL_HARDWARE_SALE', { after: { reason: dto.reason } });
    this.events.changed(actor.branch_id, 'orders', 'stock');
    if (originBranch) this.events.changed(originBranch, 'payments');
    return this.queries.detail(orderId, actor.branch_id);
  }

  /** Fully paid: deduct the held stock, hand the lines over and close. Runs inside the caller's transaction. */
  private async closeLocked(em: EntityManager, order: Pick<OrderEntity, 'order_id' | 'status' | 'branch_id'>, actor: Actor): Promise<void> {
    const [{ total, paid_amount }]: { total: number; paid_amount: number }[] = await em.query(`SELECT total, paid_amount FROM "order" WHERE order_id = $1`, [
      order.order_id,
    ]);
    if (paid_amount < total) throw new ConflictException(errWith(ERR.HARDWARE_PAYMENT_NOT_FULL, { balance: total - paid_amount }));

    const lines: { line_id: string; item_id: string; quantity: string }[] = await em.query(
      `SELECT line_id, item_id, quantity FROM order_line WHERE order_id = $1 AND status <> 'CANCELLED' ORDER BY line_no FOR UPDATE`,
      [order.order_id],
    );
    await this.stock.deductMany(
      em,
      order.branch_id,
      lines.map((l) => ({ item_id: l.item_id, quantity: Number(l.quantity), line_id: l.line_id })),
      MovementType.SALE,
      actor,
      { reason: 'Hardware sale' },
    );
    await this.setLines(em, order.order_id, LineStatus.COMPLETED);
    await em.query(
      `UPDATE "order" SET status = 'CLOSED', released_by = $2, released_at = now(), version = version + 1, updated_at = now() WHERE order_id = $1`,
      [order.order_id, actor.user_id],
    );
    await this.access.history(em, actor, {
      order_id: order.order_id,
      event_type: HistoryEventType.STATUS_CHANGE,
      from_status: order.status,
      to_status: OrderStatus.CLOSED,
      note: 'Paid in full — goods handed over',
    });
  }

  /** Every open line moves together; the transition table is the only gate (RULE 12). */
  private async setLines(em: EntityManager, orderId: string, to: LineStatus): Promise<void> {
    const lines: { line_id: string; status: LineStatus }[] = await em.query(
      `SELECT line_id, status FROM order_line WHERE order_id = $1 AND status <> 'CANCELLED'`,
      [orderId],
    );
    if (lines.some((l) => !canTransitionHardwareLine(l.status, to))) throw new ConflictException(ERR.ORDER_INVALID_TRANSITION);
    await em.query(
      `UPDATE order_line SET status = $2::line_status_enum, completed_at = CASE WHEN $3::boolean THEN now() ELSE completed_at END, version = version + 1
       WHERE order_id = $1 AND status <> 'CANCELLED'`,
      [orderId, to, to === LineStatus.COMPLETED],
    );
  }

  /** Server-side pricing from the catalogue; the client never sends a price. */
  private async price(em: EntityManager, input: CreateHardwareSaleDto['lines']): Promise<PricedLine[]> {
    const items: { item_id: string; price: number }[] = await em.query(
      `SELECT item_id, price FROM item WHERE item_id = ANY($1::uuid[]) AND item_type = 'HARDWARE' AND is_active = true AND price > 0`,
      [input.map((l) => l.item_id)],
    );
    const byId = new Map(items.map((i) => [i.item_id, i.price]));
    const missing = input.filter((l) => !byId.has(l.item_id)).map((l) => l.item_id);
    if (missing.length > 0) throw new BadRequestException(errWith(ERR.HARDWARE_ITEM_INVALID, { item_ids: missing }));
    const lines = input.map((l) => {
      const unit_price = byId.get(l.item_id)!;
      return { item_id: l.item_id, quantity: l.quantity, unit_price, line_total: hardwareLineTotal(unit_price, l.quantity) };
    });
    if (lines.reduce((s, l) => s + l.line_total, 0) > MAX_CENTS) {
      throw new BadRequestException(errWith(ERR.VALIDATION_FAILED, { max_total: MAX_CENTS }, 'The order total is too large — split it into smaller orders'));
    }
    return lines;
  }

  /**
   * Two taps racing past the first idempotency check: the unique client_request_id makes
   * the second insert fail, and that request answers with the order the first one made.
   */
  private async placeOnce(
    requestId: string,
    branchId: string,
    run: () => Promise<string>,
  ): Promise<string | { order_id: string; branch_id: string }> {
    try {
      return await run();
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        const placed = await this.findPlaced(requestId, branchId);
        if (placed) return placed;
      }
      throw e;
    }
  }

  /** A retried create returns the order it already made — found from either end of a cross-branch order. */
  private async findPlaced(requestId: string, branchId: string): Promise<{ order_id: string; branch_id: string } | null> {
    const rows: { order_id: string; branch_id: string }[] = await this.ds.query(
      `SELECT order_id, branch_id FROM "order" WHERE client_request_id = $1 AND (branch_id = $2 OR origin_branch_id = $2)`,
      [requestId, branchId],
    );
    return rows[0] ?? null;
  }

  private async may(actor: Actor, action: string): Promise<boolean> {
    return actor.role === Role.SUPER_ADMIN || this.rolePermissions.has(actor.role, action);
  }
}
