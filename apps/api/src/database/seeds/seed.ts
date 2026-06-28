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

// Fixed IDs so the seed is idempotent and references are stable
const BRANCH_MAIN = '00000000-0000-0000-0000-000000000001';
const BRANCH_NORTH = '00000000-0000-0000-0000-000000000002';

// ── Permissions (23 total, from plan §7) ───────────────────────────────────
const ALL_PERMISSIONS = [
  {
    action: 'create:job_card',
    module: 'job-cards',
    description: 'Create a new job card',
  },
  {
    action: 'update:job_card_status',
    module: 'job-cards',
    description: 'Advance or revert job card status',
  },
  {
    action: 'cancel:job_card_draft',
    module: 'job-cards',
    description: 'Cancel a DRAFT job card',
  },
  {
    action: 'cancel:job_card_any',
    module: 'job-cards',
    description: 'Cancel a job card in any status',
  },
  {
    action: 'create:work_order',
    module: 'work-orders',
    description: 'Add a work order to a job card',
  },
  {
    action: 'complete:work_order',
    module: 'work-orders',
    description: 'Mark a work order as completed',
  },
  {
    action: 'assign:worker',
    module: 'work-orders',
    description: 'Assign workers to a work order',
  },
  {
    action: 'enter_price:customized',
    module: 'work-orders',
    description: 'Enter customised price on work order',
  },
  {
    action: 'enter_price:standard',
    module: 'work-orders',
    description: 'Enter standard price on work order',
  },
  {
    action: 'verify_price:standard',
    module: 'work-orders',
    description: 'Verify standard price (Cashier)',
  },
  {
    action: 'process:payment',
    module: 'payments',
    description: 'Record a payment',
  },
  {
    action: 'generate:invoice',
    module: 'invoices',
    description: 'Generate invoice for a job card',
  },
  {
    action: 'complete:customer_profile',
    module: 'customers',
    description: 'Complete customer profile (Cashier)',
  },
  {
    action: 'manage:workers',
    module: 'workers',
    description: 'Create, edit and deactivate workers',
  },
  {
    action: 'configure:price_list',
    module: 'price-list',
    description: 'Manage price list entries',
  },
  {
    action: 'configure:branch',
    module: 'branches',
    description: 'Update branch settings and config',
  },
  {
    action: 'override:stock',
    module: 'inventory',
    description: 'Override stock check with password',
  },
  {
    action: 'view:audit_log',
    module: 'audit-logs',
    description: 'View the audit log',
  },
  {
    action: 'view:financial_report',
    module: 'ledger',
    description: 'View financial reports',
  },
  {
    action: 'view:all_branches',
    module: 'branches',
    description: 'View data across all branches',
  },
  {
    action: 'resolve:conflict_queue',
    module: 'offline-sync',
    description: 'Resolve offline sync conflicts',
  },
  {
    action: 'configure:permissions',
    module: 'permissions',
    description: 'Manage role permissions (Super Admin)',
  },
  {
    action: 'manage:users',
    module: 'users',
    description: 'Create and manage system users',
  },
];

// Default role → permission grants from plan §7
// SUPER_ADMIN bypasses guard in code — never seeded here
const ROLE_PERMISSION_MATRIX: Record<string, string[]> = {
  ADMIN: [
    'update:job_card_status',
    'cancel:job_card_draft',
    'cancel:job_card_any',
    'manage:workers',
    'configure:price_list',
    'configure:branch',
    'override:stock',
    'view:audit_log',
    'view:financial_report',
    'resolve:conflict_queue',
    'manage:users',
  ],
  AUDITOR: ['view:audit_log', 'view:financial_report'],
  SUPERVISOR: [
    'create:job_card',
    'update:job_card_status',
    'cancel:job_card_draft',
    'create:work_order',
    'complete:work_order',
    'assign:worker',
    'enter_price:customized',
    'enter_price:standard',
    'process:payment',
  ],
  CHIEF: [
    'create:job_card',
    'update:job_card_status',
    'cancel:job_card_draft',
    'create:work_order',
    'complete:work_order',
    'assign:worker',
    'enter_price:customized',
    'enter_price:standard',
    'process:payment',
  ],
  CASHIER: [
    'verify_price:standard',
    'process:payment',
    'generate:invoice',
    'complete:customer_profile',
  ],
  MANAGER: ['view:audit_log', 'view:financial_report', 'view:all_branches'],
};

