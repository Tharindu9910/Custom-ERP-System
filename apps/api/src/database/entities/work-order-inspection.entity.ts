import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('work_order_inspection')
export class WorkOrderInspectionEntity {
  @PrimaryGeneratedColumn('uuid')
  inspection_id: string;

  @Column({ type: 'uuid' })
  work_order_id: string;

  @Column({ type: 'uuid' })
  inspected_by: string;

  @Column({ default: true })
  passed: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  inspected_at: Date;
}
