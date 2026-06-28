import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('delivery')
export class DeliveryEntity {
  @PrimaryGeneratedColumn('uuid')
  delivery_id: string;

  @Column({ type: 'uuid' })
  job_card_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column({ type: 'varchar' })
  method: 'PICKUP' | 'DELIVERY';

  @Column({ type: 'varchar', nullable: true })
  recipient_name: string | null;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid' })
  recorded_by: string;

  @CreateDateColumn()
  delivered_at: Date;
}