// ── Branches ───────────────────────────────────────────────────────────────
const BRANCHES = [
  {
    branch_id: BRANCH_MAIN,
    name: 'Main Branch',
    address: '123 Main Street, Colombo',
    phone: '+94112345678',
  },
  {
    branch_id: BRANCH_NORTH,
    name: 'North Branch',
    address: '45 North Road, Kandy',
    phone: '+94812345678',
  },
];

// ── Users ──────────────────────────────────────────────────────────────────
const USERS = [
  // Cross-branch
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
    username: 'auditor1',
    password: 'Auditor@123',
    full_name: 'Auditor One',
    role: 'AUDITOR',
    branch_id: null,
  },
  // Main branch
  {
    username: 'admin1',
    password: 'Admin@123',
    full_name: 'Admin (Main)',
    role: 'ADMIN',
    branch_id: BRANCH_MAIN,
  },
  {
    username: 'supervisor1',
    password: 'Super1@123',
    full_name: 'Supervisor (Main)',
    role: 'SUPERVISOR',
    branch_id: BRANCH_MAIN,
  },
  {
    username: 'chief1',
    password: 'Chief@123',
    full_name: 'Chief (Main)',
    role: 'CHIEF',
    branch_id: BRANCH_MAIN,
  },
  {
    username: 'cashier1',
    password: 'Cashier@123',
    full_name: 'Cashier (Main)',
    role: 'CASHIER',
    branch_id: BRANCH_MAIN,
  },
  // North branch
  {
    username: 'admin2',
    password: 'Admin2@123',
    full_name: 'Admin (North)',
    role: 'ADMIN',
    branch_id: BRANCH_NORTH,
  },
  {
    username: 'supervisor2',
    password: 'Super2@123',
    full_name: 'Supervisor (North)',
    role: 'SUPERVISOR',
    branch_id: BRANCH_NORTH,
  },
  {
    username: 'cashier2',
    password: 'Cashier2@123',
    full_name: 'Cashier (North)',
    role: 'CASHIER',
    branch_id: BRANCH_NORTH,
  },
];

// ── Workers ────────────────────────────────────────────────────────────────
const WORKERS = [
  { branch_id: BRANCH_MAIN, full_name: 'Kamal Perera', phone: '+94711111001' },
  { branch_id: BRANCH_MAIN, full_name: 'Nimal Silva', phone: '+94711111002' },
  {
    branch_id: BRANCH_MAIN,
    full_name: 'Suresh Fernando',
    phone: '+94711111003',
  },
  {
    branch_id: BRANCH_NORTH,
    full_name: 'Asanka Ranatunga',
    phone: '+94711111004',
  },
  {
    branch_id: BRANCH_NORTH,
    full_name: 'Chamara Jayawardena',
    phone: '+94711111005',
  },
  { branch_id: BRANCH_NORTH, full_name: 'Priya Kumari', phone: '+94711111006' },
];

