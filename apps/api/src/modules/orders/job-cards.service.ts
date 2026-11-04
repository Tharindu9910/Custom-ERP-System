import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import {
  HistoryEventType,
  LineStatus,
  MaterialSource,
  OrderStatus,
  OrderType,
  advanceEditable,
  jobCardMinAdvance,
  lineAdvance,
  lineHasStarted,
  priceWorkshopLine,
  suggestedLineAdvance,
  toBranchDate,
  type BranchSettings,
  type CreateJobCardDto,
  type PricedWorkshopLine,
  type UpdateJobCardDto,
  type WorkshopLineInput,
} from '@erp/shared';
import type { Actor } from '../../common/actor';
import { replayOnDuplicate } from '../../common/idempotency';
import { ERR, errWith } from '../../common/errors';
import { AuditService } from '../../core/audit.service';
import { BranchContextService } from '../../core/branch-context.service';
import { EventsService } from '../../core/events.service';
import { NumberService } from '../../core/number.service';
import { StockService, type StockReservationInput } from '../../core/stock.service';
import type { OrderLineEntity } from '../../database/entities/order-line.entity';
import { CustomersService } from '../customers/customers.service';
import { AllocationsService } from '../gate-passes/allocations.service';
import { GatePassesService } from '../gate-passes/gate-passes.service';
import { customerMaterialLine, withoutOrderMaterial, type CustomerMaterialLine } from './customer-material';
import { OrderAccessService } from './order-access.service';
import { OrderQueriesService, type OrderDetail } from './order-queries.service';
import { PricingService, type PricingData } from './pricing.service';

interface PricedInput {
  input: WorkshopLineInput;
  priced: PricedWorkshopLine;
  item_id: string | null;
  /** Advance this sub-job needs (Docs/decisions/0010): the supervisor's amount on a customized line, else the suggestion */
  advance: number;
  suggested_advance: number;
}

