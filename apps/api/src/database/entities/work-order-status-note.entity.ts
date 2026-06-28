import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Role } from '@erp/shared';

@Entity('work_order_status_note')
export class WorkOrderStatusNoteEntity {
  @PrimaryGeneratedColumn('uuid')
  note_id: string;

  @Column({ type: 'uuid' })
  work_order_id: string;

  @Column({ type: 'uuid' })
  written_by: string;

  @Column({ type: 'enum', enum: Role, nullable: true })
  actor_role: Role | null;

  @Column({ type: 'text' })
  note: string;

  @CreateDateColumn()
  written_at: Date;
}