// ── Customers ──────────────────────────────────────────────────────────────
const CUSTOMERS = [
  {
    full_name: 'Mohamed Ali',
    phone: '+94771234567',
    branch_id: BRANCH_MAIN,
    customer_type: 'INDIVIDUAL',
  },
  {
    full_name: 'Samith Traders',
    phone: '+94779876543',
    branch_id: BRANCH_MAIN,
    customer_type: 'BUSINESS',
    company_name: 'Samith Traders (Pvt) Ltd',
  },
  {
    full_name: 'Rathna Builders',
    phone: '+94761234567',
    branch_id: BRANCH_NORTH,
    customer_type: 'BUSINESS',
    company_name: 'Rathna Construction Ltd',
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

async function upsertBranch(b: (typeof BRANCHES)[0]) {
  const exists = await ds.query(
    `SELECT branch_id FROM branch WHERE branch_id = $1`,
    [b.branch_id],
  );
  if (exists.length > 0) {
    console.log(`   skip  branch "${b.name}" (already exists)`);
    return;
  }
  await ds.query(
    `INSERT INTO branch (branch_id, name, address, phone) VALUES ($1, $2, $3, $4)`,
    [b.branch_id, b.name, b.address, b.phone],
  );
  await ds.query(
    `INSERT INTO branch_config (branch_id, min_advance_pct_customized, min_advance_pct_standard, stock_override_enabled)
     VALUES ($1, 30, 0, false)
     ON CONFLICT (branch_id) DO NOTHING`,
    [b.branch_id],
  );
  console.log(`   seeded branch "${b.name}"`);
}

async function upsertPermissions() {
  for (const p of ALL_PERMISSIONS) {
    await ds.query(
      `INSERT INTO permission (action, module, description, is_system)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (action) DO NOTHING`,
      [p.action, p.module, p.description],
    );
  }
  console.log(`   seeded ${ALL_PERMISSIONS.length} permissions`);
}

async function upsertRolePermissions(superAdminId: string) {
  for (const [role, actions] of Object.entries(ROLE_PERMISSION_MATRIX)) {
    for (const action of actions) {
      const [perm] = await ds.query<[{ permission_id: string }]>(
        `SELECT permission_id FROM permission WHERE action = $1`,
        [action],
      );
      if (!perm) {
        console.warn(`   WARN: permission "${action}" not found`);
        continue;
      }

      await ds.query(
        `INSERT INTO role_permission (role, permission_id, granted, set_by)
         VALUES ($1::role_enum, $2, true, $3)
         ON CONFLICT (role, permission_id) DO UPDATE SET granted = true`,
        [role, perm.permission_id, superAdminId],
      );
    }
    console.log(`   seeded permissions for ${role}`);
  }
}

async function upsertUser(u: (typeof USERS)[0]): Promise<string> {
  const existing = await ds.query<[{ user_id: string }]>(
    `SELECT user_id FROM "user" WHERE username = $1`,
    [u.username],
  );
  if (existing.length > 0) {
    console.log(`   skip  user "${u.username}" (already exists)`);
    return existing[0].user_id;
  }

  const password_hash = await bcrypt.hash(u.password, BCRYPT_ROUNDS);
  const [{ user_id }] = await ds.query<[{ user_id: string }]>(
    `INSERT INTO "user" (full_name, username, password_hash, branch_id)
     VALUES ($1, $2, $3, $4) RETURNING user_id`,
    [u.full_name, u.username, password_hash, u.branch_id],
  );

  await ds.query(
    `INSERT INTO user_role (user_id, branch_id, role, is_active)
     VALUES ($1, $2, $3::role_enum, true)`,
    [user_id, u.branch_id, u.role],
  );

  console.log(`   seeded user "${u.username}" (${u.role})`);
  return user_id;
}

async function upsertWorker(w: (typeof WORKERS)[0], createdBy: string) {
  const existing = await ds.query(
    `SELECT worker_id FROM worker WHERE full_name = $1 AND branch_id = $2`,
    [w.full_name, w.branch_id],
  );
  if (existing.length > 0) {
    console.log(`   skip  worker "${w.full_name}" (already exists)`);
    return;
  }
  await ds.query(
    `INSERT INTO worker (branch_id, full_name, phone, created_by) VALUES ($1, $2, $3, $4)`,
    [w.branch_id, w.full_name, w.phone, createdBy],
  );
  console.log(`   seeded worker "${w.full_name}"`);
}

async function upsertCustomer(c: (typeof CUSTOMERS)[0]) {
  const existing = await ds.query(
    `SELECT customer_id FROM customer WHERE phone = $1`,
    [c.phone],
  );
  if (existing.length > 0) {
    console.log(`   skip  customer "${c.full_name}" (already exists)`);
    return;
  }
  await ds.query(
    `INSERT INTO customer (full_name, phone, branch_id, customer_type, company_name)
     VALUES ($1, $2, $3, $4::customer_type_enum, $5)`,
    [
      c.full_name,
      c.phone,
      c.branch_id,
      c.customer_type,
      (c as Record<string, unknown>).company_name ?? null,
    ],
  );
  console.log(`   seeded customer "${c.full_name}"`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function seed() {
  await ds.initialize();
  console.log('✅ Connected to database\n');

  console.log('── Branches ──────────────────────────');
  for (const b of BRANCHES) await upsertBranch(b);

  console.log('\n── Permissions ───────────────────────');
  await upsertPermissions();

  console.log('\n── Users ─────────────────────────────');
  const userIds: Record<string, string> = {};
  for (const u of USERS) {
    userIds[u.username] = await upsertUser(u);
  }

  const superAdminId = userIds['superadmin'];

  console.log('\n── Role Permissions ──────────────────');
  await upsertRolePermissions(superAdminId);

  console.log('\n── Workers ───────────────────────────');
  for (const w of WORKERS) await upsertWorker(w, superAdminId);

  console.log('\n── Customers ─────────────────────────');
  for (const c of CUSTOMERS) await upsertCustomer(c);

  await ds.destroy();
  console.log('\n✅ Seed complete');
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
