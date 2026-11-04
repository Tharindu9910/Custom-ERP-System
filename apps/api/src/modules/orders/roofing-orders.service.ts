import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
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
  formatRs,
  lineDeductsCoil,
  lineHasStarted,
  normalizeRoofingLine,
  priceRoofingLine,
  roofingAdvanceEditable,
  roofingLineAdvance,
  roofingTotals,
  suggestedRoofingAdvance,
  toBranchDate,
  validateRoofingLine,
  type BranchSettings,
  type CompleteWorkDto,
  type CreateRoofingOrderDto,
  type PricedRoofingLine,
  type QuoteRoofingDto,
  type ReleaseOrderDto,
  type RoofingLineInput,
  type StartWorkDto,
  type UpdateRoofingOrderDto,
} from '@erp/shared';
import type { Actor } from '../../common/actor';
import { replayOnDuplicate } from '../../common/idempotency';
import { ERR, errWith } from '../../common/errors';
import { AuditService } from '../../core/audit.service';
import { BranchContextService } from '../../core/branch-context.service';
import { EventsService } from '../../core/events.service';
import { NumberService } from '../../core/number.service';
import { RolePermissionsService } from '../../core/role-permissions.service';
import { StockService, type StockReservationInput } from '../../core/stock.service';
import type { OrderEntity } from '../../database/entities/order.entity';
import type { OrderLineEntity } from '../../database/entities/order-line.entity';
import { AttachmentsService } from '../attachments/attachments.service';
import { CustomersService } from '../customers/customers.service';
import { AllocationsService } from '../gate-passes/allocations.service';
import { GatePassesService } from '../gate-passes/gate-passes.service';
import { ItemsService, type CoilOption } from '../items/items.service';
import { customerMaterialLine, withoutOrderMaterial, type CustomerMaterialLine } from './customer-material';
import { OrderAccessService } from './order-access.service';
import { OrderQueriesService, type OrderDetail } from './order-queries.service';
import { PaymentsService } from './payments.service';
import { PricingService } from './pricing.service';

interface PreparedLine {
  input: RoofingLineInput;
  priced: PricedRoofingLine;
  /** Coil deducted on start (BR10), null when nothing is deducted */
  item_id: string | null;
  coil: CoilOption | null;
  /** The item's advance and its suggestion (Docs/decisions/0011) */
  advance: number;
  suggested_advance: number;
}

interface Prepared {
  lines: PreparedLine[];
  orderCoilId: string | null;
  subtotal: number;
  discount: number;
  max_discount: number;
  total: number;
  min_to_place: number;
}

/**
 * Roofing orders (Create Order / Order Queue). One order per customer visit, one
 * line per item. The cashier places an order with its first payment; anyone else
 * submits it unpaid (DRAFT) and it waits on the Cashier Queue until the minimum is paid,
 * like a job card. Started, completed and released by the floor; edited or cancelled
 * before work starts.
 */
