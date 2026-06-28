import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { EntryType, Role } from '@erp/shared';

@Entity('ledger_entry')
export class LedgerEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  entry_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column({ type: 'uuid', nullable: true })
  job_card_id: string | null;

  @Column({ type: 'uuid' })
  account_id: string;

  @Column({ type: 'enum', enum: EntryType })
  entry_type: EntryType;

  @Column({ type: 'int' })
  amount: number;

  @Column()
  reference_type: string;

  @Column({ type: 'uuid' })
  reference_id: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: 'uuid' })
  created_by: string;

  @Column({ type: 'enum', enum: Role, nullable: true })
  actor_role: Role | null;

  @Column({ default: false })
  is_reversal: boolean;

  @Column({ type: 'uuid', nullable: true })
  reverses_entry_id: string | null;

  @CreateDateColumn()
  created_at: Date;
}