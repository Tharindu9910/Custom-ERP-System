import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';

dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [path.join(__dirname, '../entities/**/*.entity.ts')],
  synchronize: false,
});

const BCRYPT_ROUNDS = 10;
const PLACEHOLDER_BRANCH = '00000000-0000-0000-0000-000000000001';

const USERS = [
  {
    username: 'superadmin',
    password: 'Super@123',
    full_name: 'Super Admin',
    role: 'SUPER_ADMIN',
    branch_id: null,
  },
  {
    username: 'manager1',
    password: 'Manager@123',
    full_name: 'Branch Manager',
    role: 'MANAGER',
    branch_id: null,
  },
  {
    username: 'admin1',
    password: 'Admin@123',
    full_name: 'Branch Admin',
    role: 'ADMIN',
    branch_id: PLACEHOLDER_BRANCH,
  },
  {
    username: 'supervisor1',
    password: 'Super1@123',
    full_name: 'Supervisor One',
    role: 'SUPERVISOR',
    branch_id: PLACEHOLDER_BRANCH,
  },
  {
    username: 'cashier1',
    password: 'Cashier@123',
    full_name: 'Cashier One',
    role: 'CASHIER',
    branch_id: PLACEHOLDER_BRANCH,
  },
];

async function seed() {
  await ds.initialize();
  console.log('✅ Connected to database');

  for (const u of USERS) {
    const existing = await ds.query(
      `SELECT user_id FROM "user" WHERE username = $1`,
      [u.username],
    );

    if (existing.length > 0) {
      console.log(`   skip  ${u.username} (already exists)`);
      continue;
    }

    const password_hash = await bcrypt.hash(u.password, BCRYPT_ROUNDS);

    const [{ user_id }] = await ds.query<[{ user_id: string }]>(
      `INSERT INTO "user" (full_name, username, password_hash)
       VALUES ($1, $2, $3)
       RETURNING user_id`,
      [u.full_name, u.username, password_hash],
    );

    await ds.query(
      `INSERT INTO "user_role" (user_id, branch_id, role, is_active)
       VALUES ($1, $2, $3::role_enum, true)`,
      [user_id, u.branch_id, u.role],
    );

    console.log(`   seeded ${u.username} (${u.role})`);
  }

  // Verify the unique index: duplicate active role must be rejected
  console.log('\n Verifying unique-active-role constraint...');
  const [{ user_id: testId }] = await ds.query<[{ user_id: string }]>(
    `SELECT user_id FROM "user" WHERE username = 'superadmin'`,
  );
  try {
    await ds.query(
      `INSERT INTO "user_role" (user_id, role, is_active) VALUES ($1, 'SUPER_ADMIN', true)`,
      [testId],
    );
    console.error(
      '❌ Constraint NOT enforced — duplicate active role was inserted!',
    );
    process.exit(1);
  } catch {
    console.log(
      '   ✅ Constraint enforced — duplicate insert correctly rejected',
    );
  }

  await ds.destroy();
  console.log('\n✅ Seed complete');
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
