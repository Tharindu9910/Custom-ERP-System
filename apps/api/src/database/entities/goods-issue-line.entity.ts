import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('goods_issue_line')
export class GoodsIssueLineEntity {
  @PrimaryGeneratedColumn('uuid')
  line_id: string;

  @Column({ type: 'uuid' })
  goods_issue_id: string;

  @Column({ type: 'uuid' })
  item_id: string;

  @Column({ type: 'int' })
  quantity: number;
}