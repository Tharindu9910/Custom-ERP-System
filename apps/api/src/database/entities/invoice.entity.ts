import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { InvoiceType } from '@erp/shared';

@Entity('invoice')
export class InvoiceEntity {
  @PrimaryGeneratedColumn('uuid')
  invoice_id: string;

  @Column({ type: 'uuid' })
  order_id: string;

  @Column({ unique: true })
  invoice_number: string;

  @Column({ type: 'enum', enum: InvoiceType, enumName: 'invoice_type_enum' })
  invoice_type: InvoiceType;

  @Column({ type: 'int' })
  subtotal: number;

  @Column({ type: 'int', default: 0 })
  tax_rate: number;

  @Column({ type: 'int', default: 0 })
  tax_amount: number;

  @Column({ type: 'int' })
  total_amount: number;

  @Column({ type: 'varchar', nullable: true })
  pdf_url: string | null;

  @Column({ type: 'uuid' })
  issued_by: string;

  @Column({ type: 'timestamp', default: () => 'now()' })
  issued_at: Date;
}
