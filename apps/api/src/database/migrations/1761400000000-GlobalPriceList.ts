import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One price list for every branch (Docs/decisions/0004-global-price-list.md).
 *
 *   - price_rate.branch_id goes: there are no branch overrides. Branch rows were only ever
 *     dev data (the seed writes master rows), so they are removed first.
 *   - The lookup index is rebuilt on the remaining key fields.
 *   - updated_by on price_rate, and updated_by / updated_at on item, for the Price List page.
 *   - Permissions: view:price_list and configure:item_prices are new; configure:price_list
 *     was planned and is now in use. Grants use DO NOTHING so Role Permissions changes stay.
 */
export class GlobalPriceList1761400000000 implements MigrationInterface {
  name = 'GlobalPriceList1761400000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`DELETE FROM price_rate WHERE branch_id IS NOT NULL`);
    await qr.query(`DROP INDEX IF EXISTS idx_price_rate_lookup`);
    await qr.query(`
      ALTER TABLE price_rate
        DROP COLUMN branch_id,
        ADD COLUMN updated_by UUID REFERENCES "user"(user_id)
    `);
    await qr.query(
      `CREATE UNIQUE INDEX idx_price_rate_lookup ON price_rate(
         line_type, sub_type, variant, work_type, thickness_or_size, material_source)
         NULLS NOT DISTINCT WHERE is_active = true`,
    );
    await qr.query(`
      ALTER TABLE item
        ADD COLUMN updated_by UUID REFERENCES "user"(user_id),
        ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT now()
    `);

    await qr.query(
      `INSERT INTO permission (action, module, description, is_system) VALUES
         ('view:price_list', 'price-list', 'View the price list', true),
         ('configure:price_list', 'price-list', 'Change, add and deactivate work rates', true),
         ('configure:item_prices', 'price-list', 'Change catalogue item selling price and cost', true)
       ON CONFLICT (action) DO UPDATE SET module = EXCLUDED.module, description = EXCLUDED.description`,
    );
    const grant = (action: string, roles: string[]) =>
      qr.query(
        `INSERT INTO role_permission (role, permission_id, granted)
         SELECT r.role::role_enum, p.permission_id, true
         FROM permission p
         CROSS JOIN (VALUES ${roles.map((r) => `('${r}')`).join(', ')}) AS r(role)
         WHERE p.action = $1
         ON CONFLICT (role, permission_id) DO NOTHING`,
        [action],
      );
    await grant('view:price_list', ['ADMIN', 'AUDITOR', 'MANAGER']);
    await grant('configure:price_list', ['ADMIN', 'MANAGER']);
    await grant('configure:item_prices', ['ADMIN', 'MANAGER']);
  }

  public async down(qr: QueryRunner): Promise<void> {
    // role_permission rows go with the permission (ON DELETE CASCADE); configure:price_list stays (it predates this)
    await qr.query(`DELETE FROM permission WHERE action IN ('view:price_list', 'configure:item_prices')`);
    await qr.query(`ALTER TABLE item DROP COLUMN updated_at, DROP COLUMN updated_by`);
    await qr.query(`DROP INDEX IF EXISTS idx_price_rate_lookup`);
    await qr.query(`
      ALTER TABLE price_rate
        DROP COLUMN updated_by,
        ADD COLUMN branch_id UUID REFERENCES branch(branch_id)
    `);
    await qr.query(
      `CREATE UNIQUE INDEX idx_price_rate_lookup ON price_rate(
         branch_id, line_type, sub_type, variant, work_type, thickness_or_size, material_source)
         NULLS NOT DISTINCT WHERE is_active = true`,
    );
  }
}
