import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('payslip')
export class PayslipEntity {
  @PrimaryGeneratedColumn('uuid')
  payslip_id: string;

  @Column({ type: 'uuid' })
  run_id: string;

  @Column({ type: 'uuid' })
  employee_id: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  earnings: Record<string, number>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  deductions: Record<string, number>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  inputs: Record<string, unknown>;

  @Column({ type: 'int', default: 0 })
  gross: number;

  @Column({ type: 'int', default: 0 })
  total_deductions: number;

  @Column({ type: 'int', default: 0 })
  net: number;
}
