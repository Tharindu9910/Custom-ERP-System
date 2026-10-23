import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { BranchType } from '@erp/shared';
import type { BranchSettings } from '@erp/shared';

// Settings template applied to new branches of a type.
@Entity('branch_type_default')
export class BranchTypeDefaultEntity {
  @PrimaryColumn({ type: 'enum', enum: BranchType, enumName: 'branch_type_enum' })
  branch_type: BranchType;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  settings: BranchSettings;

  @Column({ type: 'uuid', nullable: true })
  updated_by: string | null;

  @UpdateDateColumn()
  updated_at: Date;
}
