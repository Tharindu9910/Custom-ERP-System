import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('branch_config')
export class BranchConfigEntity {
  @PrimaryGeneratedColumn('uuid')
  config_id: string;

  @Column({ type: 'uuid', unique: true })
  branch_id: string;

  @Column({ type: 'int', default: 30 })
  min_advance_pct_customized: number;

  @Column({ type: 'int', default: 0 })
  min_advance_pct_standard: number;

  @Column({ default: false })
  stock_override_enabled: boolean;

  @Column({ type: 'varchar', nullable: true })
  stock_override_password_hash: string | null;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ type: 'uuid', nullable: true })
  updated_by: string | null;
}
