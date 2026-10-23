import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { AlertStatus } from '@erp/shared';
import { numeric } from '../transformers';

// History of low-stock events; at most one unresolved alert per branch item.
@Entity('stock_alert')
export class StockAlertEntity {
  @PrimaryGeneratedColumn('uuid')
  alert_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column({ type: 'uuid' })
  item_id: string;

  @Column({ type: 'numeric', precision: 14, scale: 3, transformer: numeric })
  quantity_at_alert: number;

  @Column({ type: 'enum', enum: AlertStatus, enumName: 'alert_status_enum', default: AlertStatus.OPEN })
  status: AlertStatus;

  @Column({ type: 'uuid', nullable: true })
  acknowledged_by: string | null;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  acknowledged_at: Date | null;
}
