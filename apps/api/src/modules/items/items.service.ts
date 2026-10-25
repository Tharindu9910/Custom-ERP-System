import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import { coilDetails, type RoofingConfig } from '@erp/shared';
import { BranchContextService } from '../../core/branch-context.service';

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

/** Catalogue items as the order forms need them. */
@Injectable()
export class ItemsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly branches: BranchContextService,
  ) {}

  /** Coils the branch's roofing settings allow (thickness, colour, origin), with own stock. */
  async coils(branchId: string, em: EntityManager = this.ds.manager): Promise<CoilOption[]> {
    const roofing = (await this.branches.get(branchId)).settings.roofing;
    const rows: { item_id: string; sku: string; attributes: Record<string, string>; stock: string | null }[] = await em.query(
      `SELECT i.item_id, i.sku, i.attributes, s.quantity - s.reserved_quantity AS stock
       FROM item i LEFT JOIN branch_stock s ON s.item_id = i.item_id AND s.branch_id = $1
       WHERE i.item_type = 'COIL' AND i.is_active = true
       ORDER BY i.sku`,
      [branchId],
    );
    return rows
      .filter((r) => coilAllowed(r.attributes, roofing))
      .map((r) => ({
        item_id: r.item_id,
        sku: r.sku,
        thickness: r.attributes.thickness,
        color: r.attributes.color,
        origin: r.attributes.origin,
        details: coilDetails(r.attributes),
        stock_ft: Number(r.stock ?? 0),
      }));
  }
}

export const coilAllowed = (attrs: Record<string, string>, roofing: RoofingConfig) =>
  roofing.coil_thicknesses.includes(attrs.thickness) && roofing.coil_colors.includes(attrs.color) && roofing.coil_origins.includes(attrs.origin);
