import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { AccountType } from '@erp/shared';

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

  @Column({ type: 'varchar' })
  normal_balance: 'DEBIT' | 'CREDIT';

  @Column({ default: true })
  is_active: boolean;
}