import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkOrderStatus, WorkOrderType, PricingModel, Role } from '@erp/shared';

@Entity('work_order')
export class WorkOrderEntity {
  @PrimaryGeneratedColumn('uuid')
  work_order_id: string;

  @Column({ unique: true })
  work_order_number: string;

  @Column({ type: 'uuid' })
  job_card_id: string;

  @Column({ type: 'uuid' })
  created_by: string;

  @Column({ type: 'enum', enum: WorkOrderStatus, default: WorkOrderStatus.PENDING })
  status: WorkOrderStatus;

  @Column({ type: 'enum', enum: WorkOrderType })
  work_order_type: WorkOrderType;

  @Column({ type: 'enum', enum: PricingModel })
  pricing_model: PricingModel;

  @Column({ type: 'jsonb', nullable: true })
  spec: Record<string, unknown> | null;

  @Column({ type: 'int', nullable: true })
  quantity: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 3, nullable: true })
  weight_kg: number | null;

  @Column({ type: 'int' })
  price: number;

  @Column({ default: false })
  customer_supplied: boolean;

  @Column({ default: false })
  is_customized: boolean;

  @Column({ type: 'varchar', nullable: true })
  customized_reason_code: string | null;

  @Column({ type: 'uuid', nullable: true })
  gate_pass_id: string | null;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'enum', enum: Role, nullable: true })
  actor_role_at_creation: Role | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}