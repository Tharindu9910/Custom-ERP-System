import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { PaymentKind, PaymentMode, PaymentStatus } from '@erp/shared';

@Entity('payment')
export class PaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  payment_id: string;

  @Column({ type: 'uuid' })
  order_id: string;

  @Column({ type: 'enum', enum: PaymentKind, enumName: 'payment_kind_enum' })
  kind: PaymentKind;

  @Column({ type: 'enum', enum: PaymentMode, enumName: 'payment_mode_enum' })
  mode: PaymentMode;

  @Column({ type: 'enum', enum: PaymentStatus, enumName: 'payment_status_enum', default: PaymentStatus.COMPLETED })
  status: PaymentStatus;

  // Cents, always positive
  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'varchar', nullable: true })
  reference_number: string | null;

  @Column({ unique: true })
  receipt_no: string;

  @Column({ type: 'uuid', nullable: true })
  reverses_payment_id: string | null;

  @Column({ type: 'uuid' })
  received_by: string;

  @Column({ type: 'timestamp', default: () => 'now()' })
  paid_at: Date;

  @Column({ type: 'uuid', nullable: true, unique: true })
  client_request_id: string | null;
}
