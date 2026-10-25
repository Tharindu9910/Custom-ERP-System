import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserRoleEntity } from './user-role.entity';

@Entity('user')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  user_id: string;

  // Global admins may not be employees
  @Column({ type: 'uuid', unique: true, nullable: true })
  employee_id: string | null;

  // Home branch; null = global user
  @Column({ type: 'uuid', nullable: true })
  branch_id: string | null;

  @Column()
  full_name: string;

  @Column({ unique: true })
  username: string;

  @Column({ unique: true, nullable: true, type: 'varchar' })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column()
  password_hash: string;

  @Column({ default: false })
  must_change_password: boolean;

  @Column({ type: 'timestamp', nullable: true })
  password_changed_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  temp_password_expires_at: Date | null;

  @Column({ type: 'int', default: 0 })
  failed_login_count: number;

  @Column({ type: 'timestamp', nullable: true })
  locked_until: Date | null;

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  last_login_at: Date | null;

  @OneToMany(() => UserRoleEntity, (ur) => ur.user)
  roles: UserRoleEntity[];
}
