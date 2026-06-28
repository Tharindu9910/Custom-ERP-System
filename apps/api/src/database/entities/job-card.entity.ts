import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { JobCardStatus, Role } from '@erp/shared';

@Entity('job_card')
export class JobCardEntity {
  @PrimaryGeneratedColumn('uuid')
  job_card_id: string;

  @Column({ unique: true })
  job_card_number: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column({ type: 'uuid' })
  customer_id: string;

  @Column({ type: 'uuid' })
  created_by: string;

  @Column({ type: 'enum', enum: JobCardStatus, default: JobCardStatus.DRAFT })
  status: JobCardStatus;

  @Column({ type: 'varchar' })
  section_type: string;

  @Column({ type: 'varchar' })
  service_type: string;

  @Column({ type: 'int', default: 0 })
  balance_due: number;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ default: false })
  is_legacy: boolean;

  @Column({ type: 'enum', enum: Role, nullable: true })
  actor_role_at_creation: Role | null;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
