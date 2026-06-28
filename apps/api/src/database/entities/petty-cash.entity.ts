import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('petty_cash')
export class PettyCashEntity {
  @PrimaryGeneratedColumn('uuid')
  petty_cash_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column({ type: 'uuid' })
  recorded_by: string;

  @Column({ type: 'int' })
  amount: number;

  @Column()
  description: string;

  @Column({ type: 'varchar', default: 'PENDING' })
  status: string;

  @Column({ type: 'uuid', nullable: true })
  approved_by: string | null;

  @Column({ type: 'timestamp', nullable: true })
  approved_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}