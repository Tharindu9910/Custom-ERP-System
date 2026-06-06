import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserAndUserRole1748700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "role_enum" AS ENUM (
        'SUPER_ADMIN', 'ADMIN', 'AUDITOR',
        'SUPERVISOR', 'CHIEF', 'CASHIER', 'MANAGER'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user" (
        "user_id"       UUID NOT NULL DEFAULT gen_random_uuid(),
        "branch_id"     UUID,
        "full_name"     VARCHAR NOT NULL,
        "username"      VARCHAR NOT NULL,
        "password_hash" VARCHAR NOT NULL,
        "phone"         VARCHAR,
        "is_active"     BOOLEAN NOT NULL DEFAULT true,
        "created_at"    TIMESTAMP NOT NULL DEFAULT now(),
        "last_login_at" TIMESTAMP,
        CONSTRAINT "PK_user" PRIMARY KEY ("user_id"),
        CONSTRAINT "UQ_user_username" UNIQUE ("username")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_role" (
        "user_role_id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "user_id"      UUID NOT NULL,
        "branch_id"    UUID,
        "role"         "role_enum" NOT NULL,
        "assigned_by"  UUID,
        "is_active"    BOOLEAN NOT NULL DEFAULT true,
        "assigned_at"  TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_role" PRIMARY KEY ("user_role_id"),
        CONSTRAINT "FK_user_role_user" FOREIGN KEY ("user_id")
          REFERENCES "user" ("user_id") ON DELETE CASCADE
      )
    `);

    // One active role per user — enforced at DB level
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_user_role_one_active"
        ON "user_role" ("user_id")
        WHERE "is_active" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_role_one_active"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_role"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "role_enum"`);
  }
}
