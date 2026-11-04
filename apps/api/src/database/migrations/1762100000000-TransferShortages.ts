import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stock requests received short (Docs/decisions/0014-transfer-shortages.md).
 *
 *   - transfer_status_enum gets SHORTAGE_PENDING: what arrived is in stock, the missing
 *     part waits for the receiving branch's manager.
 *   - movement_type_enum gets TRANSIT_SHORTAGE: the loss, written when the manager approves.
 *   - Lines keep why they were short; the transfer keeps who approved the loss and when.
 *   - Permission approve:transfer_shortage for MANAGER. DO NOTHING keeps Role Permissions changes.
 *
 * Postgres can't use a new enum value in the transaction that added it, so the migration
 * commits after ALTER TYPE and carries on in a new transaction.
 */
export class TransferShortages1762100000000 implements MigrationInterface {
  name = 'TransferShortages1762100000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TYPE transfer_status_enum ADD VALUE IF NOT EXISTS 'SHORTAGE_PENDING'`);
    await qr.query(`ALTER TYPE movement_type_enum ADD VALUE IF NOT EXISTS 'TRANSIT_SHORTAGE'`);
    await qr.commitTransaction();
    await qr.startTransaction();

    await qr.query(`CREATE TYPE shortage_reason_enum AS ENUM ('DAMAGED', 'MISSING', 'SENDER_MISCOUNT', 'OTHER')`);
    await qr.query(`
      ALTER TABLE stock_transfer_line
        ADD COLUMN shortage_reason shortage_reason_enum,
        ADD COLUMN shortage_note TEXT
    `);
    await qr.query(`
      ALTER TABLE stock_transfer
        ADD COLUMN shortage_approved_by UUID REFERENCES "user"(user_id),
        ADD COLUMN shortage_approved_at TIMESTAMP
    `);
    // The manager's inbox: shortages waiting at a branch
    await qr.query(
      `CREATE INDEX idx_stock_transfer_shortage ON stock_transfer(requesting_branch_id) WHERE status = 'SHORTAGE_PENDING'`,
    );

    await qr.query(
      `INSERT INTO permission (action, module, description, is_system) VALUES
         ('approve:transfer_shortage', 'stock-transfers', 'Approve or correct a stock request that arrived short (books the loss)', true)
       ON CONFLICT (action) DO UPDATE SET module = EXCLUDED.module, description = EXCLUDED.description`,
    );
    await qr.query(
      `INSERT INTO role_permission (role, permission_id, granted)
       SELECT 'MANAGER'::role_enum, p.permission_id, true FROM permission p WHERE p.action = 'approve:transfer_shortage'
       ON CONFLICT (role, permission_id) DO NOTHING`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    // role_permission rows go with the permission (ON DELETE CASCADE)
    await qr.query(`DELETE FROM permission WHERE action = 'approve:transfer_shortage'`);
    await qr.query(`DROP INDEX IF EXISTS idx_stock_transfer_shortage`);
    await qr.query(`ALTER TABLE stock_transfer DROP COLUMN shortage_approved_at, DROP COLUMN shortage_approved_by`);
    await qr.query(`ALTER TABLE stock_transfer_line DROP COLUMN shortage_note, DROP COLUMN shortage_reason`);
    await qr.query(`DROP TYPE shortage_reason_enum`);
    // Enum values can't be dropped in Postgres; a pending shortage would need to be closed by hand first
  }
}
