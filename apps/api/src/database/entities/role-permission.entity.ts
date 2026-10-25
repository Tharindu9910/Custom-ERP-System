import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { Role } from '@erp/shared';

@Entity('role_permission')
export class RolePermissionEntity {
  @PrimaryColumn({ type: 'enum', enum: Role })
  role: Role;

  @PrimaryColumn({ type: 'uuid' })
  permission_id: string;

  @Column({ default: true })
  granted: boolean;

  @Column({ type: 'uuid', nullable: true })
  set_by: string | null;

  @CreateDateColumn()
  set_at: Date;
}
