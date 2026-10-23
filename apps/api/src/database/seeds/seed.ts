import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { BranchSettingsSchema, SYSTEM_ACCOUNTS } from '@erp/shared';
import { ALL_ITEMS, MASTER_RATES, openingStock } from './catalog';

dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [path.join(__dirname, '../entities/**/*.entity.ts')],
  synchronize: false,
});

const BCRYPT_ROUNDS = 10;

// Fixed IDs so the seed is idempotent and references are stable
const BRANCH_NAIWALA = '00000000-0000-0000-0000-000000000001';
const BRANCH_VEYANGODA = '00000000-0000-0000-0000-000000000002';
const BRANCH_THANGALLA = '00000000-0000-0000-0000-000000000003';

// Branch users are seeded as <role>_<branch key> with one dev password.
// apps/web/src/routes/login.tsx (dev quick login) relies on this naming.
const BRANCH_USER_PASSWORD = 'Dev@1234';
// ADMIN is a global (head-office) role, so it is not seeded per branch (Docs/decisions/0002)
const BRANCH_ROLES = ['MANAGER', 'SUPERVISOR', 'CHIEF', 'CASHIER'] as const;

// ── Permissions ────────────────────────────────────────────────────────────
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
  // Supervisor dashboard (Docs/decisions/0001)
  { action: 'view:gate_pass', module: 'gate-passes', description: 'View gate passes and material balances' },
  { action: 'create:gate_pass', module: 'gate-passes', description: 'Record customer material coming in' },
  { action: 'create:roofing_order', module: 'orders', description: 'Place roofing orders (with the placement payment)' },
  { action: 'view:orders', module: 'orders', description: 'View the order queue' },
  { action: 'update:order_status', module: 'orders', description: 'Start and complete roofing orders' },
  { action: 'release:order', module: 'orders', description: 'Release a ready, fully paid order to the customer' },
  { action: 'edit:order', module: 'orders', description: 'Edit a placed roofing order before work starts' },
  { action: 'cancel:order', module: 'orders', description: 'Cancel a placed roofing order' },
  { action: 'view:inventory', module: 'inventory', description: 'View branch stock levels' },
  { action: 'view:stock_alerts', module: 'inventory', description: 'View low and out-of-stock alerts' },
  { action: 'request:stock', module: 'stock-transfers', description: 'Request stock from another branch and receive it' },
  { action: 'send:stock', module: 'stock-transfers', description: 'Send or reject stock requested by another branch' },
  { action: 'create:chief_profile', module: 'users', description: 'Create chief logins for branch employees' },
];

// Default role → permission grants from plan §7
// SUPER_ADMIN bypasses guard in code — never seeded here
// Global roles (ADMIN, AUDITOR) only view branch work; the branch MANAGER runs it (Docs/decisions/0002)
const ROLE_PERMISSION_MATRIX: Record<string, string[]> = {
  ADMIN: [
    'configure:price_list',
    'configure:branch',
    'manage:users',
    'view:audit_log',
    'view:financial_report',
    'view:inventory',
    'view:stock_alerts',
    'view:orders',
  ],
  AUDITOR: ['view:audit_log', 'view:financial_report', 'view:inventory', 'view:stock_alerts', 'view:orders'],
  // process:payment = cashier-queue payments; the roofing placement payment is
  // part of create:roofing_order (Docs/decisions/0001)
  SUPERVISOR: [
    'create:job_card',
    'update:job_card_status',
    'cancel:job_card_draft',
    'create:work_order',
    'complete:work_order',
    'assign:worker',
    'enter_price:customized',
    'enter_price:standard',
    'view:gate_pass',
    'create:gate_pass',
    'create:roofing_order',
    'view:orders',
    'update:order_status',
    'release:order',
    'view:inventory',
    'view:stock_alerts',
    'request:stock',
    'send:stock',
    'create:chief_profile',
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
    'view:gate_pass',
    'create:gate_pass',
    'create:roofing_order',
    'view:orders',
    'update:order_status',
    'view:inventory',
  ],
  CASHIER: [
    'verify_price:standard',
    'process:payment',
    'generate:invoice',
    'complete:customer_profile',
    'create:roofing_order',
    'view:orders',
    'edit:order',
    'cancel:order',
  ],
  MANAGER: [
    'update:job_card_status',
    'cancel:job_card_draft',
    'cancel:job_card_any',
    'manage:workers',
    'override:stock',
    'resolve:conflict_queue',
    'view:audit_log',
    'view:financial_report',
    'view:orders',
    'view:inventory',
    'view:stock_alerts',
  ],
};

