import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('gate_pass_item')
export class GatePassItemEntity {
  @PrimaryGeneratedColumn('uuid')
  item_id: string;

  @Column({ type: 'uuid' })
  gate_pass_id: string;

  @Column()
  description: string;

  @Column({ type: 'int', nullable: true })
  quantity: number | null;

  @Column({ type: 'varchar', nullable: true })
  unit: string | null;
}