import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { CustomerType } from '@erp/shared';

@Entity('customer')
export class CustomerEntity {
  @PrimaryGeneratedColumn('uuid')
  customer_id: string;

  @Column({ type: 'uuid', nullable: true })
  home_branch_id: string | null;

  @Column({ type: 'enum', enum: CustomerType, default: CustomerType.INDIVIDUAL })
  customer_type: CustomerType;

  @Column({ unique: true })
  phone: string;

  @Column()
  name: string;

  // Required when customer_type = BUSINESS (DB CHECK)
  @Column({ type: 'varchar', nullable: true })
  company_name: string | null;

  @Column({ type: 'varchar', nullable: true })
  contact_person: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  // Supervisor who created the record
  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;

  // Cashier who completed the profile
  @Column({ type: 'uuid', nullable: true })
  completed_by: string | null;

  @CreateDateColumn()
  created_at: Date;

  // null = profile incomplete
  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;
}
