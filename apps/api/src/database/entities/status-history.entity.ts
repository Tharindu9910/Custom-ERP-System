import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { HistoryEventType, InspectionResult, Role } from '@erp/shared';

// Append-only: who did what, when and why, for orders and their lines.
@Entity('status_history')
export class StatusHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  history_id: string;

  @Column({ type: 'uuid' })
  order_id: string;

  @Column({ type: 'uuid', nullable: true })
  line_id: string | null;

  @Column({ type: 'enum', enum: HistoryEventType, enumName: 'history_event_type_enum' })
  event_type: HistoryEventType;

  @Column({ type: 'varchar', nullable: true })
  from_status: string | null;

  @Column({ type: 'varchar', nullable: true })
  to_status: string | null;

  @Column({ type: 'enum', enum: InspectionResult, enumName: 'inspection_result_enum', nullable: true })
  result: InspectionResult | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'uuid' })
  actor_id: string;

  @Column({ type: 'enum', enum: Role, enumName: 'role_enum', nullable: true })
  actor_role: Role | null;

  @CreateDateColumn()
  created_at: Date;
}
