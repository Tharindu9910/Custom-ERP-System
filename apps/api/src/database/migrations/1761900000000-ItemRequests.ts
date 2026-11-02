import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * New catalogue products (Docs/decisions/0013-new-catalogue-items.md).
 *
 *   - item_request: a branch's draft for a new product. Nothing reaches `item` until the
 *     branch manager approves it; approval links the created item.
 *   - Permissions: request:new_item (SUPERVISOR, MANAGER), approve:item_request (MANAGER),
 *     create:item (ADMIN; head office adds directly). Grants use DO NOTHING so Role
 *     Permissions changes stay.
 */
export class ItemRequests1761900000000 implements MigrationInterface {
  name = 'ItemRequests1761900000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(
      `CREATE TYPE item_request_status_enum AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')`,
    );
    await qr.query(`
      CREATE TABLE item_request (
        request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_request_id UUID NOT NULL UNIQUE,
        branch_id UUID NOT NULL REFERENCES branch(branch_id),
        status item_request_status_enum NOT NULL DEFAULT 'PENDING',
        name VARCHAR NOT NULL,
        item_type item_type_enum NOT NULL,
        category VARCHAR NOT NULL,
        unit VARCHAR NOT NULL,
        attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
        suggested_price INT CHECK (suggested_price >= 0),
        suggested_cost INT CHECK (suggested_cost >= 0),
        note TEXT,
        requested_by UUID NOT NULL REFERENCES "user"(user_id),
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        decided_by UUID REFERENCES "user"(user_id),
        decided_at TIMESTAMP,
        reject_reason TEXT,
        item_id UUID REFERENCES item(item_id),
        CONSTRAINT chk_item_request_decision CHECK (
          (status = 'PENDING' AND decided_by IS NULL AND item_id IS NULL)
          OR (status = 'APPROVED' AND decided_by IS NOT NULL AND item_id IS NOT NULL)
          OR (status = 'REJECTED' AND decided_by IS NOT NULL AND reject_reason IS NOT NULL AND item_id IS NULL)
          OR (status = 'CANCELLED' AND item_id IS NULL)
        )
      )
    `);
    await qr.query(
      `CREATE INDEX idx_item_request_branch_status ON item_request(branch_id, status, created_at DESC)`,
    );

    await qr.query(
      `INSERT INTO permission (action, module, description, is_system) VALUES
         ('request:new_item', 'items', 'Ask for a new product to be added to the catalogue', true),
         ('approve:item_request', 'items', 'Approve or reject the branch''s new-product requests (sets SKU and price)', true),
         ('create:item', 'items', 'Add new products to the catalogue directly', true)
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
    await grant('request:new_item', ['SUPERVISOR', 'MANAGER']);
    await grant('approve:item_request', ['MANAGER']);
    await grant('create:item', ['ADMIN']);
  }

  public async down(qr: QueryRunner): Promise<void> {
    // role_permission rows go with the permission (ON DELETE CASCADE)
    await qr.query(
      `DELETE FROM permission WHERE action IN ('request:new_item', 'approve:item_request', 'create:item')`,
    );
    await qr.query(`DROP TABLE item_request`);
    await qr.query(`DROP TYPE item_request_status_enum`);
  }
}
