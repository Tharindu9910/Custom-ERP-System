import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('gate_pass')
export class GatePassEntity {
  @PrimaryGeneratedColumn('uuid')
  gate_pass_id: string;

  @Column({ unique: true })
  pass_number: string;

  @Column({ type: 'uuid' })
  job_card_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column({ type: 'uuid' })
  created_by: string;

  @Column({ type: 'varchar', default: 'OPEN' })
  status: 'OPEN' | 'CLOSED';

  @Column({ type: 'timestamp', nullable: true })
  closed_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}