import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { AccountType, EntryType } from '@erp/shared';

@Entity('financial_account')
export class FinancialAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  account_id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: AccountType })
  account_type: AccountType;

  @Column({ type: 'enum', enum: EntryType })
  normal_balance: EntryType;

  @Column({ default: false })
  is_system: boolean;

  @Column({ default: true })
  is_active: boolean;
}
