import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optimistic lock for branch details and settings: every save sends the version it
 * loaded and is refused (BR_006) if someone else saved first.
 */
export class BranchVersion1762000000000 implements MigrationInterface {
  name = 'BranchVersion1762000000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE branch ADD COLUMN version INT NOT NULL DEFAULT 1`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE branch DROP COLUMN version`);
  }
}
