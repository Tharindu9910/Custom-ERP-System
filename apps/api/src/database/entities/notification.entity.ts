import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('notification')
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  notification_id: string;

  @Column({ type: 'uuid', nullable: true })
  job_card_id: string | null;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column()
  channel: string;

  @Column()
  recipient: string;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar', default: 'PENDING' })
  status: string;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  sent_at: Date | null;
}