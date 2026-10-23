import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// File stored by StorageService; linked to an entity after it is created.
@Entity('attachment')
export class AttachmentEntity {
  @PrimaryGeneratedColumn('uuid')
  attachment_id: string;

  @Column({ type: 'varchar', nullable: true })
  entity_type: string | null;

  @Column({ type: 'uuid', nullable: true })
  entity_id: string | null;

  @Column()
  purpose: string;

  @Column()
  file_name: string;

  @Column()
  file_type: string;

  @Column()
  file_url: string;

  @Column({ type: 'uuid' })
  uploaded_by: string;

  @Column({ type: 'timestamp', default: () => 'now()' })
  uploaded_at: Date;
}
