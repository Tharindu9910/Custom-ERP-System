import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { TransferStatus } from '@erp/shared';
import { StockTransferLineEntity } from './stock-transfer-line.entity';

// "Stock request" in the UI: PENDING (Waiting) → ISSUED (Sent) → CONFIRMED (Received).
@Entity('stock_transfer')
export class StockTransferEntity {
  @PrimaryGeneratedColumn('uuid')
  transfer_id: string;

  @Column({ unique: true })
  transfer_number: string;

  @Column({ type: 'uuid' })
  requesting_branch_id: string;

  @Column({ type: 'uuid' })
  supplying_branch_id: string;

  @Column({ type: 'varchar', nullable: true })
  source_document_number: string | null;

  @Column({ type: 'enum', enum: TransferStatus, enumName: 'transfer_status_enum', default: TransferStatus.PENDING })
  status: TransferStatus;

  @Column({ type: 'date', nullable: true })
  needed_before: string | null;

  @Column({ default: false })
  is_urgent: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'text', nullable: true })
  reject_reason: string | null;

  @Column({ type: 'text', nullable: true })
  receive_notes: string | null;

  @Column({ type: 'uuid' })
  requested_by: string;

  @Column({ type: 'uuid', nullable: true })
  approved_by: string | null;

  @Column({ type: 'uuid', nullable: true })
  sent_by: string | null;

  @Column({ type: 'uuid', nullable: true })
  received_by: string | null;

  @Column({ type: 'uuid', nullable: true })
  closed_by: string | null;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  approved_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  sent_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  received_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  closed_at: Date | null;

  @Column({ type: 'uuid', nullable: true, unique: true })
  client_request_id: string | null;

  @OneToMany(() => StockTransferLineEntity, (l) => l.transfer, { cascade: ['insert'] })
  lines?: StockTransferLineEntity[];
}
