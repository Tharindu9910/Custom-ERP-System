import { Column, Entity, PrimaryColumn } from 'typeorm';
import { numeric } from '../transformers';

// Written only by StockService (atomic conditional updates; never negative).
@Entity('branch_stock')
export class BranchStockEntity {
  @PrimaryColumn({ type: 'uuid' })
  branch_id: string;

  @PrimaryColumn({ type: 'uuid' })
  item_id: string;

  @Column({ type: 'numeric', precision: 14, scale: 3, default: 0, transformer: numeric })
  quantity: number;

  // Held for open orders (addition to ER-v6, Docs/decisions/0003); available = quantity - reserved_quantity
  @Column({ type: 'numeric', precision: 14, scale: 3, default: 0, transformer: numeric })
  reserved_quantity: number;

  @Column({ type: 'numeric', precision: 14, scale: 3, default: 0, transformer: numeric })
  reorder_level: number;
}
