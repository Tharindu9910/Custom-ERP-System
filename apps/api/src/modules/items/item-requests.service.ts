import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import {
  ItemRequestStatus,
  ItemType,
  type ApproveItemRequestDto,
  type CreateItemRequestDto,
  type ItemRequestQuery,
} from '@erp/shared';
import { ERR } from '../../common/errors';
import type { Actor } from '../../common/actor';
import { AuditService } from '../../core/audit.service';
import { EventsService } from '../../core/events.service';
import { RolePermissionsService } from '../../core/role-permissions.service';
import { StockService } from '../../core/stock.service';
import { ItemCatalogService } from './item-catalog.service';

export interface ItemRequestView {
  request_id: string;
  status: ItemRequestStatus;
  name: string;
  item_type: ItemType;
  category: string;
  unit: string;
  attributes: Record<string, string>;
  suggested_price: number | null;
  suggested_cost: number | null;
  note: string | null;
  requested_by: string;
  requested_by_name: string | null;
  created_at: Date;
  decided_by_name: string | null;
  decided_at: Date | null;
  reject_reason: string | null;
  /** The catalogue item, once approved */
  item: { item_id: string; sku: string; price: number } | null;
}

const HISTORY_LIMIT = 100;

const VIEW_SELECT = `
  SELECT r.request_id, r.status, r.name, r.item_type, r.category, r.unit, r.attributes, r.suggested_price, r.suggested_cost,
         r.note, r.requested_by, ru.full_name AS requested_by_name, r.created_at, du.full_name AS decided_by_name, r.decided_at,
         r.reject_reason, r.item_id, i.sku AS item_sku, i.price AS item_price
  FROM item_request r
  LEFT JOIN "user" ru ON ru.user_id = r.requested_by
  LEFT JOIN "user" du ON du.user_id = r.decided_by
  LEFT JOIN item i ON i.item_id = r.item_id`;

type ViewRow = Omit<ItemRequestView, 'item'> & {
  item_id: string | null;
  item_sku: string | null;
  item_price: number | null;
};
const toView = ({
  item_id,
  item_sku,
  item_price,
  ...r
}: ViewRow): ItemRequestView => ({
  ...r,
  item: item_id ? { item_id, sku: item_sku!, price: item_price! } : null,
});

/**
 * New catalogue products asked for by a branch (Docs/decisions/0013): maker–checker.
 * A supervisor's request waits as a draft (never in `item`) until the same branch's
 * manager approves it with the SKU, price and minimum, or rejects it with a reason.
 * A manager's own request is approved in the same step. Each step is audited.
 */
