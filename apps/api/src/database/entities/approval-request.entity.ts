import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ApprovalStatus, ApprovalType } from '@erp/shared';

@Entity('approval_request')
export class ApprovalRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  approval_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column({ type: 'enum', enum: ApprovalType, enumName: 'approval_type_enum' })
  request_type: ApprovalType;

  @Column()
  entity_type: string;

  @Column({ type: 'uuid' })
  entity_id: string;

  @Column({ type: 'int', nullable: true })
  amount: number | null;

  @Column({ type: 'varchar', nullable: true })
  reason_code: string | null;

  @Column({ type: 'text', nullable: true })
  reason_detail: string | null;

  // Cancellation: status restored if the request is rejected
  @Column({ type: 'varchar', nullable: true })
  prior_status: string | null;

  @Column({ type: 'boolean', nullable: true })
  materials_consumed: boolean | null;

  @Column({ type: 'uuid', nullable: true })
  attested_by: string | null;

  @Column({ type: 'timestamp', nullable: true })
  attested_at: Date | null;

  @Column({ type: 'enum', enum: ApprovalStatus, enumName: 'approval_status_enum', default: ApprovalStatus.PENDING })
  status: ApprovalStatus;

  @Column({ type: 'uuid' })
  requested_by: string;

  @Column({ type: 'uuid', nullable: true })
  decided_by: string | null;

  @Column({ type: 'text', nullable: true })
  decision_note: string | null;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  decided_at: Date | null;
}
