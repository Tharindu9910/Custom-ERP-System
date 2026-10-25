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
  audit_id: string;

  @Column({ type: 'uuid', nullable: true })
  user_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  branch_id: string | null;

  @Column({ type: 'enum', enum: Role, nullable: true })
  actor_role: Role | null;

  @Column()
  entity_type: string;

  @Column({ type: 'uuid', nullable: true })
  entity_id: string | null;

  @Column({ type: 'int', nullable: true })
  entity_version: number | null;

  @Column()
  action: string;

  @Column({ type: 'jsonb', nullable: true })
  old_value: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  new_value: Record<string, unknown> | null;

  @Column({ type: 'varchar', nullable: true })
  ip_address: string | null;

  @CreateDateColumn()
  logged_at: Date;
}
