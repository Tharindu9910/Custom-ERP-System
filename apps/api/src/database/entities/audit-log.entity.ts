import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Role } from '@erp/shared';

@Entity('audit_log')
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  log_id: string;

  @Column({ type: 'uuid', nullable: true })
  branch_id: string | null;

  @Column()
  entity_type: string;

  @Column({ type: 'uuid', nullable: true })
  entity_id: string | null;

  @Column()
  action: string;

  @Column({ type: 'uuid', nullable: true })
  actor_id: string | null;

  @Column({ type: 'enum', enum: Role, nullable: true })
  actor_role: Role | null;

  @Column({ type: 'jsonb', nullable: true })
  before: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  after: Record<string, unknown> | null;

  @Column({ type: 'int', nullable: true })
  entity_version: number | null;

  @CreateDateColumn()
  created_at: Date;
}
