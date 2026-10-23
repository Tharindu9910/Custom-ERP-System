import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { EntryType, Role } from '@erp/shared';

export type LedgerSourceType =
  | 'PAYMENT'
  | 'CANCELLATION'
  | 'STOCK_DEDUCTION'
  | 'PETTY_CASH'
  | 'PAYSLIP'
  | 'LEGACY_OPENING';

@Entity('ledger_entry')
export class LedgerEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  entry_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column({ type: 'uuid' })
  account_id: string;

  @Column({ type: 'enum', enum: EntryType })
  entry_type: EntryType;

  // Cents, always positive
  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'varchar' })
  source_type: LedgerSourceType;

  @Column({ type: 'uuid' })
  source_id: string;

  @Column({ type: 'uuid', nullable: true })
  order_id: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'uuid', nullable: true })
  reverses_entry_id: string | null;

  @Column({ type: 'uuid' })
  created_by: string;

  @Column({ type: 'enum', enum: Role, nullable: true })
  actor_role: Role | null;

  @CreateDateColumn()
  created_at: Date;
}
