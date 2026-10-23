import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { numeric } from '../transformers';
import { StockTransferEntity } from './stock-transfer.entity';

@Entity('stock_transfer_line')
export class StockTransferLineEntity {
  @PrimaryGeneratedColumn('uuid')
  transfer_line_id: string;

  @Column({ type: 'uuid' })
  transfer_id: string;

  @ManyToOne(() => StockTransferEntity, (t) => t.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transfer_id' })
  transfer?: StockTransferEntity;

  @Column({ type: 'uuid' })
  item_id: string;

  @Column({ type: 'numeric', precision: 14, scale: 3, transformer: numeric })
  qty_requested: number;

  @Column({ type: 'numeric', precision: 14, scale: 3, nullable: true, transformer: numeric })
  qty_sent: number | null;

  @Column({ type: 'numeric', precision: 14, scale: 3, nullable: true, transformer: numeric })
  qty_received: number | null;

  @Column({ type: 'varchar', nullable: true })
  reference_number: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
