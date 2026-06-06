import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Role } from '@erp/shared';
import { UserEntity } from './user.entity';

@Entity('user_role')
export class UserRoleEntity {
  @PrimaryGeneratedColumn('uuid')
  user_role_id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'uuid', nullable: true })
  branch_id: string | null;

  @Column({ type: 'enum', enum: Role })
  role: Role;

  @Column({ type: 'uuid', nullable: true })
  assigned_by: string | null;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  assigned_at: Date;

  @ManyToOne(() => UserEntity, (u) => u.roles)
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;
}
