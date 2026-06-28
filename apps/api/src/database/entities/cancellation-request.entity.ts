import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('cancellation_request')
export class CancellationRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  request_id: string;

  @Column({ type: 'uuid' })
  job_card_id: string;

  @Column({ type: 'uuid' })
  requested_by: string;

  @Column()
  reason_code: string;

  @Column({ type: 'text', nullable: true })
  reason_detail: string | null;

  @Column({ type: 'varchar', default: 'PENDING' })
  status: string;

  @Column({ type: 'uuid', nullable: true })
  approved_by: string | null;

  @Column({ type: 'text', nullable: true })
  approval_note: string | null;

  @Column({ type: 'boolean', nullable: true })
  materials_consumed: boolean | null;

  @Column({ type: 'uuid', nullable: true })
  attested_by: string | null;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  resolved_at: Date | null;
}
