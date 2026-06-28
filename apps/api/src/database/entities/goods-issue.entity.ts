import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { GoodsIssueStatus } from '@erp/shared';

@Entity('goods_issue')
export class GoodsIssueEntity {
  @PrimaryGeneratedColumn('uuid')
  goods_issue_id: string;

  @Column({ type: 'uuid' })
  source_branch_id: string;

  @Column({ type: 'uuid' })
  target_branch_id: string;

  @Column({ type: 'uuid' })
  requested_by: string;

  @Column({
    type: 'enum',
    enum: GoodsIssueStatus,
    default: GoodsIssueStatus.PENDING,
  })
  status: GoodsIssueStatus;

  @Column({ type: 'uuid', nullable: true })
  approved_by: string | null;

  @Column({ type: 'uuid', nullable: true })
  confirmed_by: string | null;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  created_at: Date;
}