/** Workshop job cards: one order (JOB_CARD) per customer visit, one line per sub-job. */
@Injectable()
export class JobCardsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly access: OrderAccessService,
    private readonly pricing: PricingService,
    private readonly numbers: NumberService,
    private readonly customers: CustomersService,
    private readonly allocations: AllocationsService,
    private readonly stock: StockService,
    private readonly gatePasses: GatePassesService,
    private readonly branches: BranchContextService,
    private readonly queries: OrderQueriesService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  /** Live price preview for the form — the same pricing the save uses. */
  async quote(lines: WorkshopLineInput[], actor: Actor) {
    const settings = (await this.branches.get(actor.branch_id)).settings;
    const data = await this.pricing.load(this.ds.manager);
    const priced = lines.map((input) => {
      const p = priceWorkshopLine(input, this.pricingCtx(data));
      return { ...p, suggested_advance: suggestedLineAdvance(p, input, settings), advance: lineAdvance(p, input, settings), advance_editable: advanceEditable(p) };
    });
    const subtotal = priced.reduce((s, p) => s + p.line_total, 0);
    return {
      lines: priced,
      subtotal,
      min_advance: jobCardMinAdvance(priced),
      missing_rates: priced.flatMap((p, i) => p.missing_rates.map((m) => ({ line_index: i, missing: m }))),
    };
  }

  async create(dto: CreateJobCardDto, actor: Actor): Promise<OrderDetail> {
    const existing = await this.queries.findByRequestId(dto.client_request_id, actor.branch_id);
    if (existing) return this.queries.detail(existing, actor.branch_id);

    const settings = (await this.branches.get(actor.branch_id)).settings;
    this.checkAgainstSettings(dto, settings);

    let advances: PricedInput[] = [];
    const orderId = await replayOnDuplicate(() => this.ds.transaction(async (em) => {
      await this.assertWorkers(em, dto.worker_ids, actor.branch_id);
      const priced = await this.priceAll(em, dto.lines, settings);
      advances = priced;
      const customerId = await this.customers.findOrCreateForIntake(em, dto.customer, actor.branch_id, actor.user_id);
      const orderNumber = await this.numbers.next(em, 'JOB_CARD', settings.number_prefixes);
      const total = priced.reduce((s, p) => s + p.priced.line_total, 0);

      const [{ order_id }]: { order_id: string }[] = await em.query(
        `INSERT INTO "order" (branch_id, customer_id, order_type, section_type, service_type, order_number, status,
                              subtotal, total, header, created_by, actor_role_at_creation, client_request_id)
         VALUES ($1, $2, 'JOB_CARD', 'WORKSHOP', 'FABRICATION', $3, 'DRAFT', $4, $4, $5::jsonb, $6, $7, $8)
         RETURNING order_id`,
        [
          actor.branch_id,
          customerId,
          orderNumber,
          total,
          // The job date is the day the card is created (branch time), never typed by the user
          JSON.stringify({ job_date: toBranchDate(), notes: dto.notes }),
          actor.user_id,
          actor.role,
          dto.client_request_id,
        ],
      );

      const holds: StockReservationInput[] = [];
      const materials: CustomerMaterialLine[] = [];
      for (const [i, p] of priced.entries()) {
        const lineId = await this.insertLine(em, order_id, i + 1, p, settings, actor);
        await this.assignWorkers(em, lineId, dto.worker_ids, actor);
        holds.push(...this.hold(p, lineId));
        materials.push(...customerMaterialLine(p.input, lineId));
      }
      // Branch material is held from now until the line starts (Docs/decisions/0003)
      await this.stock.reserveMany(em, actor.branch_id, order_id, holds, actor, { override: dto.override });

      // Customer material: each line takes its gate pass item (Docs/decisions/0007)
      const passes = await this.allocations.commitLines(em, { order_id, customer_id: customerId, lines: materials, replace: false }, actor);
      if (passes.length) await this.gatePasses.syncStoredStatus(em, passes, actor.branch_id);

      await this.access.history(em, actor, {
        order_id,
        event_type: HistoryEventType.STATUS_CHANGE,
        to_status: OrderStatus.DRAFT,
        note: dto.override ? `Job card created with stock override: ${dto.override.reason}` : 'Job card created',
      });
      // Every card waits for the cashier, even with nothing due (Docs/decisions/0005)
      return order_id;
    }), () => this.queries.findByRequestId(dto.client_request_id, actor.branch_id));

    this.audit.record(actor, { type: 'order', id: orderId, version: 1 }, dto.override ? 'CREATE_JOB_CARD_WITH_STOCK_OVERRIDE' : 'CREATE_JOB_CARD', {
      after: { lines: dto.lines.length, ...advanceOverrides(advances), ...(dto.override ? { override_reason: dto.override.reason } : {}) },
    });
    this.events.changed(actor.branch_id, 'orders', 'gate_passes', 'stock');
    return this.queries.detail(orderId, actor.branch_id);
  }

  /**
   * Edits a job card until a payment is taken or a line has started. Removed lines are
   * cancelled (kept for history), totals and advances are recalculated. Held material is
   * released and held again for the edited lines.
   */
  async update(orderId: string, dto: UpdateJobCardDto, actor: Actor): Promise<OrderDetail> {
    const settings = (await this.branches.get(actor.branch_id)).settings;
    this.checkAgainstSettings(dto, settings);

    let advances: PricedInput[] = [];
    await this.ds.transaction(async (em) => {
      const order = await this.access.lockOrder(em, orderId, actor.branch_id, OrderType.JOB_CARD);
      this.access.assertVersion(order.version, dto.version);
      if (order.status !== OrderStatus.DRAFT && order.status !== OrderStatus.IN_QUEUE) {
        throw new ConflictException(ERR.ORDER_LOCKED);
      }
      // Once the cashier has taken any money the card is fixed; void it or open a new one (Docs/decisions/0010)
      if (order.paid_amount > 0) throw new ConflictException(ERR.JOB_CARD_PAID_LOCKED);
      await this.access.assertChiefMayModify(em, order, actor);

      const lines: OrderLineEntity[] = await em.query(`SELECT * FROM order_line WHERE order_id = $1 FOR UPDATE`, [orderId]);
      if (lines.some((l) => lineHasStarted(l.status))) throw new ConflictException(ERR.ORDER_LOCKED);

      await this.assertWorkers(em, dto.worker_ids, actor.branch_id);
      const priced = await this.priceAll(em, dto.lines, settings);
      advances = priced;
      const customerId = await this.customers.findOrCreateForIntake(em, dto.customer, actor.branch_id, actor.user_id);

      const byId = new Map(lines.map((l) => [l.line_id, l]));
      for (const p of priced) {
        if (p.input.line_id && !byId.has(p.input.line_id)) throw new BadRequestException(ERR.LINE_NOT_FOUND);
      }
      const keep = new Set(priced.map((p) => p.input.line_id).filter((x): x is string => !!x));
      let nextNo = lines.reduce((m, l) => Math.max(m, l.line_no), 0) + 1;

      for (const l of lines) {
        if (!keep.has(l.line_id) && l.status !== LineStatus.CANCELLED) {
          await em.query(`UPDATE order_line SET status = 'CANCELLED', version = version + 1 WHERE line_id = $1`, [l.line_id]);
          await this.access.history(em, actor, {
            order_id: orderId,
            line_id: l.line_id,
            event_type: HistoryEventType.STATUS_CHANGE,
            from_status: l.status,
            to_status: LineStatus.CANCELLED,
            note: 'Removed when the job card was edited',
          });
        }
      }

      await this.stock.releaseForOrder(em, orderId, 'replaced_in_edit');
      const holds: StockReservationInput[] = [];
      const materials: CustomerMaterialLine[] = [];
      for (const p of priced) {
        let lineId = p.input.line_id;
        if (lineId) {
          await this.updateLine(em, lineId, p);
        } else {
          lineId = await this.insertLine(em, orderId, nextNo++, p, settings, actor);
        }
        await em.query(`DELETE FROM line_assignment WHERE line_id = $1`, [lineId]);
        await this.assignWorkers(em, lineId, dto.worker_ids, actor);
        holds.push(...this.hold(p, lineId));
        materials.push(...customerMaterialLine(p.input, lineId));
      }
      await this.stock.reserveMany(em, actor.branch_id, orderId, holds, actor, { override: dto.override });

      const total = priced.reduce((s, p) => s + p.priced.line_total, 0);
      const previousPasses = await this.allocations.gatePassIdsForOrder(em, orderId);
      await em.query(
        `UPDATE "order" SET customer_id = $2, subtotal = $3, total = $3, header = $4::jsonb, version = version + 1, updated_at = now()
         WHERE order_id = $1`,
        [
          orderId,
          customerId,
          total,
          // Edits keep the original job date
          JSON.stringify({ ...withoutOrderMaterial(order.header), notes: dto.notes }),
        ],
      );

      // Customer material: the lines' gate pass items replace what the card held before
      const passes = await this.allocations.commitLines(em, { order_id: orderId, customer_id: customerId, lines: materials, replace: true }, actor);
      const touched = [...new Set([...previousPasses, ...passes])];
      if (touched.length) await this.gatePasses.syncStoredStatus(em, touched, actor.branch_id);

      await this.access.history(em, actor, {
        order_id: orderId,
        event_type: HistoryEventType.NOTE,
        note: dto.override ? `Job card edited with stock override: ${dto.override.reason}` : 'Job card edited',
      });
    });

    this.audit.record(actor, { type: 'order', id: orderId, version: dto.version + 1 }, dto.override ? 'UPDATE_JOB_CARD_WITH_STOCK_OVERRIDE' : 'UPDATE_JOB_CARD', {
      after: { lines: dto.lines.length, ...advanceOverrides(advances), ...(dto.override ? { override_reason: dto.override.reason } : {}) },
    });
    this.events.changed(actor.branch_id, 'orders', 'gate_passes', 'stock');
    return this.queries.detail(orderId, actor.branch_id);
  }

  /** BR14: a draft job card (nothing paid, nothing started) may be voided by its supervisor or chief. */
  async void(orderId: string, reason: string, actor: Actor): Promise<OrderDetail> {
    await this.ds.transaction(async (em) => {
      const order = await this.access.lockOrder(em, orderId, actor.branch_id, OrderType.JOB_CARD);
      if (order.status !== OrderStatus.DRAFT || order.paid_amount > 0) throw new ConflictException(ERR.ORDER_INVALID_TRANSITION);
      await this.access.assertChiefMayModify(em, order, actor);
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
        from_status: OrderStatus.DRAFT,
        to_status: OrderStatus.VOIDED,
        note: reason,
      });
    });
    this.audit.record(actor, { type: 'order', id: orderId }, 'VOID_JOB_CARD', { after: { reason } });
    this.events.changed(actor.branch_id, 'orders', 'gate_passes', 'stock');
    return this.queries.detail(orderId, actor.branch_id);
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  /** Rules the form offers from branch settings are enforced here too. */
  private checkAgainstSettings(dto: CreateJobCardDto | UpdateJobCardDto, settings: BranchSettings): void {
    // Customer material always comes from a gate pass item (schema), so the branch needs both on (Docs/decisions/0007)
    const usesCustomer = dto.lines.some((l) => l.material_source === MaterialSource.CUSTOMER);
    if (usesCustomer && !settings.general.allow_customer_material) throw new BadRequestException(ERR.ORDER_CUSTOMER_MATERIAL_DISABLED);
    if (usesCustomer && !settings.features.gatePass) throw new BadRequestException(ERR.ORDER_GATE_PASS_REQUIRED);
    for (const line of dto.lines) {
      if (!settings.workshop.job_types.includes(line.job_type)) {
        throw new BadRequestException(errWith(ERR.VALIDATION_FAILED, { job_type: line.job_type }, 'This job type is turned off for the branch'));
      }
      if (line.custom && !settings.workshop.allow_custom_jobs) {
        throw new BadRequestException(errWith(ERR.VALIDATION_FAILED, null, 'Custom jobs are turned off for the branch'));
      }
    }
  }

  /** Branch sheets a Cut/Bend line will use (BR10/BR11: nothing for customer material). */
  private hold(p: PricedInput, lineId: string): StockReservationInput[] {
    const quantity = Number(p.priced.quantity ?? 0);
    return p.item_id && quantity > 0 ? [{ item_id: p.item_id, quantity, line_id: lineId }] : [];
  }

  private pricingCtx(data: PricingData) {
    return { rates: data.rates, materialPrice: data.materialPrice };
  }

  /** Prices every line; a line without a standard rate needs a custom price (BR23). */
  private async priceAll(em: EntityManager, lines: WorkshopLineInput[], settings: BranchSettings): Promise<PricedInput[]> {
    const data = await this.pricing.load(em);
    const result = lines.map((input) => {
      const priced = priceWorkshopLine(input, this.pricingCtx(data));
      // Branch sheets are held and deducted whether the line is priced by rate or by hand (Docs/decisions/0008)
      const deducts = input.job_type === 'CUT_BEND' && input.material_source === MaterialSource.BRANCH;
      const item_id = deducts && input.material_type && input.thickness ? data.materialItemId(input.material_type, input.thickness) : null;
      return { input, priced, item_id, advance: lineAdvance(priced, input, settings), suggested_advance: suggestedLineAdvance(priced, input, settings) };
    });
    const missing = result.flatMap((r, i) => r.priced.missing_rates.map((m) => ({ line_index: i, missing: m })));
    if (missing.length > 0) throw new BadRequestException(errWith(ERR.PRICE_MISSING_RATE, { missing_rates: missing }));
    // A supervisor's advance runs from 0 to the sub-job total (Docs/decisions/0010)
    const over = result.findIndex((r) => r.advance > r.priced.line_total);
    if (over >= 0) throw new BadRequestException(errWith(ERR.JOB_ADVANCE_RANGE, { line_index: over, max: result[over].priced.line_total }));
    return result;
  }

  private async assertWorkers(em: EntityManager, workerIds: string[], branchId: string): Promise<void> {
    const ids = [...new Set(workerIds)];
    const rows: unknown[] = await em.query(
      `SELECT 1 FROM employee WHERE employee_id = ANY($1::uuid[]) AND branch_id = $2 AND is_active = true`,
      [ids, branchId],
    );
    // BR19/BR20: branch-scoped, active workers only
    if (rows.length !== ids.length) throw new BadRequestException(ERR.WORKER_NOT_IN_BRANCH);
  }

  private lineValues(p: PricedInput) {
    // The advance is kept in its own column, not in the spec
    const { line_id: _ignored, advance: _advance, ...spec } = p.input;
    return {
      spec,
      // order_line.suggested_advance holds the advance this sub-job needs (Docs/decisions/0010)
      suggested_advance: p.advance,
      // Reason only matters for a manual toggle (BR24); customer material/auto are implied
      reason: p.input.custom ? (p.input.customized_reason_code ?? null) : p.priced.auto_customized ? 'NO_STANDARD_RATE' : null,
    };
  }

  private async insertLine(em: EntityManager, orderId: string, lineNo: number, p: PricedInput, settings: BranchSettings, actor: Actor): Promise<string> {
    const v = this.lineValues(p);
    const lineNumber = await this.numbers.next(em, 'ORDER_LINE', settings.number_prefixes);
    const [{ line_id }]: { line_id: string }[] = await em.query(
      `INSERT INTO order_line (order_id, line_number, line_no, line_type, sub_type, status, material_source, item_id, spec,
                               quantity, price_basis, unit_price, line_total, suggested_advance, is_customized,
                               customized_reason_code, notes, created_by, actor_role_at_creation)
       VALUES ($1, $2, $3, $4, $5, 'ASSIGNED', $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING line_id`,
      [
        orderId,
        lineNumber,
        lineNo,
        p.priced.line_type,
        p.priced.sub_type,
        p.input.material_source,
        p.item_id,
        JSON.stringify(v.spec),
        p.priced.quantity,
        p.priced.price_basis,
        p.priced.unit_price,
        p.priced.line_total,
        v.suggested_advance,
        p.priced.is_customized,
        v.reason,
        p.input.notes ?? null,
        actor.user_id,
        actor.role,
      ],
    );
    return line_id;
  }

  private async updateLine(em: EntityManager, lineId: string, p: PricedInput): Promise<void> {
    const v = this.lineValues(p);
    await em.query(
      `UPDATE order_line SET line_type = $2, sub_type = $3, material_source = $4, item_id = $5, spec = $6::jsonb, quantity = $7,
              price_basis = $8, unit_price = $9, line_total = $10, suggested_advance = $11, is_customized = $12,
              customized_reason_code = $13, notes = $14, status = 'ASSIGNED', version = version + 1
       WHERE line_id = $1`,
      [
        lineId,
        p.priced.line_type,
        p.priced.sub_type,
        p.input.material_source,
        p.item_id,
        JSON.stringify(v.spec),
        p.priced.quantity,
        p.priced.price_basis,
        p.priced.unit_price,
        p.priced.line_total,
        v.suggested_advance,
        p.priced.is_customized,
        v.reason,
        p.input.notes ?? null,
      ],
    );
  }

  private async assignWorkers(em: EntityManager, lineId: string, workerIds: string[], actor: Actor): Promise<void> {
    for (const id of new Set(workerIds)) {
      await em.query(`INSERT INTO line_assignment (line_id, employee_id, assigned_by) VALUES ($1, $2, $3)`, [lineId, id, actor.user_id]);
    }
  }
}

/** Audit detail: customized sub-jobs whose advance the supervisor changed from the suggestion. */
function advanceOverrides(lines: PricedInput[]) {
  const changed = lines
    .map((l, i) => ({ line: i + 1, suggested: l.suggested_advance, entered: l.advance }))
    .filter((l) => l.suggested !== l.entered);
  return changed.length ? { advance_overrides: changed } : {};
}
