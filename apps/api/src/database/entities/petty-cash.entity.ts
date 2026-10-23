import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { PettyCashStatus } from '@erp/shared';

@Entity('petty_cash')
export class PettyCashEntity {
  @PrimaryGeneratedColumn('uuid')
  petty_cash_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column({ type: 'uuid' })
  requested_by: string;

  @Column({ type: 'uuid', nullable: true })
  requested_for: string | null;

  @Column()
  category: string;

  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'int', nullable: true })
  spent: number | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', nullable: true })
  reference_note: string | null;

  @Column({ type: 'enum', enum: PettyCashStatus, enumName: 'petty_cash_status_enum', default: PettyCashStatus.PENDING })
  status: PettyCashStatus;

  @CreateDateColumn()
  created_at: Date;
}
