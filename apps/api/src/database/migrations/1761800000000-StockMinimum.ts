import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Branch managers set the minimum stock per item (Docs/decisions/0012-stock-menus.md).
 *
 *   - configure:stock_minimum is new and granted to MANAGER. The grant uses DO NOTHING so
 *     Role Permissions changes stay. branch_stock.reorder_level already exists.
 */
export class StockMinimum1761800000000 implements MigrationInterface {
  name = 'StockMinimum1761800000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(
      `INSERT INTO permission (action, module, description, is_system) VALUES
         ('configure:stock_minimum', 'inventory', 'Set the branch''s minimum stock for each item', true)
       ON CONFLICT (action) DO UPDATE SET module = EXCLUDED.module, description = EXCLUDED.description`,
    );
    await qr.query(
      `INSERT INTO role_permission (role, permission_id, granted)
       SELECT 'MANAGER'::role_enum, permission_id, true FROM permission WHERE action = 'configure:stock_minimum'
       ON CONFLICT (role, permission_id) DO NOTHING`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    // role_permission rows go with the permission (ON DELETE CASCADE)
    await qr.query(`DELETE FROM permission WHERE action = 'configure:stock_minimum'`);
  }
}
