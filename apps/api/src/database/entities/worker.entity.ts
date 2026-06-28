import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('worker')
export class WorkerEntity {
  @PrimaryGeneratedColumn('uuid')
  worker_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column()
  full_name: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;

  @CreateDateColumn()
  created_at: Date;
}
