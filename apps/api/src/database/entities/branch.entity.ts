import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BranchType } from '@erp/shared';
import type { BranchSettings } from '@erp/shared';

@Entity('branch')
export class BranchEntity {
  @PrimaryGeneratedColumn('uuid')
  branch_id: string;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: BranchType })
  branch_type: BranchType;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  location: string | null;

  // Zod-validated via BranchSettingsSchema (@erp/shared)
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  settings: BranchSettings;

  @Column({ type: 'varchar', nullable: true, select: false })
  stock_override_password_hash: string | null;

  /** The one distribution branch (Naiwala): stock arrives here and is sent on. Unique when true. */
  @Column({ default: false })
  is_main: boolean;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'uuid', nullable: true })
  updated_by: string | null;

  @UpdateDateColumn()
  updated_at: Date;
}
