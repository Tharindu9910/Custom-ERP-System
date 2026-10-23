import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { NotificationChannel, NotificationStatus } from '@erp/shared';

@Entity('notification')
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  notification_id: string;

  @Column({ type: 'uuid', nullable: true })
  order_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  customer_id: string | null;

  @Column({ type: 'enum', enum: NotificationChannel, enumName: 'notification_channel_enum' })
  channel: NotificationChannel;

  @Column({ type: 'varchar', nullable: true })
  template_id: string | null;

  @Column()
  recipient_contact: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'enum', enum: NotificationStatus, enumName: 'notification_status_enum', default: NotificationStatus.QUEUED })
  status: NotificationStatus;

  @Column({ type: 'int', default: 0 })
  retry_count: number;

  @Column({ type: 'text', nullable: true })
  failure_reason: string | null;

  @Column({ type: 'uuid', nullable: true })
  sent_by: string | null;

  @Column({ type: 'timestamp', nullable: true })
  sent_at: Date | null;
}
