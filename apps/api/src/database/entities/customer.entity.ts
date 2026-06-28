import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { CustomerType } from '@erp/shared';

@Entity('customer')
export class CustomerEntity {
  @PrimaryGeneratedColumn('uuid')
  customer_id: string;

  @Column({ type: 'uuid', nullable: true })
  branch_id: string | null;

  @Column()
  full_name: string;

  @Column({ unique: true })
  phone: string;

  @Column({ type: 'enum', enum: CustomerType, default: CustomerType.INDIVIDUAL })
  customer_type: CustomerType;

  @Column({ type: 'varchar', nullable: true })
  company_name: string | null;

  @Column({ type: 'varchar', nullable: true })
  contact_person: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;
}