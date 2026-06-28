import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('invoice')
export class InvoiceEntity {
  @PrimaryGeneratedColumn('uuid')
  invoice_id: string;

  @Column({ unique: true })
  invoice_number: string;

  @Column({ type: 'uuid' })
  job_card_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column({ type: 'uuid' })
  created_by: string;

  @Column({ type: 'int' })
  total_amount: number;

  @Column({ type: 'int' })
  advance_paid: number;

  @Column({ type: 'int' })
  balance_due: number;

  @Column({ type: 'varchar', nullable: true })
  pdf_url: string | null;

  @CreateDateColumn()
  created_at: Date;
}