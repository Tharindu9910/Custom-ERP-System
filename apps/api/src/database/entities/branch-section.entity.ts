import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('branch_section')
export class BranchSectionEntity {
  @PrimaryGeneratedColumn('uuid')
  section_id: string;

  @Column({ type: 'uuid' })
  branch_id: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;
}
