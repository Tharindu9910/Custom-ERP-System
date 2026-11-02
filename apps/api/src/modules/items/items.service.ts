import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { coilDetails, type CreateItemDto, type RoofingConfig } from '@erp/shared';
import type { RequestUser } from '../../common/types';
import { BranchContextService } from '../../core/branch-context.service';
import { ItemCatalogService } from './item-catalog.service';

export interface CoilOption {
  item_id: string;
  sku: string;
  thickness: string;
  color: string;
  origin: string;
  /** "0.47mm · Red · China" */
  details: string;
  /** This branch's available stock in ft: on hand minus what open orders hold (BR06: own branch only) */
  stock_ft: number;
}

export interface WorkshopCoilOption extends CoilOption {
  /** Catalogue name, e.g. "CN 0.35mm Blue coil" — what a Coil Cutting sub-job records as its material */
  name: string;
}

/** A sheet material at this branch: what a branch Cut/Bend sub-job holds. */
export interface WorkshopMaterialStock {
  item_id: string;
  material_type: string;
  thickness: string;
  unit: string;
  /** On hand minus what open orders hold */
  available: number;
}

/** Everything the job card form needs from the inventory, in one call (Docs/decisions/0009). */
export interface WorkshopCatalog {
  materials: WorkshopMaterialStock[];
  coils: WorkshopCoilOption[];
  /** Saving more than is available can go through the stock override */
  override_allowed: boolean;
}

interface CoilRow {
  item_id: string;
  sku: string;
  name: string;
  attributes: Record<string, string>;
  stock: string | null;
}

const toCoilOption = (r: CoilRow): CoilOption => ({
  item_id: r.item_id,
  sku: r.sku,
  thickness: r.attributes.thickness,
  color: r.attributes.color,
  origin: r.attributes.origin,
  details: coilDetails(r.attributes),
  stock_ft: Number(r.stock ?? 0),
});

/** Catalogue items as the order forms need them. */
@Injectable()
export class ItemsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly branches: BranchContextService,
    private readonly catalog: ItemCatalogService,
  ) {}

  /**
   * The categories and units already used in the catalogue, per item type: the choices on the
   * New item form, so a new product doesn't start a near-duplicate category (Docs/decisions/0013).
   */
  async catalogOptions(): Promise<Record<string, { categories: string[]; units: string[] }>> {
    const rows: { item_type: string; categories: string[]; units: string[] }[] = await this.ds.query(
      `SELECT item_type, array_agg(DISTINCT category ORDER BY category) FILTER (WHERE category IS NOT NULL) AS categories,
              array_agg(DISTINCT unit ORDER BY unit) AS units
       FROM item WHERE is_active GROUP BY item_type`,
    );
    return Object.fromEntries(rows.map((r) => [r.item_type, { categories: r.categories ?? [], units: r.units }]));
  }

  /** Head office adds a product directly (Docs/decisions/0013). It belongs to no branch. */
  async create(dto: CreateItemDto, user: RequestUser): Promise<{ item_id: string; sku: string }> {
    const actor = { user_id: user.user_id, role: user.role, branch_id: null };
    const itemId = await this.ds.transaction((em) => this.catalog.createItem(em, dto, actor));
    this.catalog.created(itemId, dto, actor);
    return { item_id: itemId, sku: dto.sku };
  }

  /** Coils the branch's roofing settings allow (thickness, colour, origin), with own stock. */
  async coils(branchId: string, em: EntityManager = this.ds.manager): Promise<CoilOption[]> {
    const roofing = (await this.branches.get(branchId)).settings.roofing;
    return (await this.coilRows(branchId, em)).filter((r) => coilAllowed(r.attributes, roofing)).map(toCoilOption);
  }

  /**
   * The job card form's inventory data, loaded once per form and refreshed by live
   * "stock" nudges: sheet stock for the shortage warning, every coil for Coil Cutting
   * (not limited by roofing settings), and whether a shortage can be overridden.
   */
  async workshopCatalog(branchId: string, em: EntityManager = this.ds.manager): Promise<WorkshopCatalog> {
    const [branch, coils, materials] = await Promise.all([
      this.branches.get(branchId),
      this.coilRows(branchId, em),
      em.query(
        `SELECT i.item_id, i.attributes->>'material_type' AS material_type, i.attributes->>'thickness' AS thickness, i.unit,
                COALESCE(s.quantity - s.reserved_quantity, 0) AS available
         FROM item i LEFT JOIN branch_stock s ON s.item_id = i.item_id AND s.branch_id = $1
         WHERE i.item_type = 'MATERIAL' AND i.is_active = true
           AND i.attributes->>'material_type' IS NOT NULL AND i.attributes->>'thickness' IS NOT NULL
         ORDER BY 2, 3`,
        [branchId],
      ) as Promise<(Omit<WorkshopMaterialStock, 'available'> & { available: string })[]>,
    ]);
    return {
      materials: materials.map((m) => ({ ...m, available: Number(m.available) })),
      coils: coils.map((r) => ({ ...toCoilOption(r), name: r.name })),
      override_allowed: branch.settings.stock_override_enabled && branch.stock_override_configured,
    };
  }

  private coilRows(branchId: string, em: EntityManager): Promise<CoilRow[]> {
    return em.query(
      `SELECT i.item_id, i.sku, i.name, i.attributes, s.quantity - s.reserved_quantity AS stock
       FROM item i LEFT JOIN branch_stock s ON s.item_id = i.item_id AND s.branch_id = $1
       WHERE i.item_type = 'COIL' AND i.is_active = true
       ORDER BY i.sku`,
      [branchId],
    );
  }
}

export const coilAllowed = (attrs: Record<string, string>, roofing: RoofingConfig) =>
  roofing.coil_thicknesses.includes(attrs.thickness) && roofing.coil_colors.includes(attrs.color) && roofing.coil_origins.includes(attrs.origin);
