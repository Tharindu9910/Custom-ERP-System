import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { AllocationStatus } from '@erp/shared';

// Customer material on a gate pass, reserved by a draft (30 min) and committed to an order.
@Entity('material_allocation')
export class MaterialAllocationEntity {
  @PrimaryGeneratedColumn('uuid')
  allocation_id: string;

  @Column({ type: 'uuid' })
  gp_item_id: string;

  // Set on commit (addition to ER-v6 — material is reserved per order)
  @Column({ type: 'uuid', nullable: true })
  order_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  line_id: string | null;

  // Set while the order form is still a draft
  @Column({ type: 'varchar', nullable: true })
  draft_id: string | null;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'enum', enum: AllocationStatus, enumName: 'allocation_status_enum', default: AllocationStatus.RESERVED })
  status: AllocationStatus;

  @Column({ type: 'varchar', nullable: true })
  release_reason: string | null;

  @Column({ type: 'uuid', nullable: true })
  accepted_by: string | null;

  @Column({ type: 'timestamp', nullable: true })
  expires_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  released_at: Date | null;
}
