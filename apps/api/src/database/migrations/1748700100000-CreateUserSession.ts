import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateUserSession1748700100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_session" (
        "session_id"  UUID        NOT NULL DEFAULT gen_random_uuid(),
        "user_id"     UUID        NOT NULL,
        "jti"         VARCHAR     NOT NULL,
        "ip_address"  VARCHAR,
        "user_agent"  VARCHAR,
        "is_active"   BOOLEAN     NOT NULL DEFAULT true,
        "created_at"  TIMESTAMP   NOT NULL DEFAULT now(),
        "expires_at"  TIMESTAMP   NOT NULL,
        "revoked_at"  TIMESTAMP,
        CONSTRAINT "PK_user_session"      PRIMARY KEY ("session_id"),
        CONSTRAINT "UQ_user_session_jti"  UNIQUE      ("jti"),
        CONSTRAINT "FK_user_session_user" FOREIGN KEY ("user_id")
          REFERENCES "user" ("user_id") ON DELETE CASCADE
      )
    `)

    // Fast lookup by jti on every authenticated request
    await queryRunner.query(`
      CREATE INDEX "idx_user_session_jti"
        ON "user_session" ("jti")
        WHERE "is_active" = true
    `)

    // Fast lookup of all active sessions per user (for logout-all)
    await queryRunner.query(`
      CREATE INDEX "idx_user_session_user_active"
        ON "user_session" ("user_id")
        WHERE "is_active" = true
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_session_user_active"`)
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_session_jti"`)
    await queryRunner.query(`DROP TABLE IF EXISTS "user_session"`)
  }
}