import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { JobCardStatus, Role } from '@erp/shared';

@Entity('job_status_log')
export class JobStatusLogEntity {
  @PrimaryGeneratedColumn('uuid')
  log_id: string;

  @Column({ type: 'uuid' })
  job_card_id: string;

  @Column({ type: 'enum', enum: JobCardStatus })
  from_status: JobCardStatus;

  @Column({ type: 'enum', enum: JobCardStatus })
  to_status: JobCardStatus;

  @Column({ type: 'uuid' })
  changed_by: string;

  @Column({ type: 'enum', enum: Role, nullable: true })
  actor_role: Role | null;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @CreateDateColumn()
  changed_at: Date;
}