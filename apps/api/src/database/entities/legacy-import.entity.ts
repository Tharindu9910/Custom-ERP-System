import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('legacy_import')
export class LegacyImportEntity {
  @PrimaryGeneratedColumn('uuid')
  import_id: string;

  @Column({ type: 'uuid', unique: true })
  order_id: string;

  @Column({ unique: true })
  legacy_reference: string;

  @Column({ type: 'jsonb' })
  raw_import_data: Record<string, unknown>;

  @Column({ type: 'uuid' })
  imported_by: string;

  @Column({ type: 'timestamp', default: () => 'now()' })
  imported_at: Date;
}
