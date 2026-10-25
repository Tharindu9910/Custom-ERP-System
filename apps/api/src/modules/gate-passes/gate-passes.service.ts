import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import {
  BranchType,
  GatePassStatus,
  Role,
  phoneKey,
  type CreateGatePassDto,
  type GatePassQuery,
} from '@erp/shared';
import type { Actor } from '../../common/actor';
import { ERR } from '../../common/errors';
import { AuditService } from '../../core/audit.service';
import { BranchContextService } from '../../core/branch-context.service';
import { EventsService } from '../../core/events.service';
import { NumberService } from '../../core/number.service';
import { CustomersService } from '../customers/customers.service';
import { buildGatePassViews, type GatePassRow, type GatePassView } from './gate-pass-view';

const ROW_SELECT = `
  SELECT gp.gate_pass_id, gp.pass_number, gp.branch_id, gp.customer_id, c.name AS customer_name, c.phone AS customer_phone,
         gp.notes, u.full_name AS issued_by_name, gp.created_at
  FROM gate_pass gp
  JOIN customer c ON c.customer_id = gp.customer_id
  LEFT JOIN "user" u ON u.user_id = gp.issued_by`;

// created_at is stored as UTC; filters use the branch's local day
const LOCAL_DAY = `((gp.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Colombo')::date`;

@Injectable()
export class GatePassesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly numbers: NumberService,
    private readonly customers: CustomersService,
    private readonly branches: BranchContextService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  async create(dto: CreateGatePassDto, actor: Actor): Promise<GatePassView> {
    const existing = await this.findByRequestId(dto.client_request_id, actor.branch_id);
    if (existing) return existing;

    const branch = await this.branches.get(actor.branch_id);
    // Workshop-only branches don't record colour for supervisors and chiefs (prototype rule)
    const dropColor =
      branch.branch_type === BranchType.WORKSHOP && (actor.role === Role.SUPERVISOR || actor.role === Role.CHIEF);

    const id = await this.ds.transaction(async (em) => {
      const customerId = await this.customers.findOrCreateForIntake(em, dto.customer, actor.branch_id, actor.user_id);
      const passNumber = await this.numbers.next(em, 'GATE_PASS', branch.settings.number_prefixes);
      const [{ gate_pass_id }]: { gate_pass_id: string }[] = await em.query(
        `INSERT INTO gate_pass (branch_id, customer_id, pass_number, notes, issued_by, client_request_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING gate_pass_id`,
        [actor.branch_id, customerId, passNumber, dto.notes ?? null, actor.user_id, dto.client_request_id],
      );
      for (const item of dto.items) {
        await em.query(
          `INSERT INTO gate_pass_item (gate_pass_id, material_type, thickness, length, length_unit, color, quantity, condition_note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            gate_pass_id,
            item.material_type,
            item.thickness ?? null,
            item.length ?? null,
            item.length !== undefined ? item.length_unit : null,
            dropColor ? null : (item.color ?? null),
            item.quantity ?? 1,
            item.condition_note ?? null,
          ],
        );
      }
      return gate_pass_id;
    });

    this.audit.record(actor, { type: 'gate_pass', id }, 'CREATE', { after: { items: dto.items.length } });
    this.events.changed(actor.branch_id, 'gate_passes');
    return this.get(id, actor.branch_id);
  }

  async list(query: GatePassQuery, branchId: string): Promise<{ rows: GatePassView[]; counts: { total: number; available: number } }> {
    const params: unknown[] = [branchId];
    const where = ['gp.branch_id = $1'];
    if (query.search) {
      params.push(`%${query.search}%`);
      where.push(`(gp.pass_number ILIKE $${params.length} OR c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length})`);
    }
    if (query.from) {
      params.push(query.from);
      where.push(`${LOCAL_DAY} >= $${params.length}::date`);
    }
    if (query.to) {
      params.push(query.to);
      where.push(`${LOCAL_DAY} <= $${params.length}::date`);
    }
    const rows: GatePassRow[] = await this.ds.query(`${ROW_SELECT} WHERE ${where.join(' AND ')} ORDER BY gp.created_at DESC`, params);
    const views = await buildGatePassViews(this.ds.manager, rows);

    const filtered = views.filter((v) => {
      if (query.status === 'ALL') return true;
      if (query.status === 'AVAILABLE') return v.summary.has_available;
      return v.summary.status === query.status;
    });

    // Counts over the search/date-filtered set, so each count matches its list
    return {
      rows: filtered,
      counts: { total: views.length, available: views.filter((v) => v.summary.has_available).length },
    };
  }

  async get(gatePassId: string, branchId: string, em: EntityManager = this.ds.manager): Promise<GatePassView> {
    const rows: GatePassRow[] = await em.query(`${ROW_SELECT} WHERE gp.gate_pass_id = $1 AND gp.branch_id = $2`, [gatePassId, branchId]);
    if (rows.length === 0) throw new NotFoundException(ERR.GATE_PASS_NOT_FOUND);
    const [view] = await buildGatePassViews(em, rows);
    return view;
  }

  /** The customer's passes that still have material to allocate (plus one already assigned). */
  async available(phone: string, branchId: string, includeId?: string): Promise<GatePassView[]> {
    const key = phoneKey(phone);
    if (key.length < 7 && !includeId) return [];
    const rows: GatePassRow[] = await this.ds.query(
      `${ROW_SELECT}
       WHERE gp.branch_id = $1 AND (right(regexp_replace(c.phone, '\\D', '', 'g'), 9) = $2 OR gp.gate_pass_id = $3)
       ORDER BY gp.created_at DESC`,
      [branchId, key, includeId ?? null],
    );
    const views = await buildGatePassViews(this.ds.manager, rows);
    return views.filter((v) => v.summary.has_available || v.gate_pass_id === includeId);
  }

  /**
   * Keeps the stored OPEN/CLOSED status in step with the derived one, after the
   * work on a linked order completes or an allocation changes.
   */
  async syncStoredStatus(em: EntityManager, gatePassIds: string[], branchId: string): Promise<void> {
    for (const id of new Set(gatePassIds)) {
      const view = await this.get(id, branchId, em);
      const closed = view.summary.status === 'CLOSED';
      await em.query(
        `UPDATE gate_pass SET status = $2, closed_at = $3 WHERE gate_pass_id = $1 AND status <> $2`,
        [id, closed ? GatePassStatus.CLOSED : GatePassStatus.OPEN, closed ? (view.summary.closed_at ?? new Date()) : null],
      );
    }
  }

  private async findByRequestId(requestId: string, branchId: string): Promise<GatePassView | null> {
    const rows: { gate_pass_id: string }[] = await this.ds.query(
      `SELECT gate_pass_id FROM gate_pass WHERE client_request_id = $1 AND branch_id = $2`,
      [requestId, branchId],
    );
    return rows[0] ? this.get(rows[0].gate_pass_id, branchId) : null;
  }
}
