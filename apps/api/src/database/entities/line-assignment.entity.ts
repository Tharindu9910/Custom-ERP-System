import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('line_assignment')
export class LineAssignmentEntity {
  @PrimaryColumn({ type: 'uuid' })
  line_id: string;

  @PrimaryColumn({ type: 'uuid' })
  employee_id: string;

  @Column({ type: 'uuid', nullable: true })
  assigned_by: string | null;

  @CreateDateColumn()
  assigned_at: Date;
}
