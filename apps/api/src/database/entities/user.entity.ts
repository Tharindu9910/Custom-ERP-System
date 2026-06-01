import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { UserRoleEntity } from './user-role.entity'

@Entity('user')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  user_id: string

  @Column({ type: 'uuid', nullable: true })
  branch_id: string | null

  @Column()
  full_name: string

  @Column({ unique: true })
  username: string

  @Column()
  password_hash: string

  @Column({ type: 'varchar', nullable: true })
  phone: string | null

  @Column({ default: true })
  is_active: boolean

  @CreateDateColumn()
  created_at: Date

  @Column({ type: 'timestamp', nullable: true })
  last_login_at: Date | null

  @OneToMany(() => UserRoleEntity, (ur) => ur.user)
  roles: UserRoleEntity[]
}