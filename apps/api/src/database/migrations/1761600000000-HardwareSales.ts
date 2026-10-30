import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hardware Store and Hardware Queue (Docs/decisions/0006-hardware-sales.md).
 *
 *   - order.origin_branch_id: a cashier at another branch placed this order (advance only).
 *     The order belongs to the branch holding the goods; this records where it came from.
 *   - payment.received_branch_id: where the money was taken. An advance taken at branch A
 *     on branch B's order must reconcile against A's cash. Backfilled from the order.
 *   - Partial index for the Hardware Queue (awaiting + paid today).
 *   - Four hardware permissions. DO NOTHING keeps Role Permissions changes.
 */
const PERMISSIONS: [string, string][] = [
  ['create:hardware_sale', 'Use the Hardware Store and place hardware orders for own branch'],
  ['create:cross_branch_hardware_sale', "Place advance-paid hardware orders on another branch (sees that branch's hardware stock)"],
  ['view:hardware_queue', 'View the hardware queue'],
  ['cancel:hardware_sale', 'Cancel a hardware order that is awaiting payment'],
];

const GRANTS: [string, string][] = [
  ['create:hardware_sale', 'SUPERVISOR'],
  ['create:hardware_sale', 'CASHIER'],
  ['create:cross_branch_hardware_sale', 'CASHIER'],
  ['view:hardware_queue', 'CASHIER'],
  ['view:hardware_queue', 'MANAGER'],
  ['view:hardware_queue', 'ADMIN'],
  ['view:hardware_queue', 'AUDITOR'],
  ['cancel:hardware_sale', 'SUPERVISOR'],
  ['cancel:hardware_sale', 'CASHIER'],
];

export class HardwareSales1761600000000 implements MigrationInterface {
  name = 'HardwareSales1761600000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE "order" ADD COLUMN IF NOT EXISTS origin_branch_id UUID REFERENCES branch(branch_id)`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_order_origin_branch ON "order"(origin_branch_id) WHERE origin_branch_id IS NOT NULL`);

    await qr.query(`ALTER TABLE payment ADD COLUMN IF NOT EXISTS received_branch_id UUID REFERENCES branch(branch_id)`);
    await qr.query(`
      UPDATE payment p SET received_branch_id = o.branch_id
      FROM "order" o WHERE o.order_id = p.order_id AND p.received_branch_id IS NULL
    `);
    await qr.query(`ALTER TABLE payment ALTER COLUMN received_branch_id SET NOT NULL`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_payment_received_branch ON payment(received_branch_id, paid_at)`);

    await qr.query(`
      CREATE INDEX IF NOT EXISTS idx_order_hw_queue ON "order"(branch_id, status, released_at)
      WHERE order_type = 'HARDWARE_SALE'
    `);

    for (const [action, description] of PERMISSIONS) {
      await qr.query(
        `INSERT INTO permission (action, module, description, is_system) VALUES ($1, 'hardware', $2, true)
         ON CONFLICT (action) DO UPDATE SET module = EXCLUDED.module, description = EXCLUDED.description`,
        [action, description],
      );
    }
    for (const [action, role] of GRANTS) {
      await qr.query(
        `INSERT INTO role_permission (role, permission_id, granted)
         SELECT $2::role_enum, p.permission_id, true FROM permission p WHERE p.action = $1
         ON CONFLICT (role, permission_id) DO NOTHING`,
        [action, role],
      );
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DELETE FROM permission WHERE action = ANY($1)`, [PERMISSIONS.map(([a]) => a)]);
    await qr.query(`DROP INDEX IF EXISTS idx_order_hw_queue`);
    await qr.query(`DROP INDEX IF EXISTS idx_payment_received_branch`);
    await qr.query(`ALTER TABLE payment DROP COLUMN IF EXISTS received_branch_id`);
    await qr.query(`DROP INDEX IF EXISTS idx_order_origin_branch`);
    await qr.query(`ALTER TABLE "order" DROP COLUMN IF EXISTS origin_branch_id`);
  }
}
