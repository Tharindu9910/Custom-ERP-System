import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ItemType } from '@erp/shared';

/**
 * Catalogue item.
 * COIL attributes: { origin, thickness, color } — stocked in ft.
 * MATERIAL attributes: { material_type, thickness } — stocked in sheets.
 */
export interface ItemAttributes {
  origin?: string;
  thickness?: string;
  color?: string;
  material_type?: string;
  size?: string;
}

@Entity('item')
export class ItemEntity {
  @PrimaryGeneratedColumn('uuid')
  item_id: string;

  @Column({ unique: true })
  sku: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: ItemType, enumName: 'item_type_enum' })
  item_type: ItemType;

  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  @Column()
  unit: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  attributes: ItemAttributes;

  // Cents
  @Column({ type: 'int', default: 0 })
  unit_cost: number;

  @Column({ type: 'int', default: 0 })
  price: number;

  @Column({ default: true })
  is_active: boolean;

  // Who last changed the price on the Price List page
  @Column({ type: 'uuid', nullable: true })
  updated_by: string | null;

  @UpdateDateColumn()
  updated_at: Date;
}
