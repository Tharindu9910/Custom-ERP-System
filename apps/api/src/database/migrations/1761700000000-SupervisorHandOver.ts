import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The supervisor hands over job cards (Docs/decisions/0005-role-queues.md, 2026-11-01).
 *
 *   - close:job_card moves from CASHIER to SUPERVISOR; MANAGER keeps it. The cashier only
 *     collects the money; a finished card paid in full waits on the Workshop Queue under
 *     Ready for Collection, where the supervisor checks the items and closes it.
 */
export class SupervisorHandOver1761700000000 implements MigrationInterface {
  name = 'SupervisorHandOver1761700000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`UPDATE permission SET description = 'Check and hand over a finished, fully paid job card' WHERE action = 'close:job_card'`);
    await qr.query(
      `DELETE FROM role_permission rp USING permission p
       WHERE rp.permission_id = p.permission_id AND p.action = 'close:job_card' AND rp.role = 'CASHIER'`,
    );
    await qr.query(
      `INSERT INTO role_permission (role, permission_id, granted)
       SELECT 'SUPERVISOR'::role_enum, p.permission_id, true FROM permission p WHERE p.action = 'close:job_card'
       ON CONFLICT (role, permission_id) DO UPDATE SET granted = true`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`UPDATE permission SET description = 'Close and hand over a completed, fully paid job card' WHERE action = 'close:job_card'`);
    await qr.query(
      `DELETE FROM role_permission rp USING permission p
       WHERE rp.permission_id = p.permission_id AND p.action = 'close:job_card' AND rp.role = 'SUPERVISOR'`,
    );
    await qr.query(
      `INSERT INTO role_permission (role, permission_id, granted)
       SELECT 'CASHIER'::role_enum, p.permission_id, true FROM permission p WHERE p.action = 'close:job_card'
       ON CONFLICT (role, permission_id) DO NOTHING`,
    );
  }
}
