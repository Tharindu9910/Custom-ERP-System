import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('work_order_worker')
export class WorkOrderWorkerEntity {
  @PrimaryColumn({ type: 'uuid' })
  work_order_id: string;

  @PrimaryColumn({ type: 'uuid' })
  worker_id: string;

  @Column({ type: 'uuid', nullable: true })
  assigned_by: string | null;

  @CreateDateColumn()
  assigned_at: Date;
}