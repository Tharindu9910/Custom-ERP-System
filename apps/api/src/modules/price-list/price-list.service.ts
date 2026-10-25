import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import type {
  CreatePriceRateDto,
  ItemPriceQuery,
  ItemPriceView,
  PriceRateQuery,
  PriceRateView,
  UpdateItemPriceDto,
  UpdatePriceRateDto,
} from '@erp/shared';
import { ERR } from '../../common/errors';
import type { RequestUser } from '../../common/types';
import { AuditService } from '../../core/audit.service';
import { EventsService } from '../../core/events.service';
import { ItemEntity } from '../../database/entities/item.entity';
import { PriceRateEntity } from '../../database/entities/price-rate.entity';

const RATE_COLUMNS = `rate_id, line_type, sub_type, variant, work_type, thickness_or_size, material_source, price_basis, rate, is_active, updated_at`;
const ITEM_COLUMNS = `item_id, sku, name, item_type, category, unit, attributes, price, unit_cost, is_active`;

/** idx_price_rate_lookup: only one active rate per key */
const isDuplicate = (e: unknown) => e instanceof QueryFailedError && (e as QueryFailedError & { code?: string }).code === '23505';

/**
 * The price list: work rates (price_rate) and catalogue item prices (item).
 * One list for every branch (Docs/decisions/0004), so nothing here takes a branch.
 * Orders keep the price they were saved with (order_line.unit_price), so edits only affect new quotes.
 */
@Injectable()
export class PriceListService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  listRates(q: PriceRateQuery): Promise<PriceRateView[]> {
    return this.ds.query(
      `SELECT ${RATE_COLUMNS} FROM price_rate
       WHERE ($1::line_type_enum IS NULL OR line_type = $1) AND ($2 OR is_active)
       ORDER BY line_type, sub_type NULLS FIRST, variant NULLS FIRST, work_type NULLS FIRST,
                thickness_or_size NULLS FIRST, material_source, is_active DESC`,
      [q.line_type ?? null, !!q.include_inactive],
    );
  }

  async createRate(dto: CreatePriceRateDto, actor: RequestUser): Promise<PriceRateView> {
    const repo = this.ds.getRepository(PriceRateEntity);
    let saved: PriceRateEntity;
    try {
      saved = await repo.save(
        repo.create({
          line_type: dto.line_type,
          sub_type: dto.sub_type ?? null,
          variant: dto.variant ?? null,
          work_type: dto.work_type ?? null,
          thickness_or_size: dto.thickness_or_size ?? null,
          material_source: dto.material_source,
          price_basis: dto.price_basis,
          rate: dto.rate,
          created_by: actor.user_id,
          updated_by: actor.user_id,
        }),
      );
    } catch (e) {
      if (isDuplicate(e)) throw new ConflictException(ERR.PRICE_RATE_DUPLICATE);
      throw e;
    }
    this.audit.record({ ...actor, branch_id: null }, { type: 'price_rate', id: saved.rate_id }, 'CREATE', { after: { ...dto } });
    this.events.changedEverywhere('prices');
    return this.getRate(saved.rate_id);
  }

  /** Amount, basis and active state can change; the key fields can't (deactivate and add a new rate). */
  async updateRate(id: string, dto: UpdatePriceRateDto, actor: RequestUser): Promise<PriceRateView> {
    const repo = this.ds.getRepository(PriceRateEntity);
    const rate = await repo.findOneBy({ rate_id: id });
    if (!rate) throw new NotFoundException(ERR.PRICE_RATE_NOT_FOUND);

    const changed = (Object.keys(dto) as (keyof UpdatePriceRateDto)[]).filter((k) => dto[k] !== undefined && dto[k] !== rate[k]);
    if (changed.length === 0) return this.getRate(id);
    const before = Object.fromEntries(changed.map((k) => [k, rate[k]]));
    Object.assign(rate, Object.fromEntries(changed.map((k) => [k, dto[k]])), { updated_by: actor.user_id });
    try {
      await repo.save(rate);
    } catch (e) {
      // Reactivating a rate whose key another active rate already has
      if (isDuplicate(e)) throw new ConflictException(ERR.PRICE_RATE_DUPLICATE);
      throw e;
    }
    this.audit.record({ ...actor, branch_id: null }, { type: 'price_rate', id }, 'UPDATE', {
      before,
      after: Object.fromEntries(changed.map((k) => [k, rate[k]])),
    });
    this.events.changedEverywhere('prices');
    return this.getRate(id);
  }

  listItems(q: ItemPriceQuery): Promise<ItemPriceView[]> {
    const search = q.q ? `%${q.q.replace(/[%_\\]/g, '\\$&')}%` : null;
    return this.ds.query(
      `SELECT ${ITEM_COLUMNS} FROM item
       WHERE ($1::item_type_enum IS NULL OR item_type = $1)
         AND ($2::text IS NULL OR name ILIKE $2 OR sku ILIKE $2 OR category ILIKE $2)
       ORDER BY item_type, category NULLS LAST, name`,
      [q.item_type ?? null, search],
    );
  }

  async updateItemPrice(id: string, dto: UpdateItemPriceDto, actor: RequestUser): Promise<ItemPriceView> {
    const repo = this.ds.getRepository(ItemEntity);
    const item = await repo.findOneBy({ item_id: id });
    if (!item) throw new NotFoundException(ERR.PRICE_ITEM_NOT_FOUND);

    const changed = (['price', 'unit_cost'] as const).filter((k) => dto[k] !== undefined && dto[k] !== item[k]);
    if (changed.length > 0) {
      const before = Object.fromEntries(changed.map((k) => [k, item[k]]));
      for (const k of changed) item[k] = dto[k]!;
      item.updated_by = actor.user_id;
      await repo.save(item);
      this.audit.record({ ...actor, branch_id: null }, { type: 'item_price', id }, 'UPDATE', {
        before: { sku: item.sku, ...before },
        after: Object.fromEntries(changed.map((k) => [k, item[k]])),
      });
      this.events.changedEverywhere('prices');
    }
    const [row] = await this.ds.query(`SELECT ${ITEM_COLUMNS} FROM item WHERE item_id = $1`, [id]);
    return row;
  }

  private async getRate(id: string): Promise<PriceRateView> {
    const [row] = await this.ds.query(`SELECT ${RATE_COLUMNS} FROM price_rate WHERE rate_id = $1`, [id]);
    return row;
  }
}