// ── Branches ───────────────────────────────────────────────────────────────
const BRANCHES = [
  {
    branch_id: BRANCH_NAIWALA,
    key: 'naiwala',
    code: 'BR-NAI-001',
    name: 'Naiwala',
    branch_type: 'ROOFING',
    // Main branch: stock arrives here and is distributed to the others
    is_main: true,
    location: 'No 45, Veyangoda Road, Naiwala',
    phone: '033 22 555 11',
    settings: {},
    stock_override_password: null as string | null,
  },
  {
    branch_id: BRANCH_VEYANGODA,
    key: 'veyangoda',
    code: 'BR-VEY-001',
    name: 'Veyangoda',
    branch_type: 'WORKSHOP',
    is_main: false,
    location: 'Main Street, Veyangoda',
    phone: '033 22 876 40',
    settings: {},
    stock_override_password: null as string | null,
  },
  {
    branch_id: BRANCH_THANGALLA,
    key: 'thangalla',
    code: 'BR-THA-001',
    name: 'Thangalla',
    branch_type: 'ROOFING_WORKSHOP',
    is_main: false,
    location: 'Matara Road, Thangalla',
    phone: '047 22 401 18',
    settings: { stock_override_enabled: true },
    stock_override_password: 'Override@123' as string | null,
  },
];

// ── Users ──────────────────────────────────────────────────────────────────
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

const USERS: { username: string; password: string; full_name: string; role: string; branch_id: string | null }[] = [
  // Global (head office)
  { username: 'superadmin', password: 'Super@123', full_name: 'Super Admin', role: 'SUPER_ADMIN', branch_id: null },
  { username: 'admin', password: 'Admin@123', full_name: 'Head Office Admin', role: 'ADMIN', branch_id: null },
  { username: 'auditor1', password: 'Auditor@123', full_name: 'Auditor One', role: 'AUDITOR', branch_id: null },
  // One of each branch role per branch, e.g. supervisor_naiwala
  ...BRANCHES.flatMap((b) =>
    BRANCH_ROLES.map((role) => ({
      username: `${role.toLowerCase()}_${b.key}`,
      password: BRANCH_USER_PASSWORD,
      full_name: `${titleCase(role)} (${b.name})`,
      role,
      branch_id: b.branch_id,
    })),
  ),
];

// ── Employees ──────────────────────────────────────────────────────────────
const EMPLOYEES = [
  { branch_id: BRANCH_NAIWALA, full_name: 'Kamal Perera', designation: 'MACHINE OPERATOR', phone: '+94711111001' },
  { branch_id: BRANCH_NAIWALA, full_name: 'Nimal Silva', designation: 'ALL ROUNDER', phone: '+94711111002' },
  { branch_id: BRANCH_THANGALLA, full_name: 'Suresh Fernando', designation: 'MACHINE OPERATOR', phone: '+94711111003' },
  { branch_id: BRANCH_VEYANGODA, full_name: 'Asanka Ranatunga', designation: 'MACHINE OPERATOR', phone: '+94711111004' },
  { branch_id: BRANCH_VEYANGODA, full_name: 'Chamara Jayawardena', designation: 'ALL ROUNDER', phone: '+94711111005' },
  { branch_id: BRANCH_THANGALLA, full_name: 'Priya Kumari', designation: 'CLEANER', phone: '+94711111006' },
  { branch_id: BRANCH_THANGALLA, full_name: 'Ruwan Bandara', designation: 'WORKSHOP CHIEF', phone: '+94711111007' },
  { branch_id: BRANCH_VEYANGODA, full_name: 'Dilshan Wickramasinghe', designation: 'WORKSHOP CHIEF', phone: '+94711111008' },
  { branch_id: BRANCH_THANGALLA, full_name: 'Sampath Kumara', designation: 'ALL ROUNDER', phone: '+94711111009' },
];

