import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('stock_alert')
export class StockAlertEntity {
  @PrimaryGeneratedColumn('uuid')
  alert_id: string;

  @Column({ type: 'uuid' })
  item_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column({ type: 'int' })
  stock_at_alert: number;

  @Column({ type: 'int' })
  threshold: number;

  @Column({ default: false })
  acknowledged: boolean;

  @Column({ type: 'uuid', nullable: true })
  acknowledged_by: string | null;

  @CreateDateColumn()
  created_at: Date;
}