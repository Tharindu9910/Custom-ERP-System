import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { PaymentMode, PaymentType } from '@erp/shared';

@Entity('payment')
export class PaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  payment_id: string;

  @Column({ type: 'uuid' })
  job_card_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column({ type: 'uuid' })
  received_by: string;

  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'enum', enum: PaymentMode })
  mode: PaymentMode;

  @Column({ type: 'enum', enum: PaymentType })
  type: PaymentType;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  created_at: Date;
}