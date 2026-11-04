import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Customer lookups run on every order intake: by phone (last 9 digits) and by name search.
 * Indexes only; no query result changes. The phone expression must match the queries exactly.
 */
export class CustomerIndexes1762200000000 implements MigrationInterface {
  name = 'CustomerIndexes1762200000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await qr.query(`CREATE INDEX idx_customer_phone_key ON customer (right(regexp_replace(phone, '\\D', '', 'g'), 9))`);
    await qr.query(`CREATE INDEX idx_customer_name_trgm ON customer USING gin (name gin_trgm_ops)`);
    await qr.query(`CREATE INDEX idx_customer_branch_recent ON customer (home_branch_id, created_at DESC)`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX IF EXISTS idx_customer_branch_recent`);
    await qr.query(`DROP INDEX IF EXISTS idx_customer_name_trgm`);
    await qr.query(`DROP INDEX IF EXISTS idx_customer_phone_key`);
  }
}
