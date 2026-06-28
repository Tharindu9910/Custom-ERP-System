import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkOrderType, PricingModel } from '@erp/shared';

@Entity('price_list_entry')
export class PriceListEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  entry_id: string;

  @Column({ type: 'uuid', nullable: true })
  branch_id: string | null;

  @Column({ type: 'enum', enum: WorkOrderType })
  work_order_type: WorkOrderType;

  @Column()
  material_type: string;

  @Column({ type: 'varchar', nullable: true })
  thickness_or_size: string | null;

  @Column({ type: 'enum', enum: PricingModel })
  pricing_model: PricingModel;

  @Column({ type: 'int' })
  rate: number;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}