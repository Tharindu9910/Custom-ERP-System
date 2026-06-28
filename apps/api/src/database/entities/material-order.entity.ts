import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('material_order')
export class MaterialOrderEntity {
  @PrimaryGeneratedColumn('uuid')
  order_id: string;

  @Column({ type: 'uuid' })
  job_card_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column({ type: 'uuid' })
  requested_by: string;

  @Column({ type: 'varchar', default: 'PENDING' })
  status: string;

  @Column({ type: 'int', default: 0 })
  total_amount: number;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  created_at: Date;
}