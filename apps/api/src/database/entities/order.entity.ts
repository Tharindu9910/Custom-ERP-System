import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { DeliveryMethod, OrderStatus, OrderType, Role, SectionType, ServiceType } from '@erp/shared';
import { OrderLineEntity } from './order-line.entity';

/**
 * Header fields kept as jsonb (ER-v6 `header`).
 * Roofing: technician, department, b_no, issued_to, approved_by, order_date, global_coil_item_id.
 * Job card: job_date, notes. Both: gate_pass_id of the linked gate pass.
 */
export interface OrderHeader {
  order_date?: string;
  job_date?: string;
  technician?: string;
  department?: string;
  b_no?: string;
  issued_to?: string;
  approved_by?: string;
  global_coil_item_id?: string;
  gate_pass_id?: string;
  material_source?: string;
  notes?: string;
  cancel_reason?: string;
}

@Entity('order')
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  order_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  // Nullable only for HARDWARE_SALE (DB CHECK)
  @Column({ type: 'uuid', nullable: true })
  customer_id: string | null;

  @Column({ type: 'enum', enum: OrderType, enumName: 'order_type_enum' })
  order_type: OrderType;

  @Column({ type: 'enum', enum: SectionType, enumName: 'section_type_enum' })
  section_type: SectionType;

  @Column({ type: 'enum', enum: ServiceType, enumName: 'service_type_enum', nullable: true })
  service_type: ServiceType | null;

  @Column({ unique: true })
  order_number: string;

  @Column({ type: 'enum', enum: OrderStatus, enumName: 'order_status_enum', default: OrderStatus.DRAFT })
  status: OrderStatus;

  // Money in cents
  @Column({ type: 'int', default: 0 })
  subtotal: number;

  @Column({ type: 'int', default: 0 })
  discount: number;

  @Column({ type: 'int', default: 0 })
  total: number;

  // Cached sum of completed payments; balance = total - paid_amount
  @Column({ type: 'int', default: 0 })
  paid_amount: number;

  @Column({ type: 'enum', enum: DeliveryMethod, enumName: 'delivery_method_enum', nullable: true })
  delivery_method: DeliveryMethod | null;

  @Column({ type: 'varchar', nullable: true })
  released_to: string | null;

  @Column({ type: 'uuid', nullable: true })
  released_by: string | null;

  @Column({ type: 'timestamp', nullable: true })
  released_at: Date | null;

  @Column({ type: 'text', nullable: true })
  release_notes: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  header: OrderHeader;

  @Column({ default: false })
  is_legacy: boolean;

  @Column({ type: 'uuid' })
  created_by: string;

  @Column({ type: 'enum', enum: Role, enumName: 'role_enum', nullable: true })
  actor_role_at_creation: Role | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Optimistic lock — checked and bumped explicitly by OrdersService
  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'uuid', nullable: true, unique: true })
  client_request_id: string | null;

  // Hardware sale placed by another branch's cashier (Docs/decisions/0006); null = same branch
  @Column({ type: 'uuid', nullable: true })
  origin_branch_id: string | null;

  @OneToMany(() => OrderLineEntity, (l) => l.order)
  lines?: OrderLineEntity[];
}
