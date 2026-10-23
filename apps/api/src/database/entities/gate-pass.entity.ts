import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { GatePassStatus } from '@erp/shared';
import { GatePassItemEntity } from './gate-pass-item.entity';

@Entity('gate_pass')
export class GatePassEntity {
  @PrimaryGeneratedColumn('uuid')
  gate_pass_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column({ type: 'uuid' })
  customer_id: string;

  @Column({ unique: true })
  pass_number: string;

  // Stored OPEN/CLOSED; the detailed display status is derived (gatePassSummary)
  @Column({ type: 'enum', enum: GatePassStatus, enumName: 'gate_pass_status_enum', default: GatePassStatus.OPEN })
  status: GatePassStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid' })
  issued_by: string;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  closed_at: Date | null;

  @Column({ type: 'uuid', nullable: true, unique: true })
  client_request_id: string | null;

  @OneToMany(() => GatePassItemEntity, (i) => i.gate_pass, { cascade: ['insert'] })
  items?: GatePassItemEntity[];
}