// ── Customers ──────────────────────────────────────────────────────────────
const CUSTOMERS = [
  {
    name: 'Mohamed Ali',
    phone: '+94771234567',
    branch_id: BRANCH_NAIWALA,
    customer_type: 'INDIVIDUAL',
  },
  {
    name: 'Samith Traders',
    phone: '+94779876543',
    branch_id: BRANCH_THANGALLA,
    customer_type: 'BUSINESS',
    company_name: 'Samith Traders (Pvt) Ltd',
  },
  {
    name: 'Rathna Builders',
    phone: '+94761234567',
    branch_id: BRANCH_VEYANGODA,
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
  const overrideHash = b.stock_override_password ? await bcrypt.hash(b.stock_override_password, BCRYPT_ROUNDS) : null;
  await ds.query(
    `INSERT INTO branch (branch_id, code, name, branch_type, location, phone, settings, stock_override_password_hash, is_main)
     VALUES ($1, $2, $3, $4::branch_type_enum, $5, $6, $7::jsonb, $8, $9)`,
    [
      b.branch_id,
      b.code,
      b.name,
      b.branch_type,
      b.location,
      b.phone,
      JSON.stringify(BranchSettingsSchema.parse(b.settings)),
      overrideHash,
      b.is_main,
    ],
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

async function upsertUser(
  u: (typeof USERS)[0],
  createdBy: string | null,
): Promise<string> {
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
    `INSERT INTO "user" (full_name, username, password_hash, branch_id, must_change_password, created_by)
     VALUES ($1, $2, $3, $4, false, $5) RETURNING user_id`,
    [u.full_name, u.username, password_hash, u.branch_id, createdBy],
  );

  await ds.query(
    `INSERT INTO user_role (user_id, branch_id, role, is_active, assigned_by)
     VALUES ($1, $2, $3::role_enum, true, $4)`,
    [user_id, u.branch_id, u.role, createdBy],
  );

  console.log(`   seeded user "${u.username}" (${u.role})`);
  return user_id;
}

async function upsertEmployee(e: (typeof EMPLOYEES)[0], createdBy: string) {
  const existing = await ds.query(
    `SELECT employee_id FROM employee WHERE full_name = $1 AND branch_id = $2`,
    [e.full_name, e.branch_id],
  );
  if (existing.length > 0) {
    console.log(`   skip  employee "${e.full_name}" (already exists)`);
    return;
  }
  // employee_code comes from the DB default (EMP-#####)
  await ds.query(
    `INSERT INTO employee (branch_id, full_name, designation, phone, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [e.branch_id, e.full_name, e.designation, e.phone, createdBy],
  );
  console.log(`   seeded employee "${e.full_name}"`);
}

async function upsertCustomer(c: (typeof CUSTOMERS)[0], createdBy: string) {
  const existing = await ds.query(
    `SELECT customer_id FROM customer WHERE phone = $1`,
    [c.phone],
  );
  if (existing.length > 0) {
    console.log(`   skip  customer "${c.name}" (already exists)`);
    return;
  }
  await ds.query(
    `INSERT INTO customer (name, phone, home_branch_id, customer_type, company_name, created_by)
     VALUES ($1, $2, $3, $4::customer_type_enum, $5, $6)`,
    [
      c.name,
      c.phone,
      c.branch_id,
      c.customer_type,
      (c as Record<string, unknown>).company_name ?? null,
      createdBy,
    ],
  );
  console.log(`   seeded customer "${c.name}"`);
}


async function upsertAccounts() {
  for (const a of Object.values(SYSTEM_ACCOUNTS)) {
    const type = a.code.startsWith('1') ? 'ASSET' : a.code.startsWith('2') ? 'LIABILITY' : a.code.startsWith('4') ? 'REVENUE' : 'EXPENSE';
    const normal = type === 'ASSET' || type === 'EXPENSE' ? 'DEBIT' : 'CREDIT';
    await ds.query(
      `INSERT INTO financial_account (code, name, account_type, normal_balance, is_system)
       VALUES ($1, $2, $3::account_type_enum, $4::entry_type_enum, true) ON CONFLICT (code) DO NOTHING`,
      [a.code, a.name, type, normal],
    );
  }
  console.log(`   seeded ${Object.keys(SYSTEM_ACCOUNTS).length} financial accounts`);
}

async function upsertRates(createdBy: string) {
  const [{ count }] = await ds.query<[{ count: string }]>(`SELECT count(*) FROM price_rate WHERE branch_id IS NULL`);
  if (Number(count) > 0) {
    console.log(`   skip  master rates (already exist)`);
    return;
  }
  for (const r of MASTER_RATES) {
    await ds.query(
      `INSERT INTO price_rate (branch_id, line_type, sub_type, variant, work_type, thickness_or_size, material_source, price_basis, rate, created_by)
       VALUES (NULL, $1::line_type_enum, $2::line_sub_type_enum, $3, $4, $5, $6::material_source_enum, $7::price_basis_enum, $8, $9)`,
      [r.line_type, r.sub_type ?? null, r.variant ?? null, r.work_type ?? null, r.thickness_or_size ?? null, r.material_source ?? 'BRANCH', r.price_basis, r.rate, createdBy],
    );
  }
  console.log(`   seeded ${MASTER_RATES.length} master price rates`);
}

async function upsertItems() {
  for (const i of ALL_ITEMS) {
    await ds.query(
      `INSERT INTO item (sku, name, item_type, category, unit, attributes, price, unit_cost)
       VALUES ($1, $2, $3::item_type_enum, $4, $5, $6::jsonb, $7, $8) ON CONFLICT (sku) DO NOTHING`,
      [i.sku, i.name, i.item_type, i.category, i.unit, JSON.stringify(i.attributes), i.price, i.unit_cost],
    );
  }
  console.log(`   seeded ${ALL_ITEMS.length} items`);
}

// Opening stock goes in as LEGACY_OPENING movements so stock = sum of movements
async function upsertStock(branchId: string, code: string, hasRoofing: boolean, createdBy: string) {
  const [{ count }] = await ds.query<[{ count: string }]>(`SELECT count(*) FROM branch_stock WHERE branch_id = $1`, [branchId]);
  if (Number(count) > 0) {
    console.log(`   skip  stock for ${code} (already exists)`);
    return;
  }
  const stock = openingStock(code, hasRoofing);
  for (const [sku, [qty, reorder]] of Object.entries(stock)) {
    const [{ item_id }] = await ds.query<[{ item_id: string }]>(`SELECT item_id FROM item WHERE sku = $1`, [sku]);
    await ds.query(`INSERT INTO branch_stock (branch_id, item_id, quantity, reorder_level) VALUES ($1, $2, $3, $4)`, [branchId, item_id, qty, reorder]);
    if (qty > 0) {
      await ds.query(
        `INSERT INTO stock_movement (branch_id, item_id, movement_type, quantity, quantity_after, reason, created_by)
         VALUES ($1, $2, 'LEGACY_OPENING', $3, $3, 'Opening stock', $4)`,
        [branchId, item_id, qty, createdBy],
      );
    }
    if (qty <= reorder) {
      await ds.query(`INSERT INTO stock_alert (branch_id, item_id, quantity_at_alert) VALUES ($1, $2, $3)`, [branchId, item_id, qty]);
    }
  }
  console.log(`   seeded ${Object.keys(stock).length} stock rows for ${code}`);
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
  // superadmin is first in USERS and becomes created_by for the rest
  for (const u of USERS) {
    userIds[u.username] = await upsertUser(u, userIds['superadmin'] ?? null);
  }

  const superAdminId = userIds['superadmin'];

  console.log('\n── Role Permissions ──────────────────');
  await upsertRolePermissions(superAdminId);

  console.log('\n── Employees ─────────────────────────');
  for (const e of EMPLOYEES) await upsertEmployee(e, superAdminId);

  console.log('\n── Customers ─────────────────────────');
  for (const c of CUSTOMERS) await upsertCustomer(c, superAdminId);

  console.log('\n── Accounts, rates & catalogue ───────');
  await upsertAccounts();
  await upsertRates(superAdminId);
  await upsertItems();
  for (const b of BRANCHES) await upsertStock(b.branch_id, b.code, b.branch_type !== 'WORKSHOP', superAdminId);

  await ds.destroy();
  console.log('\n✅ Seed complete');
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
