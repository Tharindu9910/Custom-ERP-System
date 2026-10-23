import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { LineStatus, LineSubType, LineType, MaterialSource, PriceBasis, Role } from '@erp/shared';
import { numeric } from '../transformers';
import { OrderEntity } from './order.entity';

@Entity('order_line')
export class OrderLineEntity {
  @PrimaryGeneratedColumn('uuid')
  line_id: string;

  @Column({ type: 'uuid' })
  order_id: string;

  @ManyToOne(() => OrderEntity, (o) => o.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order?: OrderEntity;

  // WO-##### — the number the floor uses
  @Column({ unique: true })
  line_number: string;

  @Column({ type: 'int' })
  line_no: number;

  @Column({ type: 'enum', enum: LineType, enumName: 'line_type_enum' })
  line_type: LineType;

  @Column({ type: 'enum', enum: LineSubType, enumName: 'line_sub_type_enum', nullable: true })
  sub_type: LineSubType | null;

  @Column({ type: 'enum', enum: LineStatus, enumName: 'line_status_enum', default: LineStatus.PENDING })
  status: LineStatus;

  @Column({ type: 'enum', enum: MaterialSource, enumName: 'material_source_enum', default: MaterialSource.BRANCH })
  material_source: MaterialSource;

  // Coil (roofing) or material (Cut/Bend) deducted from stock on start (BR10)
  @Column({ type: 'uuid', nullable: true })
  item_id: string | null;

  // The validated input for this line (job-type specific fields), stored as entered
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  spec: Record<string, unknown>;

  @Column({ type: 'numeric', precision: 14, scale: 3, nullable: true, transformer: numeric })
  quantity: number | null;

  @Column({ type: 'numeric', precision: 14, scale: 3, nullable: true, transformer: numeric })
  weight_kg: number | null;

  @Column({ type: 'varchar', nullable: true })
  color: string | null;

  @Column({ type: 'enum', enum: PriceBasis, enumName: 'price_basis_enum', nullable: true })
  price_basis: PriceBasis | null;

  // Cents, snapshot at pricing time
  @Column({ type: 'int', default: 0 })
  unit_price: number;

  @Column({ type: 'int', default: 0 })
  line_total: number;

  @Column({ type: 'int', default: 0 })
  suggested_advance: number;

  @Column({ default: false })
  is_customized: boolean;

  @Column({ type: 'varchar', nullable: true })
  customized_reason_code: string | null;

  // Pricing note shown with the amount (e.g. "120 ft × Rs 470/ft")
  @Column({ type: 'text', nullable: true })
  work_info: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid' })
  created_by: string;

  @Column({ type: 'enum', enum: Role, enumName: 'role_enum', nullable: true })
  actor_role_at_creation: Role | null;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'int', default: 1 })
  version: number;
}
