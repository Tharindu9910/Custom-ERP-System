import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two permissions so the Role Permissions page controls what was hard-coded:
 *   - view:job_cards — opens the workshop queue (it needed update:job_card_status, a write,
 *     so head office saw the menu entry and then bounced).
 *   - manage:branches — add a branch or change its name, code, type or active state
 *     (was SUPER_ADMIN only in code). Granted to nobody; SUPER_ADMIN passes every check.
 *   - allocate:gate_pass_order — use a gate pass's material on a roofing order (was a
 *     hard-coded "not the chief" rule). Granted to every role that places roofing orders.
 *
 * Grants use DO NOTHING so a role someone already changed on the page is left alone.
 * The full list lives in PERMISSION_CATALOG (@erp/shared); the seed keeps descriptions in step.
 */
export class PermissionCatalog1761300000000 implements MigrationInterface {
  name = 'PermissionCatalog1761300000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(
      `INSERT INTO permission (action, module, description, is_system) VALUES
         ('view:job_cards', 'job-cards', 'View the workshop queue', true),
         ('manage:branches', 'branches', 'Add branches and change name, code, type or active state', true),
         ('allocate:gate_pass_order', 'gate-passes', 'Use a gate pass''s material on a roofing order', true)
       ON CONFLICT (action) DO NOTHING`,
    );
    await qr.query(
      `INSERT INTO role_permission (role, permission_id, granted)
       SELECT r.role::role_enum, p.permission_id, true
       FROM permission p
       CROSS JOIN (VALUES ('ADMIN'), ('AUDITOR'), ('SUPERVISOR'), ('CHIEF'), ('MANAGER')) AS r(role)
       WHERE p.action = 'view:job_cards'
       ON CONFLICT (role, permission_id) DO NOTHING`,
    );
    await qr.query(
      `INSERT INTO role_permission (role, permission_id, granted)
       SELECT r.role::role_enum, p.permission_id, true
       FROM permission p
       CROSS JOIN (VALUES ('SUPERVISOR'), ('CHIEF'), ('CASHIER')) AS r(role)
       WHERE p.action = 'allocate:gate_pass_order'
       ON CONFLICT (role, permission_id) DO NOTHING`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    // role_permission rows go with the permission (ON DELETE CASCADE)
    await qr.query(`DELETE FROM permission WHERE action IN ('view:job_cards', 'manage:branches', 'allocate:gate_pass_order')`);
  }
}