@Injectable()
export class ItemRequestsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly catalog: ItemCatalogService,
    private readonly stock: StockService,
    private readonly rolePermissions: RolePermissionsService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  async create(
    dto: CreateItemRequestDto,
    actor: Actor,
  ): Promise<ItemRequestView> {
    const existing = await this.findByClientId(
      dto.client_request_id,
      actor.branch_id,
    );
    if (existing) return existing;
    if (
      dto.approve &&
      !(await this.rolePermissions.has(actor.role, 'approve:item_request'))
    ) {
      throw new ForbiddenException(ERR.AUTH_INSUFFICIENT_PERMISSION);
    }

    const result = await this.ds.transaction(async (em) => {
      await this.catalog.assertNew(em, dto);
      const inserted: { request_id: string }[] = await em.query(
        `INSERT INTO item_request (client_request_id, branch_id, name, item_type, category, unit, attributes, suggested_price, suggested_cost, note, requested_by)
         VALUES ($1, $2, $3, $4::item_type_enum, $5, $6, $7::jsonb, $8, $9, $10, $11)
         ON CONFLICT (client_request_id) DO NOTHING RETURNING request_id`,
        [
          dto.client_request_id,
          actor.branch_id,
          dto.name,
          dto.item_type,
          dto.category,
          dto.unit,
          JSON.stringify(dto.attributes),
          dto.suggested_price ?? null,
          dto.suggested_cost ?? null,
          dto.note || null,
          actor.user_id,
        ],
      );
      // A retry that raced the first call: that one owns the request
      if (inserted.length === 0) return null;
      const request_id = inserted[0].request_id;
      const itemId = dto.approve
        ? await this.approveInTx(
            em,
            request_id,
            { ...dto, ...dto.approve },
            actor,
          )
        : null;
      return { request_id, itemId };
    });
    if (!result) {
      const first = await this.findByClientId(dto.client_request_id, actor.branch_id);
      // The request id belongs to another branch's request: not a replay of this one
      if (!first) throw new ConflictException(ERR.DUPLICATE);
      return first;
    }

    this.audit.record(
      actor,
      { type: 'item_request', id: result.request_id },
      'CREATE',
      {
        after: {
          name: dto.name,
          item_type: dto.item_type,
          category: dto.category,
          unit: dto.unit,
          attributes: dto.attributes,
        },
      },
    );
    if (result.itemId && dto.approve)
      this.approved(
        result.request_id,
        result.itemId,
        { ...dto, ...dto.approve },
        actor,
      );
    this.events.changed(actor.branch_id, 'item_requests');
    return this.get(result.request_id, actor.branch_id);
  }

  async approve(
    requestId: string,
    dto: ApproveItemRequestDto,
    actor: Actor,
  ): Promise<ItemRequestView> {
    const itemId = await this.ds.transaction(async (em) => {
      await this.lockPending(em, requestId, actor.branch_id);
      return this.approveInTx(em, requestId, dto, actor);
    });
    this.approved(requestId, itemId, dto, actor);
    this.events.changed(actor.branch_id, 'item_requests');
    return this.get(requestId, actor.branch_id);
  }

  async reject(
    requestId: string,
    reason: string,
    actor: Actor,
  ): Promise<ItemRequestView> {
    await this.ds.transaction(async (em) => {
      await this.lockPending(em, requestId, actor.branch_id);
      await em.query(
        `UPDATE item_request SET status = 'REJECTED', decided_by = $2, decided_at = now(), reject_reason = $3 WHERE request_id = $1`,
        [requestId, actor.user_id, reason],
      );
    });
    this.audit.record(
      actor,
      { type: 'item_request', id: requestId },
      'REJECT',
      { before: { status: 'PENDING' }, after: { status: 'REJECTED', reason } },
    );
    this.events.changed(actor.branch_id, 'item_requests');
    return this.get(requestId, actor.branch_id);
  }

  /** Only the person who asked, while it still waits. */
  async cancel(requestId: string, actor: Actor): Promise<ItemRequestView> {
    await this.ds.transaction(async (em) => {
      const r = await this.lockPending(em, requestId, actor.branch_id);
      if (r.requested_by !== actor.user_id)
        throw new ForbiddenException(ERR.ITEM_REQUEST_NOT_YOURS);
      await em.query(
        `UPDATE item_request SET status = 'CANCELLED', decided_at = now() WHERE request_id = $1`,
        [requestId],
      );
    });
    this.audit.record(
      actor,
      { type: 'item_request', id: requestId },
      'CANCEL',
      { before: { status: 'PENDING' }, after: { status: 'CANCELLED' } },
    );
    this.events.changed(actor.branch_id, 'item_requests');
    return this.get(requestId, actor.branch_id);
  }

  /** OPEN = waiting for approval; ALL = the latest requests of every status. */
  async list(
    q: ItemRequestQuery,
    branchId: string,
  ): Promise<{ rows: ItemRequestView[]; pending: number }> {
    const rows: ViewRow[] = await this.ds.query(
      `${VIEW_SELECT} WHERE r.branch_id = $1 ${q.status === 'OPEN' ? `AND r.status = 'PENDING'` : ''}
       ORDER BY (r.status = 'PENDING') DESC, r.created_at DESC LIMIT ${HISTORY_LIMIT}`,
      [branchId],
    );
    return { rows: rows.map(toView), ...(await this.count(branchId)) };
  }

  /** Sidebar badge for the manager: requests waiting at this branch. */
  async count(branchId: string): Promise<{ pending: number }> {
    const [c]: { pending: number }[] = await this.ds.query(
      `SELECT count(*)::int AS pending FROM item_request WHERE branch_id = $1 AND status = 'PENDING'`,
      [branchId],
    );
    return c;
  }

  async get(requestId: string, branchId: string): Promise<ItemRequestView> {
    const rows: ViewRow[] = await this.ds.query(
      `${VIEW_SELECT} WHERE r.request_id = $1 AND r.branch_id = $2`,
      [requestId, branchId],
    );
    if (rows.length === 0)
      throw new NotFoundException(ERR.ITEM_REQUEST_NOT_FOUND);
    return toView(rows[0]);
  }

  /** The item goes live, the branch starts keeping it at its minimum, the request links it. */
  private async approveInTx(
    em: EntityManager,
    requestId: string,
    dto: ApproveItemRequestDto,
    actor: Actor,
  ): Promise<string> {
    const itemId = await this.catalog.createItem(em, dto, actor);
    await this.stock.track(em, actor.branch_id, itemId, dto.reorder_level);
    await em.query(
      `UPDATE item_request SET status = 'APPROVED', decided_by = $2, decided_at = now(), item_id = $3 WHERE request_id = $1`,
      [requestId, actor.user_id, itemId],
    );
    return itemId;
  }

  private approved(
    requestId: string,
    itemId: string,
    dto: ApproveItemRequestDto,
    actor: Actor,
  ): void {
    this.audit.record(
      actor,
      { type: 'item_request', id: requestId },
      'APPROVE',
      {
        before: { status: 'PENDING' },
        after: {
          status: 'APPROVED',
          item_id: itemId,
          sku: dto.sku,
          price: dto.price,
          unit_cost: dto.unit_cost,
          reorder_level: dto.reorder_level,
        },
      },
    );
    this.catalog.created(itemId, dto, actor, requestId);
  }

  /** Another branch's request is "not found" (BR06); a decided one can't change. */
  private async lockPending(
    em: EntityManager,
    requestId: string,
    branchId: string,
  ): Promise<{ requested_by: string }> {
    const rows: { status: ItemRequestStatus; requested_by: string }[] =
      await em.query(
        `SELECT status, requested_by FROM item_request WHERE request_id = $1 AND branch_id = $2 FOR UPDATE`,
        [requestId, branchId],
      );
    if (rows.length === 0)
      throw new NotFoundException(ERR.ITEM_REQUEST_NOT_FOUND);
    if (rows[0].status !== ItemRequestStatus.PENDING)
      throw new ConflictException(ERR.ITEM_REQUEST_NOT_PENDING);
    return rows[0];
  }

  private async findByClientId(
    clientRequestId: string,
    branchId: string,
  ): Promise<ItemRequestView | null> {
    const rows: { request_id: string }[] = await this.ds.query(
      `SELECT request_id FROM item_request WHERE client_request_id = $1 AND branch_id = $2`,
      [clientRequestId, branchId],
    );
    return rows.length ? this.get(rows[0].request_id, branchId) : null;
  }
}
