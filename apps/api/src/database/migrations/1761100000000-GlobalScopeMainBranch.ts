import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Global scope and main branch (Docs/decisions/0002-global-scope-and-main-branch.md).
 *
 *   - branch.is_main: the one distribution branch (Naiwala). A partial unique index allows only one.
 *   - Global roles are exactly SUPER_ADMIN, ADMIN, AUDITOR: they have no branch, every other role has one.
 *     ADMIN rows lose their branch; MANAGER rows without a branch are moved to the main branch
 *     (nothing is deleted — reassign them afterwards if that is wrong).
 */
export class GlobalScopeMainBranch1761100000000 implements MigrationInterface {
  name = 'GlobalScopeMainBranch1761100000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE branch ADD COLUMN is_main BOOLEAN NOT NULL DEFAULT false`);
    await qr.query(`CREATE UNIQUE INDEX uq_branch_single_main ON branch ((true)) WHERE is_main`);
    await qr.query(`UPDATE branch SET is_main = true WHERE code = 'BR-NAI-001'`);

    await qr.query(`ALTER TABLE user_role DROP CONSTRAINT chk_user_role_branch_scope`);
    await qr.query(`UPDATE user_role SET branch_id = NULL WHERE role = 'ADMIN'`);
    await qr.query(`
      UPDATE user_role SET branch_id = (SELECT branch_id FROM branch WHERE is_main)
      WHERE role = 'MANAGER' AND branch_id IS NULL`);
    // Keep the user's home branch in step with their role (as UsersService.assignRole does)
    await qr.query(`
      UPDATE "user" u SET branch_id = ur.branch_id
      FROM user_role ur
      WHERE ur.user_id = u.user_id AND ur.is_active AND ur.role IN ('ADMIN', 'MANAGER')`);
    await qr.query(`
      ALTER TABLE user_role ADD CONSTRAINT chk_user_role_branch_scope CHECK (
        (role IN ('SUPER_ADMIN','ADMIN','AUDITOR')) = (branch_id IS NULL)
      )`);

    // Branch operations move from ADMIN (now head office, view-only) to the branch MANAGER.
    // Same grants as ROLE_PERMISSION_MATRIX in seeds/seed.ts; on a fresh DB the permission
    // table is still empty here and these are no-ops.
    const grant = (role: string, actions: string[]) =>
      qr.query(
        `INSERT INTO role_permission (role, permission_id, granted)
         SELECT $1::role_enum, permission_id, true FROM permission WHERE action = ANY($2)
         ON CONFLICT (role, permission_id) DO UPDATE SET granted = true, set_at = now()`,
        [role, actions],
      );
    const revoke = (role: string, actions: string[]) =>
      qr.query(
        `UPDATE role_permission rp SET granted = false, set_at = now()
         FROM permission p WHERE p.permission_id = rp.permission_id AND rp.role = $1::role_enum AND p.action = ANY($2)`,
        [role, actions],
      );
    const BRANCH_OPS = [
      'update:job_card_status', 'cancel:job_card_draft', 'cancel:job_card_any',
      'manage:workers', 'override:stock', 'resolve:conflict_queue',
    ];
    const VIEW = ['view:inventory', 'view:stock_alerts', 'view:orders'];
    await revoke('ADMIN', BRANCH_OPS);
    await grant('ADMIN', VIEW);
    await grant('AUDITOR', VIEW);
    await revoke('MANAGER', ['view:all_branches']);
    await grant('MANAGER', [...BRANCH_OPS, ...VIEW]);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE user_role DROP CONSTRAINT chk_user_role_branch_scope`);
    await qr.query(`
      ALTER TABLE user_role ADD CONSTRAINT chk_user_role_branch_scope CHECK (
        branch_id IS NOT NULL OR role IN ('SUPER_ADMIN','ADMIN','AUDITOR','MANAGER')
      )`);
    await qr.query(`DROP INDEX uq_branch_single_main`);
    await qr.query(`ALTER TABLE branch DROP COLUMN is_main`);
  }
}
