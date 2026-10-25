import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { LineSubType, LineType, MaterialSource, PriceBasis } from '@erp/shared';

// Workshop and roofing rates — one price list for every branch (Docs/decisions/0004).
@Entity('price_rate')
export class PriceRateEntity {
  @PrimaryGeneratedColumn('uuid')
  rate_id: string;

  @Column({ type: 'enum', enum: LineType, enumName: 'line_type_enum' })
  line_type: LineType;

  @Column({ type: 'enum', enum: LineSubType, enumName: 'line_sub_type_enum', nullable: true })
  sub_type: LineSubType | null;

  // Material type / roofing category / accessory / coil-cutting range
  @Column({ type: 'varchar', nullable: true })
  variant: string | null;

  @Column({ type: 'varchar', nullable: true })
  work_type: string | null;

  @Column({ type: 'varchar', nullable: true })
  thickness_or_size: string | null;

  @Column({ type: 'enum', enum: MaterialSource, enumName: 'material_source_enum', default: MaterialSource.BRANCH })
  material_source: MaterialSource;

  @Column({ type: 'enum', enum: PriceBasis, enumName: 'price_basis_enum' })
  price_basis: PriceBasis;

  // Cents
  @Column({ type: 'int' })
  rate: number;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;

  @Column({ type: 'uuid', nullable: true })
  updated_by: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
