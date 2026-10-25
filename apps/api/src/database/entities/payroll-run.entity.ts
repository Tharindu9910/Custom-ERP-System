import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { PayrollStatus } from '@erp/shared';

@Entity('payroll_run')
export class PayrollRunEntity {
  @PrimaryGeneratedColumn('uuid')
  run_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'int' })
  month: number;

  @Column({ type: 'enum', enum: PayrollStatus, enumName: 'payroll_status_enum', default: PayrollStatus.DRAFT })
  status: PayrollStatus;

  @Column({ type: 'uuid' })
  created_by: string;

  @CreateDateColumn()
  created_at: Date;
}
