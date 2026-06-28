import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('work_order_attachment')
export class WorkOrderAttachmentEntity {
  @PrimaryGeneratedColumn('uuid')
  attachment_id: string;

  @Column({ type: 'uuid' })
  work_order_id: string;

  @Column()
  file_url: string;

  @Column({ type: 'varchar', nullable: true })
  file_name: string | null;

  @Column({ type: 'varchar', nullable: true })
  mime_type: string | null;

  @Column({ type: 'uuid' })
  uploaded_by: string;

  @CreateDateColumn()
  uploaded_at: Date;
}