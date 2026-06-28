import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ConflictStatus } from '@erp/shared';

@Entity('conflict_queue')
export class ConflictQueueEntity {
  @PrimaryGeneratedColumn('uuid')
  conflict_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column()
  entity_type: string;

  @Column({ type: 'uuid' })
  entity_id: string;

  @Column({ type: 'uuid' })
  reported_by: string;

  @Column({ type: 'jsonb' })
  client_snapshot: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  server_snapshot: Record<string, unknown>;

  @Column({ type: 'enum', enum: ConflictStatus, default: ConflictStatus.PENDING })
  status: ConflictStatus;

  @Column({ type: 'uuid', nullable: true })
  resolved_by: string | null;

  @Column({ type: 'text', nullable: true })
  resolution_note: string | null;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  resolved_at: Date | null;
}