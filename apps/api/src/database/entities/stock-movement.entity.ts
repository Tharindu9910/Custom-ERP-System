import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('stock_movement')
export class StockMovementEntity {
  @PrimaryGeneratedColumn('uuid')
  movement_id: string;

  @Column({ type: 'uuid' })
  item_id: string;

  @Column({ type: 'uuid', nullable: true })
  branch_id: string | null;

  @Column({ type: 'varchar' })
  direction: 'IN' | 'OUT';

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'varchar', nullable: true })
  reference_type: string | null;

  @Column({ type: 'uuid', nullable: true })
  reference_id: string | null;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;

  @CreateDateColumn()
  moved_at: Date;
}