@Injectable()
export class RoofingOrdersService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly access: OrderAccessService,
    private readonly pricing: PricingService,
    private readonly numbers: NumberService,
    private readonly customers: CustomersService,
    private readonly allocations: AllocationsService,
    private readonly gatePasses: GatePassesService,
    private readonly items: ItemsService,
    private readonly attachments: AttachmentsService,
    private readonly payments: PaymentsService,
    private readonly stock: StockService,
    private readonly branches: BranchContextService,
    private readonly queries: OrderQueriesService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly rolePermissions: RolePermissionsService,
  ) {}

  /** Live price preview for the form — the same pricing the save uses. Incomplete items are priced as far as possible. */
  async quote(dto: QuoteRoofingDto, actor: Actor) {
    const settings = (await this.branches.get(actor.branch_id)).settings;
    const p = await this.prepare(this.ds.manager, dto.lines, dto.global_coil_item_id, dto.discount, settings, actor.branch_id, false);
    return {
      lines: p.lines.map((l) => ({
        ...l.priced,
        suggested_advance: l.suggested_advance,
        advance: l.advance,
        advance_editable: roofingAdvanceEditable(l.input),
      })),
      subtotal: p.subtotal,
      discount: p.discount,
      max_discount: p.max_discount,
      total: p.total,
      min_to_place: p.min_to_place,
      missing_rates: p.lines.flatMap((l, i) => (l.priced.missing_rate ? [{ line_index: i, missing: l.priced.missing_rate }] : [])),
    };
  }

  async create(dto: CreateRoofingOrderDto, actor: Actor): Promise<OrderDetail> {
    const existing = await this.queries.findByRequestId(dto.client_request_id, actor.branch_id);
    if (existing) return this.queries.detail(existing, actor.branch_id);

    const settings = (await this.branches.get(actor.branch_id)).settings;
    this.checkMaterialRules(dto, settings);
    // Using a gate pass on an order is its own permission (RO-08)
    if (dto.lines.some((l) => l.material_source === MaterialSource.CUSTOMER && l.customer_material)) await this.assertMayAllocateGatePass(actor);
    // Only the cashier takes money and gives discounts; others submit the order to the Cashier Queue
    const cashier = await this.isCashier(actor);
    if (dto.payment && !cashier) throw new ForbiddenException(ERR.ORDER_PAYMENT_DENIED);
    if (dto.discount > 0 && !cashier) throw new ForbiddenException(ERR.ORDER_DISCOUNT_DENIED);
    const payment = dto.payment;
    const status = payment ? OrderStatus.IN_QUEUE : OrderStatus.DRAFT;

    const orderId = await replayOnDuplicate(() => this.ds.transaction(async (em) => {
      const p = await this.prepare(em, dto.lines, dto.global_coil_item_id, dto.discount, settings, actor.branch_id, true);

      // Placement payment (prototype): at least the branch minimum, never more than the total
      if (payment && payment.amount < p.min_to_place) {
        throw new BadRequestException(errWith(ERR.PAYMENT_BELOW_MINIMUM, { min_to_place: p.min_to_place }, `At least ${formatRs(p.min_to_place)} must be paid to place the order`));
      }
      if (payment && payment.amount > p.total) throw new BadRequestException(errWith(ERR.PAYMENT_ABOVE_BALANCE, { balance: p.total }));

      const customerId = await this.customers.findOrCreateForIntake(em, dto.customer, actor.branch_id, actor.user_id);
      const orderNumber = await this.numbers.next(em, 'ROOFING_ORDER', settings.number_prefixes);
      const [order]: Pick<OrderEntity, 'order_id' | 'total' | 'paid_amount'>[] = await em.query(
        `INSERT INTO "order" (branch_id, customer_id, order_type, section_type, service_type, order_number, status,
                              subtotal, discount, total, header, created_by, actor_role_at_creation, client_request_id)
         VALUES ($1, $2, 'ROOFING_ORDER', 'ROOFING', 'FABRICATION', $3, $11, $4, $5, $6, $7::jsonb, $8, $9, $10)
         RETURNING order_id, total, paid_amount`,
        [
          actor.branch_id,
          customerId,
          orderNumber,
          p.subtotal,
          p.discount,
          p.total,
          // The order date is the day the order is placed (branch time), never typed by the user
          JSON.stringify({ order_date: toBranchDate(), ...this.header(dto, p) }),
          actor.user_id,
          actor.role,
          dto.client_request_id,
          status,
        ],
      );

      const links: { attachment_id: string; line_id: string }[] = [];
      const holds: StockReservationInput[] = [];
      const materials: CustomerMaterialLine[] = [];
      for (const [i, line] of p.lines.entries()) {
        const lineId = await this.insertLine(em, order.order_id, i + 1, line, settings, actor);
        if (line.input.design_attachment_id) links.push({ attachment_id: line.input.design_attachment_id, line_id: lineId });
        holds.push(...this.hold(line, lineId));
        materials.push(...customerMaterialLine(line.input, lineId));
      }
      await this.attachments.linkToLines(em, order.order_id, links, actor);
      // Coil is held from placing until work starts (Docs/decisions/0003)
      await this.stock.reserveMany(em, actor.branch_id, order.order_id, holds, actor, { override: dto.override });

      // Customer material: each item takes its gate pass item (Docs/decisions/0007)
      const passes = await this.allocations.commitLines(em, { order_id: order.order_id, customer_id: customerId, lines: materials, replace: false }, actor);
      if (passes.length) await this.gatePasses.syncStoredStatus(em, passes, actor.branch_id);

      await this.access.history(em, actor, {
        order_id: order.order_id,
        event_type: HistoryEventType.STATUS_CHANGE,
        to_status: status,
        note:
          (payment ? 'Order placed' : 'Order placed — waiting for the cashier') + (dto.override ? ` with stock override: ${dto.override.reason}` : ''),
      });
      if (payment && payment.amount > 0) {
        await this.payments.insertPayment(em, order, payment, settings, actor);
      }
      return order.order_id;
    }), () => this.queries.findByRequestId(dto.client_request_id, actor.branch_id));

    this.audit.record(actor, { type: 'order', id: orderId, version: 1 }, dto.override ? 'PLACE_ROOFING_ORDER_WITH_STOCK_OVERRIDE' : 'PLACE_ROOFING_ORDER', {
      after: { lines: dto.lines.length, payment: payment?.amount ?? 0, ...(dto.override ? { override_reason: dto.override.reason } : {}) },
    });
    this.events.changed(actor.branch_id, 'orders', 'payments', 'gate_passes', 'stock');
    return this.queries.detail(orderId, actor.branch_id);
  }

  /**
   * Edits an order before work starts. An unpaid order still at the cashier (DRAFT) is
   * edited by whoever may create orders (the supervisor, from History). Once money is
   * taken, or the order is in the Order Queue, it is the cashier's edit (edit:order, gated
   * by allow_cashier_edit_before_start). Prices are recalculated and payments are kept.
   * A new total below what was already paid is refused: there are no refunds (BR16).
   * Only the cashier changes the discount.
   */
  async update(orderId: string, dto: UpdateRoofingOrderDto, actor: Actor): Promise<OrderDetail> {
    const settings = (await this.branches.get(actor.branch_id)).settings;
    this.checkMaterialRules(dto, settings);
    const cashier = await this.isCashier(actor);
    const mayEditPlaced = await this.rolePermissions.has(actor.role, 'edit:order');

    await this.ds.transaction(async (em) => {
      const order = await this.access.lockOrder(em, orderId, actor.branch_id, OrderType.ROOFING_ORDER);
      this.access.assertVersion(order.version, dto.version);
      if (order.status !== OrderStatus.IN_QUEUE && order.status !== OrderStatus.DRAFT) throw new ConflictException(ERR.ORDER_LOCKED);
      const unpaidDraft = order.status === OrderStatus.DRAFT && order.paid_amount === 0;
      if (!unpaidDraft) {
        if (!mayEditPlaced) throw new ForbiddenException(order.status === OrderStatus.DRAFT ? ERR.ORDER_DRAFT_PAID_LOCKED : ERR.AUTH_INSUFFICIENT_PERMISSION);
        if (!settings.orders.allow_cashier_edit_before_start) throw new ConflictException(ERR.ORDER_EDIT_DISABLED);
      }
      if (!cashier && dto.discount !== order.discount) throw new ForbiddenException(ERR.ORDER_DISCOUNT_DENIED);
      const existing: OrderLineEntity[] = await em.query(`SELECT * FROM order_line WHERE order_id = $1 FOR UPDATE`, [orderId]);
      if (existing.some((l) => lineHasStarted(l.status))) throw new ConflictException(ERR.ORDER_LOCKED);

      const p = await this.prepare(em, dto.lines, dto.global_coil_item_id, dto.discount, settings, actor.branch_id, true);
      // paid_amount is read from the locked row, so a payment taken meanwhile is counted
      if (p.total < order.paid_amount) {
        throw new ConflictException(errWith(ERR.ORDER_TOTAL_BELOW_PAID, { paid: order.paid_amount, new_total: p.total }));
      }
      const customerId = await this.customers.findOrCreateForIntake(em, dto.customer, actor.branch_id, actor.user_id);

      const byId = new Map(existing.map((l) => [l.line_id, l]));
      for (const l of p.lines) {
        if (l.input.line_id && !byId.has(l.input.line_id)) throw new BadRequestException(ERR.LINE_NOT_FOUND);
      }
      const keep = new Set(p.lines.map((l) => l.input.line_id).filter((x): x is string => !!x));
      for (const l of existing) {
        if (!keep.has(l.line_id) && l.status !== LineStatus.CANCELLED) {
          await em.query(`UPDATE order_line SET status = 'CANCELLED', version = version + 1 WHERE line_id = $1`, [l.line_id]);
          await this.access.history(em, actor, {
            order_id: orderId,
            line_id: l.line_id,
            event_type: HistoryEventType.STATUS_CHANGE,
            from_status: l.status,
            to_status: LineStatus.CANCELLED,
            note: 'Removed when the order was edited',
          });
        }
      }

      let nextNo = existing.reduce((m, l) => Math.max(m, l.line_no), 0) + 1;
      const links: { attachment_id: string; line_id: string }[] = [];
      await this.stock.releaseForOrder(em, orderId, 'replaced_in_edit');
      const holds: StockReservationInput[] = [];
      const materials: CustomerMaterialLine[] = [];
      for (const line of p.lines) {
        const lineId = line.input.line_id
          ? (await this.updateLine(em, line.input.line_id, line), line.input.line_id)
          : await this.insertLine(em, orderId, nextNo++, line, settings, actor);
        if (line.input.design_attachment_id) links.push({ attachment_id: line.input.design_attachment_id, line_id: lineId });
        holds.push(...this.hold(line, lineId));
        materials.push(...customerMaterialLine(line.input, lineId));
      }
      await this.attachments.linkToLines(em, orderId, links, actor);
      await this.stock.reserveMany(em, actor.branch_id, orderId, holds, actor, { override: dto.override });

      // Keeping material the order already holds is not a new allocation (RO-08)
      const held: { gp_item_id: string; gate_pass_id: string }[] = await em.query(
        `SELECT DISTINCT a.gp_item_id, i.gate_pass_id FROM material_allocation a JOIN gate_pass_item i ON i.gp_item_id = a.gp_item_id
         WHERE a.order_id = $1 AND a.status = 'COMMITTED'`,
        [orderId],
      );
      if (materials.some((m) => !held.some((h) => h.gp_item_id === m.gp_item_id))) await this.assertMayAllocateGatePass(actor);
      await em.query(
        `UPDATE "order" SET customer_id = $2, subtotal = $3, discount = $4, total = $5, header = $6::jsonb, version = version + 1, updated_at = now()
         WHERE order_id = $1`,
        // The stored order date is kept; the minimum to place follows the new total
        [orderId, customerId, p.subtotal, p.discount, p.total, JSON.stringify({ ...withoutOrderMaterial(order.header), ...this.header(dto, p) })],
      );

      // Customer material: the items' gate pass material replaces what the order held before
      const passes = await this.allocations.commitLines(em, { order_id: orderId, customer_id: customerId, lines: materials, replace: true }, actor);
      const touched = [...new Set([...held.map((h) => h.gate_pass_id), ...passes])];
      if (touched.length) await this.gatePasses.syncStoredStatus(em, touched, actor.branch_id);

      await this.access.history(em, actor, {
        order_id: orderId,
        event_type: HistoryEventType.NOTE,
        note: dto.override ? `Order edited with stock override: ${dto.override.reason}` : 'Order edited',
      });
    });

    this.audit.record(actor, { type: 'order', id: orderId, version: dto.version + 1 }, dto.override ? 'UPDATE_ROOFING_ORDER_WITH_STOCK_OVERRIDE' : 'UPDATE_ROOFING_ORDER', {
      after: { lines: dto.lines.length, ...(dto.override ? { override_reason: dto.override.reason } : {}) },
    });
    this.events.changed(actor.branch_id, 'orders', 'gate_passes', 'stock');
    return this.queries.detail(orderId, actor.branch_id);
  }

  /**
   * Starts the order: every item goes into production. Branch coil is deducted now
   * (BR10, running ft per sheet item); not enough stock returns 409 with
   * override_allowed, and a valid override is recorded and audited.
   */
  async start(orderId: string, dto: StartWorkDto, actor: Actor): Promise<OrderDetail> {
    await this.ds.transaction(async (em) => {
      const order = await this.access.lockOrder(em, orderId, actor.branch_id, OrderType.ROOFING_ORDER);
      this.access.assertVersion(order.version, dto.version);
      if (order.status !== OrderStatus.IN_QUEUE) throw new ConflictException(ERR.ORDER_INVALID_TRANSITION);
      await this.access.assertChiefMayModify(em, order, actor);

      const lines: OrderLineEntity[] = await em.query(
        `SELECT * FROM order_line WHERE order_id = $1 AND status = 'ASSIGNED' ORDER BY line_no FOR UPDATE`,
        [orderId],
      );
      const usage = lines
        .filter((l) => l.item_id && l.material_source === MaterialSource.BRANCH && Number(l.quantity) > 0)
        .map((l) => ({ item_id: l.item_id!, quantity: Number(l.quantity), line_id: l.line_id }));
      await this.stock.deductMany(em, actor.branch_id, usage, MovementType.JOB_USAGE, actor, {
        reason: order.order_number,
        override: dto.override,
      });

      for (const l of lines) {
        await em.query(`UPDATE order_line SET status = 'IN_PROGRESS', version = version + 1 WHERE line_id = $1`, [l.line_id]);
        await this.access.history(em, actor, {
          order_id: orderId,
          line_id: l.line_id,
          event_type: HistoryEventType.STATUS_CHANGE,
          from_status: l.status,
          to_status: LineStatus.IN_PROGRESS,
        });
      }
      await this.access.setOrderStatus(em, orderId, OrderStatus.IN_PROGRESS);
      await this.access.history(em, actor, {
        order_id: orderId,
        event_type: HistoryEventType.STATUS_CHANGE,
        from_status: OrderStatus.IN_QUEUE,
        to_status: OrderStatus.IN_PROGRESS,
        note: dto.override ? `Started with stock override: ${dto.override.reason}` : 'Work started',
      });
    });

    this.audit.record(actor, { type: 'order', id: orderId }, dto.override ? 'START_ORDER_WITH_STOCK_OVERRIDE' : 'START_ORDER', {
      after: dto.override ? { override_reason: dto.override.reason } : undefined,
    });
    this.events.changed(actor.branch_id, 'orders', 'stock');
    return this.queries.detail(orderId, actor.branch_id);
  }

  /** Marks every item done after inspection (BR07: the actor is the inspector). The order shows as Ready. */
  async complete(orderId: string, dto: CompleteWorkDto, actor: Actor): Promise<OrderDetail> {
    await this.ds.transaction(async (em) => {
      const order = await this.access.lockOrder(em, orderId, actor.branch_id, OrderType.ROOFING_ORDER);
      this.access.assertVersion(order.version, dto.version);
      const lines: OrderLineEntity[] = await em.query(`SELECT * FROM order_line WHERE order_id = $1 FOR UPDATE`, [orderId]);
      if (order.status !== OrderStatus.IN_PROGRESS || allActiveLinesCompleted(lines.map((l) => l.status))) {
        throw new ConflictException(ERR.ORDER_INVALID_TRANSITION);
      }
      await this.access.assertChiefMayModify(em, order, actor);

      for (const l of lines.filter((x) => x.status === LineStatus.IN_PROGRESS)) {
        await em.query(`UPDATE order_line SET status = 'COMPLETED', completed_at = now(), version = version + 1 WHERE line_id = $1`, [l.line_id]);
        await this.access.history(em, actor, {
          order_id: orderId,
          line_id: l.line_id,
          event_type: HistoryEventType.INSPECTION,
          result: InspectionResult.PASS,
        });
        await this.access.history(em, actor, {
          order_id: orderId,
          line_id: l.line_id,
          event_type: HistoryEventType.STATUS_CHANGE,
          from_status: l.status,
          to_status: LineStatus.COMPLETED,
        });
      }
      await em.query(`UPDATE "order" SET version = version + 1, updated_at = now() WHERE order_id = $1`, [orderId]);
      await this.access.history(em, actor, {
        order_id: orderId,
        event_type: HistoryEventType.NOTE,
        note: dto.note ? `Work completed — ${dto.note}` : 'Work completed — ready for release',
      });
    });

    this.audit.record(actor, { type: 'order', id: orderId }, 'COMPLETE_ORDER');
    this.events.changed(actor.branch_id, 'orders');
    return this.queries.detail(orderId, actor.branch_id);
  }

  /** Supervisor hands a ready, fully paid order to the customer. */
  async release(orderId: string, dto: ReleaseOrderDto, actor: Actor): Promise<OrderDetail> {
    await this.ds.transaction(async (em) => {
      const order = await this.access.lockOrder(em, orderId, actor.branch_id, OrderType.ROOFING_ORDER);
      this.access.assertVersion(order.version, dto.version);
      const lines: { status: LineStatus }[] = await em.query(`SELECT status FROM order_line WHERE order_id = $1`, [orderId]);
      if (order.status !== OrderStatus.IN_PROGRESS || !allActiveLinesCompleted(lines.map((l) => l.status))) {
        throw new ConflictException(ERR.ORDER_NOT_READY);
      }
      const balance = order.total - order.paid_amount;
      if (balance > 0) throw new ConflictException(errWith(ERR.ORDER_BALANCE_DUE, { balance }));

      await em.query(
        `UPDATE "order" SET status = 'CLOSED', released_to = $2, released_by = $3, released_at = now(), release_notes = $4,
                version = version + 1, updated_at = now()
         WHERE order_id = $1`,
        [orderId, dto.released_to, actor.user_id, dto.note ?? null],
      );
      await this.access.history(em, actor, {
        order_id: orderId,
        event_type: HistoryEventType.STATUS_CHANGE,
        from_status: OrderStatus.IN_PROGRESS,
        to_status: OrderStatus.CLOSED,
        note: `Released to ${dto.released_to}${dto.note ? ` · ${dto.note}` : ''}`,
      });
      const gatePassIds = await this.allocations.gatePassIdsForOrder(em, orderId);
      if (gatePassIds.length) await this.gatePasses.syncStoredStatus(em, gatePassIds, actor.branch_id);
    });

    this.audit.record(actor, { type: 'order', id: orderId }, 'RELEASE_ORDER', { after: { released_to: dto.released_to } });
    this.events.changed(actor.branch_id, 'orders', 'gate_passes');
    return this.queries.detail(orderId, actor.branch_id);
  }

  /**
   * Cashier cancels a Placed order. Customer material goes back to the gate pass.
   * Money already paid is refunded at the counter; no refund record is kept (BR16).
   */
  async cancel(orderId: string, reason: string, actor: Actor): Promise<OrderDetail> {
    await this.ds.transaction(async (em) => {
      const order = await this.access.lockOrder(em, orderId, actor.branch_id, OrderType.ROOFING_ORDER);
      // Unpaid orders waiting at the cashier can be cancelled too
      if (order.status !== OrderStatus.IN_QUEUE && order.status !== OrderStatus.DRAFT) throw new ConflictException(ERR.ORDER_INVALID_TRANSITION);
      await em.query(`UPDATE order_line SET status = 'CANCELLED', version = version + 1 WHERE order_id = $1 AND status <> 'CANCELLED'`, [orderId]);
      await em.query(
        `UPDATE "order" SET status = 'VOIDED', header = header || $2::jsonb, version = version + 1, updated_at = now() WHERE order_id = $1`,
        [orderId, JSON.stringify({ cancel_reason: reason })],
      );
      const gatePassIds = await this.allocations.gatePassIdsForOrder(em, orderId);
      await this.allocations.releaseForOrder(em, orderId, 'order_cancelled');
      await this.stock.releaseForOrder(em, orderId, 'order_cancelled');
      if (gatePassIds.length) await this.gatePasses.syncStoredStatus(em, gatePassIds, actor.branch_id);
      await this.access.history(em, actor, {
        order_id: orderId,
        event_type: HistoryEventType.STATUS_CHANGE,
        from_status: order.status,
        to_status: OrderStatus.VOIDED,
        note: reason,
      });
    });

    this.audit.record(actor, { type: 'order', id: orderId }, 'CANCEL_ROOFING_ORDER', { after: { reason } });
    this.events.changed(actor.branch_id, 'orders', 'gate_passes', 'stock');
    return this.queries.detail(orderId, actor.branch_id);
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private checkMaterialRules(dto: CreateRoofingOrderDto | UpdateRoofingOrderDto, settings: BranchSettings): void {
    // Customer material always comes from a gate pass item, so the branch needs both on (Docs/decisions/0007)
    const usesCustomer = dto.lines.some((l) => l.material_source === MaterialSource.CUSTOMER);
    if (usesCustomer && !settings.general.allow_customer_material) throw new BadRequestException(ERR.ORDER_CUSTOMER_MATERIAL_DISABLED);
    if (usesCustomer && !settings.features.gatePass) throw new BadRequestException(ERR.ORDER_GATE_PASS_REQUIRED);
  }

  /**
   * Normalizes, checks and prices every item. With strict (saving), an incomplete
   * item, an unknown coil, a missing rate or a too-large discount is rejected; the
   * quote returns what it can.
   */
  private async prepare(
    em: EntityManager,
    lines: RoofingLineInput[],
    globalCoilId: string | null | undefined,
    discount: number,
    settings: BranchSettings,
    branchId: string,
    strict: boolean,
  ): Promise<Prepared> {
    const roofing = settings.roofing;
    const coils = new Map((await this.items.coils(branchId, em)).map((c) => [c.item_id, c]));
    const orderCoilId = roofing.allow_single_coil && globalCoilId ? globalCoilId : null;
    if (strict && orderCoilId && !coils.has(orderCoilId)) throw new BadRequestException(ERR.ORDER_COIL_INVALID);

    const data = await this.pricing.load(em);
    const ctx = { rates: data.rates, surcharge_pct: settings.orders.customized_surcharge_pct, coilThickness: data.coilThickness };

    const prepared = lines.map((raw, i): PreparedLine => {
      const input = normalizeRoofingLine(raw, roofing, orderCoilId);
      if (strict) {
        const missing = validateRoofingLine(input, roofing, false);
        if (missing.length > 0) {
          throw new BadRequestException(errWith(ERR.ORDER_ITEM_INCOMPLETE, { line_index: i, missing }, `Item ${i + 1} is missing: ${missing.join(', ')}`));
        }
        if (input.coil_item_id && !coils.has(input.coil_item_id)) throw new BadRequestException(errWith(ERR.ORDER_COIL_INVALID, { line_index: i }));
      }
      const coil = input.coil_item_id ? (coils.get(input.coil_item_id) ?? null) : null;
      const priced = priceRoofingLine(input, ctx);
      // A customized item's advance is typed (0 to its total); standard items take the branch %
      if (strict && input.advance !== undefined && input.advance > priced.line_total) {
        throw new BadRequestException(errWith(ERR.ORDER_ITEM_ADVANCE_RANGE, { line_index: i, max: priced.line_total }));
      }
      return {
        input,
        priced,
        item_id: lineDeductsCoil(input) && coil ? coil.item_id : null,
        coil,
        advance: roofingLineAdvance(priced, input, settings),
        suggested_advance: suggestedRoofingAdvance(priced, input, settings),
      };
    });

    const missingRates = prepared.flatMap((l, i) => (l.priced.missing_rate ? [{ line_index: i, missing: l.priced.missing_rate }] : []));
    if (strict && missingRates.length > 0) {
      throw new BadRequestException(errWith(ERR.PRICE_ROOFING_RATE_MISSING, { missing_rates: missingRates }));
    }

    // The minimum to place is the sum of the item advances (Docs/decisions/0011)
    const totals = roofingTotals(
      prepared.map((l) => l.priced.line_total),
      discount,
      settings.orders,
      prepared.map((l) => l.advance),
    );
    if (strict && discount > totals.max_discount) {
      throw new BadRequestException(errWith(ERR.ORDER_DISCOUNT_TOO_HIGH, { max_discount: totals.max_discount }, `The discount can't be more than ${settings.orders.max_discount_pct}% (${formatRs(totals.max_discount)})`));
    }
    return { lines: prepared, orderCoilId, ...totals };
  }

  /** Coil ft a branch-material sheet item will use; the same rule start() deducts by (BR10/BR11). */
  private hold(line: PreparedLine, lineId: string): StockReservationInput[] {
    const quantity = Number(line.priced.quantity ?? 0);
    return line.item_id && line.input.material_source === MaterialSource.BRANCH && quantity > 0
      ? [{ item_id: line.item_id, quantity, line_id: lineId }]
      : [];
  }

  /** Header fields set by every save; the order date is stamped once on create. */
  private header(dto: CreateRoofingOrderDto | UpdateRoofingOrderDto, p: Prepared) {
    return {
      technician: dto.technician || undefined,
      global_coil_item_id: p.orderCoilId ?? undefined,
      // What the cashier must take before an unpaid order enters the Order Queue
      min_to_place: p.min_to_place,
    };
  }

  /** The cashier takes payments and gives discounts (process:payment). */
  private isCashier(actor: Actor): Promise<boolean> {
    return this.rolePermissions.has(actor.role, 'process:payment');
  }

  /** The stored spec: the normalized item plus a snapshot of the coil as it was when ordered. */
  private spec(line: PreparedLine) {
    const { line_id: _ignored, ...spec } = line.input;
    return { ...spec, coil_sku: line.coil?.sku, coil_details: line.coil?.details, price_note: line.priced.price_note };
  }

  private async insertLine(em: EntityManager, orderId: string, lineNo: number, line: PreparedLine, settings: BranchSettings, actor: Actor): Promise<string> {
    const lineNumber = await this.numbers.next(em, 'ORDER_LINE', settings.number_prefixes);
    const [{ line_id }]: { line_id: string }[] = await em.query(
      `INSERT INTO order_line (order_id, line_number, line_no, line_type, status, material_source, item_id, spec,
                               quantity, price_basis, unit_price, line_total, is_customized, notes, created_by, actor_role_at_creation, suggested_advance)
       VALUES ($1, $2, $3, $4, 'ASSIGNED', $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING line_id`,
      [
        orderId,
        lineNumber,
        lineNo,
        line.priced.line_type,
        line.input.material_source,
        line.item_id,
        JSON.stringify(this.spec(line)),
        line.priced.quantity,
        line.priced.price_basis,
        line.priced.unit_price,
        line.priced.line_total,
        line.input.job_type === 'CUSTOMIZED',
        line.input.remarks ?? null,
        actor.user_id,
        actor.role,
        line.advance,
      ],
    );
    return line_id;
  }

  /** Using a gate pass's material on a roofing order is set on Role Permissions (allocate:gate_pass_order). */
  private async assertMayAllocateGatePass(actor: Actor): Promise<void> {
    if (!(await this.rolePermissions.has(actor.role, 'allocate:gate_pass_order'))) {
      throw new ForbiddenException(ERR.AUTH_INSUFFICIENT_PERMISSION);
    }
  }

  private async updateLine(em: EntityManager, lineId: string, line: PreparedLine): Promise<void> {
    await em.query(
      `UPDATE order_line SET line_type = $2, material_source = $3, item_id = $4, spec = $5::jsonb, quantity = $6, price_basis = $7,
              unit_price = $8, line_total = $9, is_customized = $10, notes = $11, suggested_advance = $12, status = 'ASSIGNED', version = version + 1
       WHERE line_id = $1`,
      [
        lineId,
        line.priced.line_type,
        line.input.material_source,
        line.item_id,
        JSON.stringify(this.spec(line)),
        line.priced.quantity,
        line.priced.price_basis,
        line.priced.unit_price,
        line.priced.line_total,
        line.input.job_type === 'CUSTOMIZED',
        line.input.remarks ?? null,
        line.advance,
      ],
    );
  }
}
