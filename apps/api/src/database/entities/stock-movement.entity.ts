import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { MovementType } from '@erp/shared';
import { numeric } from '../transformers';

// Append-only. quantity is signed (+ in / - out); branch stock = sum of movements.
@Entity('stock_movement')
export class StockMovementEntity {
  @PrimaryGeneratedColumn('uuid')
  movement_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column({ type: 'uuid' })
  item_id: string;

  @Column({ type: 'enum', enum: MovementType, enumName: 'movement_type_enum' })
  movement_type: MovementType;

  @Column({ type: 'numeric', precision: 14, scale: 3, transformer: numeric })
  quantity: number;

  @Column({ type: 'numeric', precision: 14, scale: 3, transformer: numeric })
  quantity_after: number;

  @Column({ type: 'uuid', nullable: true })
  line_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  transfer_line_id: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'uuid' })
  created_by: string;

  @Column({ type: 'timestamp', default: () => 'now()' })
  moved_at: Date;
}
