import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ReservationStatus } from '@erp/shared';
import { numeric } from '../transformers';

// Branch material held for an order line (addition to ER-v6, Docs/decisions/0003). Written only by StockService.
@Entity('stock_reservation')
export class StockReservationEntity {
  @PrimaryGeneratedColumn('uuid')
  reservation_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column({ type: 'uuid' })
  item_id: string;

  @Column({ type: 'uuid' })
  order_id: string;

  @Column({ type: 'uuid' })
  line_id: string;

  // Held from available stock
  @Column({ type: 'numeric', precision: 14, scale: 3, transformer: numeric })
  quantity: number;

  // Not held: authorised by a stock override at creation, taken from whatever is free at start
  @Column({ type: 'numeric', precision: 14, scale: 3, default: 0, transformer: numeric })
  shortfall: number;

  @Column({ type: 'enum', enum: ReservationStatus, enumName: 'reservation_status_enum', default: ReservationStatus.RESERVED })
  status: ReservationStatus;

  @Column({ type: 'varchar', nullable: true })
  override_reason: string | null;

  @Column({ type: 'varchar', nullable: true })
  release_reason: string | null;

  @Column({ type: 'uuid' })
  created_by: string;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  closed_at: Date | null;
}
