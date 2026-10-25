import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export interface EmployeeSalary {
  basic?: number;
  travelling?: number;
  target?: number;
  performance?: number;
  leave?: number;
}

@Entity('employee')
export class EmployeeEntity {
  @PrimaryGeneratedColumn('uuid')
  employee_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  // DB default generates EMP-##### when not supplied
  @Column({
    unique: true,
    default: () => "('EMP-' || lpad(nextval('employee_code_seq')::text, 5, '0'))",
  })
  employee_code: string;

  @Column()
  full_name: string;

  @Column({ type: 'varchar', nullable: true })
  designation: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'jsonb', nullable: true })
  salary: EmployeeSalary | null;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;

  @CreateDateColumn()
  created_at: Date;
}
