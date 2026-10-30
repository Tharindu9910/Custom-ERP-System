import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Role queues with user-driven moves (Docs/decisions/0005-role-queues.md).
 *
 *   - order_status_enum gets COMPLETED: the supervisor marks a job card done (it was derived).
 *   - Backfill: job cards IN_PROGRESS with every active line COMPLETED become COMPLETED,
 *     so they land in the same column they showed in before.
 *   - Permission close:job_card (cashier hands over a fully paid card). DO NOTHING keeps
 *     Role Permissions changes.
 *
 * Postgres can't use a new enum value in the transaction that added it, so the migration
 * commits after ALTER TYPE and carries on in a new transaction.
 */
export class JobCardBoard1761500000000 implements MigrationInterface {
  name = 'JobCardBoard1761500000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'COMPLETED' AFTER 'IN_PROGRESS'`);
    await qr.commitTransaction();
    await qr.startTransaction();

    await qr.query(`
      UPDATE "order" o SET status = 'COMPLETED', version = version + 1, updated_at = now()
      WHERE o.order_type = 'JOB_CARD' AND o.status = 'IN_PROGRESS'
        AND EXISTS (SELECT 1 FROM order_line l WHERE l.order_id = o.order_id AND l.status <> 'CANCELLED')
        AND NOT EXISTS (SELECT 1 FROM order_line l WHERE l.order_id = o.order_id AND l.status NOT IN ('COMPLETED', 'CANCELLED'))
    `);

    await qr.query(
      `INSERT INTO permission (action, module, description, is_system) VALUES
         ('close:job_card', 'job-cards', 'Close and hand over a completed, fully paid job card', true)
       ON CONFLICT (action) DO UPDATE SET module = EXCLUDED.module, description = EXCLUDED.description`,
    );
    await qr.query(
      `INSERT INTO role_permission (role, permission_id, granted)
       SELECT r.role::role_enum, p.permission_id, true
       FROM permission p
       CROSS JOIN (VALUES ('CASHIER'), ('MANAGER')) AS r(role)
       WHERE p.action = 'close:job_card'
       ON CONFLICT (role, permission_id) DO NOTHING`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    // Enum values can't be dropped; COMPLETED stays unused once the rows go back
    await qr.query(`DELETE FROM permission WHERE action = 'close:job_card'`);
    await qr.query(`UPDATE "order" SET status = 'IN_PROGRESS', version = version + 1, updated_at = now() WHERE status = 'COMPLETED'`);
  }
}
