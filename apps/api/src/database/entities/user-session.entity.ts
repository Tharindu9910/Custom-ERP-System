import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm'
import { UserEntity } from './user.entity'

@Entity('user_session')
export class UserSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  session_id: string

  @Column({ type: 'uuid' })
  user_id: string

  @Column({ unique: true })
  jti: string

  @Column({ type: 'varchar', nullable: true })
  ip_address: string | null

  @Column({ type: 'varchar', nullable: true })
  user_agent: string | null

  @Column({ default: true })
  is_active: boolean

  @CreateDateColumn()
  created_at: Date

  @Column({ type: 'timestamp' })
  expires_at: Date

  @Column({ type: 'timestamp', nullable: true })
  revoked_at: Date | null

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id' })
  user: UserEntity
}
