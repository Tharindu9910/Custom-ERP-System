import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('hardware_store_item')
export class HardwareStoreItemEntity {
  @PrimaryGeneratedColumn('uuid')
  item_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  sku: string | null;

  @Column({ type: 'varchar', nullable: true })
  unit: string | null;

  @Column({ type: 'int', default: 0 })
  stock_quantity: number;

  @Column({ type: 'int', default: 0 })
  low_stock_threshold: number;

  @Column({ type: 'int', default: 0 })
  unit_cost: number;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}