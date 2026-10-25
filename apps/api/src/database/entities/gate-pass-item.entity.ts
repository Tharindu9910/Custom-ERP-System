import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { LengthUnit } from '@erp/shared';
import { numeric } from '../transformers';
import { GatePassEntity } from './gate-pass.entity';

@Entity('gate_pass_item')
export class GatePassItemEntity {
  @PrimaryGeneratedColumn('uuid')
  gp_item_id: string;

  @Column({ type: 'uuid' })
  gate_pass_id: string;

  @ManyToOne(() => GatePassEntity, (g) => g.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gate_pass_id' })
  gate_pass?: GatePassEntity;

  @Column()
  material_type: string;

  @Column({ type: 'varchar', nullable: true })
  thickness: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numeric })
  length: number | null;

  @Column({ type: 'enum', enum: LengthUnit, enumName: 'length_unit_enum', nullable: true })
  length_unit: LengthUnit | null;

  @Column({ type: 'varchar', nullable: true })
  color: string | null;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'varchar', nullable: true })
  condition_note: string | null;
}
