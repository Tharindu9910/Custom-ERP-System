import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ItemRequestStatus, ItemType } from '@erp/shared';
import type { ItemAttributes } from './item.entity';

/**
 * A branch's request for a new catalogue product (Docs/decisions/0013). It is a draft:
 * nothing reaches `item` (or pricing) until the branch manager approves it, and an
 * approved request is never edited again.
 */
@Entity('item_request')
export class ItemRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  request_id: string;

  @Column({ type: 'uuid', unique: true })
  client_request_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column({
    type: 'enum',
    enum: ItemRequestStatus,
    enumName: 'item_request_status_enum',
    default: ItemRequestStatus.PENDING,
  })
  status: ItemRequestStatus;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: ItemType, enumName: 'item_type_enum' })
  item_type: ItemType;

  @Column()
  category: string;

  @Column()
  unit: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  attributes: ItemAttributes;

  // Cents; the supervisor's suggestion, the approver sets the real price
  @Column({ type: 'int', nullable: true })
  suggested_price: number | null;

  @Column({ type: 'int', nullable: true })
  suggested_cost: number | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'uuid' })
  requested_by: string;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'uuid', nullable: true })
  decided_by: string | null;

  @Column({ type: 'timestamp', nullable: true })
  decided_at: Date | null;

  @Column({ type: 'text', nullable: true })
  reject_reason: string | null;

  // The catalogue item created on approval
  @Column({ type: 'uuid', nullable: true })
  item_id: string | null;
}
