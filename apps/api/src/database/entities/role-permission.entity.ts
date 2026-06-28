import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Role } from '@erp/shared';

@Entity('role_permission')
export class RolePermissionEntity {
  @PrimaryGeneratedColumn('uuid')
  role_permission_id: string;

  @Column({ type: 'enum', enum: Role })
  role: Role;

  @Column({ type: 'uuid' })
  permission_id: string;

  @Column({ default: true })
  granted: boolean;

  @Column({ type: 'uuid', nullable: true })
  set_by: string | null;

  @CreateDateColumn()
  set_at: Date;
}
