import { ConflictException, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ItemType, itemDuplicateKey, type CreateItemDto } from '@erp/shared';
import { ERR, errWith } from '../../common/errors';
import type { Actor } from '../../common/actor';
import { AuditService } from '../../core/audit.service';
import { EventsService } from '../../core/events.service';

/** The fields that describe a product, before it has a SKU and price. */
export type ItemDraft = Pick<
  CreateItemDto,
  'name' | 'item_type' | 'category' | 'unit' | 'attributes'
>;

/** Who added a product: a branch user, or head office (no branch). */
export type CatalogActor = Pick<Actor, 'user_id' | 'role'> & {
  branch_id: string | null;
};

/**
 * The only writer of new catalogue items (Docs/decisions/0013). A new active item is priced
 * and offered at every branch at once, so it must not collide with an existing one:
 * pricing finds sheets by material + thickness and coils by origin + thickness + colour.
 */
@Injectable()
export class ItemCatalogService {
  constructor(
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  /** 409 ITEM_DUPLICATE when an active item is already this product. */
  async assertNew(em: EntityManager, draft: ItemDraft): Promise<void> {
    const key = itemDuplicateKey(draft.item_type, draft.attributes);
    const rows: {
      sku: string;
      name: string;
      attributes: Record<string, string>;
    }[] = key
      ? await em.query(
          `SELECT sku, name, attributes FROM item WHERE is_active AND item_type = $1::item_type_enum`,
          [draft.item_type],
        )
      : await em.query(
          `SELECT sku, name, attributes FROM item WHERE is_active AND item_type = $1::item_type_enum AND lower(name) = lower($2)`,
          [draft.item_type, draft.name.trim()],
        );
    const same = key
      ? rows.find(
          (r) => itemDuplicateKey(draft.item_type, r.attributes) === key,
        )
      : rows[0];
    if (same) {
      throw new ConflictException(
        errWith(
          ERR.ITEM_DUPLICATE,
          { sku: same.sku, name: same.name },
          `Already in the catalogue as ${same.name} (${same.sku})`,
        ),
      );
    }
  }

  /**
   * Adds the product (call inside the caller's transaction). One add at a time, so two
   * approvals of the same product can't both pass the duplicate check.
   */
  async createItem(
    em: EntityManager,
    item: CreateItemDto,
    actor: CatalogActor,
  ): Promise<string> {
    await em.query(`SELECT pg_advisory_xact_lock(hashtext('item_catalog'))`);
    const taken: unknown[] = await em.query(
      `SELECT 1 FROM item WHERE upper(sku) = upper($1)`,
      [item.sku],
    );
    if (taken.length > 0) throw new ConflictException(ERR.ITEM_SKU_TAKEN);
    await this.assertNew(em, item);
    const [{ item_id }]: { item_id: string }[] = await em.query(
      `INSERT INTO item (sku, name, item_type, category, unit, attributes, price, unit_cost, updated_by)
       VALUES ($1, $2, $3::item_type_enum, $4, $5, $6::jsonb, $7, $8, $9) RETURNING item_id`,
      [
        item.sku,
        item.name,
        item.item_type,
        item.category,
        item.unit,
        JSON.stringify(cleanAttributes(item.item_type, item.attributes)),
        item.price,
        item.unit_cost,
        actor.user_id,
      ],
    );
    return item_id;
  }

  /** After commit: audit the new item and tell every screen (prices and stock lists) to refresh. */
  created(
    itemId: string,
    item: CreateItemDto,
    actor: CatalogActor,
    requestId?: string,
  ): void {
    this.audit.record(actor, { type: 'item', id: itemId }, 'CREATE', {
      after: {
        sku: item.sku,
        name: item.name,
        item_type: item.item_type,
        price: item.price,
        unit_cost: item.unit_cost,
        request_id: requestId ?? null,
      },
    });
    this.events.changedEverywhere('prices', 'stock');
  }
}

/** Keep only the attributes the type uses, without blanks. */
function cleanAttributes(
  itemType: ItemType,
  attributes: ItemDraft['attributes'],
): Record<string, string> {
  const keep: Record<ItemType, string[]> = {
    [ItemType.MATERIAL]: ['material_type', 'thickness'],
    [ItemType.COIL]: ['origin', 'thickness', 'color'],
    [ItemType.HARDWARE]: ['size'],
  };
  return Object.fromEntries(
    Object.entries(attributes).filter(
      ([k, v]) => keep[itemType].includes(k) && !!v,
    ),
  );
}
