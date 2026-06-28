import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('permission')
export class PermissionEntity {
  @PrimaryGeneratedColumn('uuid')
  permission_id: string;

  @Column({ unique: true })
  action: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column()
  module: string;

  @Column({ default: false })
  is_system: boolean;
}