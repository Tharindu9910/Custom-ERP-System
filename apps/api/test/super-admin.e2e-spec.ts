import { randomUUID } from 'node:crypto';
import { BRANCH, OVERRIDE_PASSWORD, TestApp } from './helpers/app';
import { CUSTOM_LINE, SUP, jobCardBody, material, newPhone, workerIds } from './helpers/fixtures';

/** Super Admin settings: branches, config, users, role permissions (Docs/testing/role-capabilities.md SA). */
let t: TestApp;
beforeAll(async () => (t = await TestApp.boot()));
afterAll(() => t.close());

const sa = () => t.as('superadmin');
const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const setFeature = (
  branch: keyof typeof BRANCH,
  feature: string,
  on: boolean,
) =>
  sa().patch(`/branches/${BRANCH[branch]}/config`, {
    features: { [feature]: on },
  });

describe('SA-BR branches', () => {
  it('SA-BR-01 adds a branch; a duplicate code is refused (BR_002); ADMIN cannot add one (AUTH_004)', async () => {
    const code = `BR-E2E-${unique()}`;
    const r = await sa().post('/branches', {
      code,
      name: `E2E Branch ${unique()}`,
      branch_type: 'WORKSHOP',
    });
    expect(r.status).toBe(201);
    expect(
      (
        await sa().post('/branches', {
          code,
          name: 'Other',
          branch_type: 'WORKSHOP',
        })
      ).code,
    ).toBe('BR_002');
    expect(
      (
        await t.as('admin').post('/branches', {
          code: `BR-ADM-${unique()}`,
          name: 'Admin try',
          branch_type: 'ROOFING',
        })
      ).code,
    ).toBe('AUTH_004');
    // A new active branch with stock requests on is offered as a transfer target
    const targets = (
      await t.as(SUP.thangalla).get('/stock-transfers/targets')
    ).data.map((x: any) => x.branch_id);
    expect(targets).toContain(r.data.branch_id);
    // Deactivating it removes it again
    await sa().patch(`/branches/${r.data.branch_id}`, { is_active: false });
    expect(
      (await t.as(SUP.thangalla).get('/stock-transfers/targets')).data.map(
        (x: any) => x.branch_id,
      ),
    ).not.toContain(r.data.branch_id);
  });

  it('SA-BR-02 there is always one active main branch (BR_004, BR_005); the flag can move and back', async () => {
    expect(
      (await sa().patch(`/branches/${BRANCH.naiwala}`, { is_main: false }))
        .code,
    ).toBe('BR_004');
    expect(
      (await sa().patch(`/branches/${BRANCH.naiwala}`, { is_active: false }))
        .code,
    ).toBe('BR_005');
    const moved = await sa().patch(`/branches/${BRANCH.veyangoda}`, {
      is_main: true,
    });
    expect(moved.status).toBe(200);
    const list = (await sa().get('/branches')).data;
    expect(
      list.filter((b: any) => b.is_main).map((b: any) => b.branch_id),
    ).toEqual([BRANCH.veyangoda]);
    expect(
      (await sa().patch(`/branches/${BRANCH.naiwala}`, { is_main: true }))
        .status,
    ).toBe(200);
  });

  it('SA-BR-03 edits branch details; ADMIN can view config but not change details', async () => {
    const r = await sa().patch(`/branches/${BRANCH.thangalla}`, {
      phone: '0112223334',
    });
    expect(r.status).toBe(200);
    expect(
      (
        await t
          .as('admin')
          .patch(`/branches/${BRANCH.thangalla}`, { phone: '0' })
      ).code,
    ).toBe('AUTH_004');
    expect(
      (await t.as('admin').get(`/branches/${BRANCH.thangalla}/config`)).status,
    ).toBe(200);
  });
});

describe('SA-CFG branch config drives supervisor access', () => {
  it.each([
    ['gatePass', '/gate-passes'],
    ['inventory', '/inventory'],
    ['stockAlerts', '/stock-alerts'],
    ['stockRequest', '/stock-transfers?direction=OUTGOING'],
    ['chiefProfiles', '/users/chief-candidates'],
  ])(
    'SA-CFG-01 turning off %s blocks the supervisor (CTX_002) until turned back on',
    async (feature, url) => {
      try {
        expect((await setFeature('thangalla', feature, false)).status).toBe(
          200,
        );
        const off = await t.as(SUP.thangalla).get(url);
        expect([off.status, off.code]).toEqual([403, 'CTX_002']);
      } finally {
        await setFeature('thangalla', feature, true);
      }
      expect((await t.as(SUP.thangalla).get(url)).status).toBe(200);
    },
  );

  it('SA-CFG-02 a branch with stock requests off is no longer a target (TRF_009)', async () => {
    try {
      await setFeature('naiwala', 'stockRequest', false);
      const names = (
        await t.as(SUP.thangalla).get('/stock-transfers/targets')
      ).data.map((x: any) => x.name);
      expect(names).not.toContain('Naiwala');
      const r = await t.as(SUP.thangalla).post('/stock-transfers', {
        client_request_id: randomUUID(),
        supplying_branch_id: BRANCH.naiwala,
        needed_before: new Date().toISOString().slice(0, 10),
        lines: [{ item_id: await t.itemId('CON-CD-100'), quantity: 1 }],
      });
      expect(r.code).toBe('TRF_009');
    } finally {
      await setFeature('naiwala', 'stockRequest', true);
    }
  });

  it('SA-CFG-03 invalid settings are refused (400)', async () => {
    const r = await sa().patch(`/branches/${BRANCH.thangalla}/config`, {
      orders: { max_discount_pct: 500 },
    });
    expect(r.status).toBe(400);
    expect(
      (
        await sa().patch(`/branches/${BRANCH.thangalla}/config`, {
          not_a_section: true,
        })
      ).status,
    ).toBe(400);
  });

  it('SA-CFG-04 the override password set here is the one the supervisor must enter', async () => {
    const m = await material(t, 'thangalla', 1);
    const lines = [
      {
        job_type: 'CUT_BEND',
        material_type: m.material_type,
        thickness: m.thickness,
        material_quantity: m.quantity + 5,
        cut_count: 1,
      },
      CUSTOM_LINE,
    ];
    const workers = await workerIds(t, SUP.thangalla, 1);
    // override:stock is MANAGER-only by default; the Super Admin lets supervisors use it here
    await t.withGrant('SUPERVISOR', 'override:stock', async () => {
      try {
        await sa().patch(`/branches/${BRANCH.thangalla}/config`, {
          stock_override_password: 'NewOverride@1',
        });
        const old = await t.as(SUP.thangalla).post(
          '/job-cards',
          jobCardBody(newPhone(), workers, lines, {
            override: { password: OVERRIDE_PASSWORD, reason: 'Old password' },
          }),
        );
        expect(old.code).toBe('STK_002');
        const ok = await t.as(SUP.thangalla).post(
          '/job-cards',
          jobCardBody(newPhone(), workers, lines, {
            override: { password: 'NewOverride@1', reason: 'New password' },
          }),
        );
        expect(ok.status).toBe(201);
      } finally {
        await sa().patch(`/branches/${BRANCH.thangalla}/config`, {
          stock_override_password: OVERRIDE_PASSWORD,
        });
      }
    });
  });
});

describe('SA-USR users', () => {
  it('SA-USR-01 lists every user, head office included', async () => {
    const users = (await sa().get('/users')).data;
    const names = users.map((u: any) => u.username);
    expect(names).toEqual(
      expect.arrayContaining([
        'superadmin',
        'admin',
        SUP.thangalla,
        SUP.veyangoda,
      ]),
    );
  });

  it('SA-USR-02 branch roles need a branch (USR_004); head-office roles must not have one (USR_006); duplicate username (USR_003)', async () => {
    const base = { password: 'Dev@1234', full_name: 'E2E User' };
    expect(
      (
        await sa().post('/users', {
          ...base,
          username: `e2e_${unique()}`,
          role: 'CASHIER',
        })
      ).code,
    ).toBe('USR_004');
    expect(
      (
        await sa().post('/users', {
          ...base,
          username: `e2e_${unique()}`,
          role: 'AUDITOR',
          branch_id: BRANCH.thangalla,
        })
      ).code,
    ).toBe('USR_006');
    expect(
      (
        await sa().post('/users', {
          ...base,
          username: SUP.thangalla,
          role: 'CASHIER',
          branch_id: BRANCH.thangalla,
        })
      ).code,
    ).toBe('USR_003');
  });

  it('SA-USR-03 creates a branch user and a head-office user, both can log in', async () => {
    const branchUser = `e2e_cashier_${unique()}`;
    expect(
      (
        await sa().post('/users', {
          username: branchUser,
          password: 'Dev@1234',
          full_name: 'E2E Cashier',
          role: 'CASHIER',
          branch_id: BRANCH.thangalla,
        })
      ).status,
    ).toBe(201);
    const global = `e2e_auditor_${unique()}`;
    expect(
      (
        await sa().post('/users', {
          username: global,
          password: 'Dev@1234',
          full_name: 'E2E Auditor',
          role: 'AUDITOR',
        })
      ).status,
    ).toBe(201);
    expect((await t.login(branchUser, 'Dev@1234')).data.user.branch_id).toBe(
      BRANCH.thangalla,
    );
    expect((await t.login(global, 'Dev@1234')).data.user.branch_id).toBeNull();
  });

  it('SA-USR-04 only a super admin grants SUPER_ADMIN', async () => {
    const u = (
      await sa().post('/users', {
        username: `e2e_up_${unique()}`,
        password: 'Dev@1234',
        full_name: 'E2E Up',
        role: 'AUDITOR',
      })
    ).data;
    expect(
      (
        await t
          .as('admin')
          .patch(`/users/${u.user_id}/role`, { role: 'SUPER_ADMIN' })
      ).code,
    ).toBe('AUTH_004');
  });

  it('SA-USR-05 deactivating a user ends their session and blocks login (AUTH_005); activating restores it', async () => {
    const username = `e2e_sup_${unique()}`;
    const created = await sa().post('/users', {
      username,
      password: 'Dev@1234',
      full_name: 'E2E Sup',
      role: 'SUPERVISOR',
      branch_id: BRANCH.thangalla,
    });
    expect(created.status).toBe(201);
    const u = created.data;
    const login = await t.login(username, 'Dev@1234');
    const me = t.as(username, { token: login.data.accessToken });
    expect((await me.get('/auth/me')).status).toBe(200);
    expect(
      (await sa().patch(`/users/${u.user_id}`, { is_active: false })).status,
    ).toBe(200);
    expect((await me.get('/auth/me')).status).toBe(401);
    expect((await t.login(username, 'Dev@1234')).code).toBe('AUTH_005');
    await sa().patch(`/users/${u.user_id}`, { is_active: true });
    expect((await t.login(username, 'Dev@1234')).status).toBe(200);
  });
});

describe('SA-USR blank and duplicate emails', () => {
  it('SA-USR-06 a blank email is "no email" (two such users are fine); a taken email is refused (USR_005)', async () => {
    const base = {
      password: 'Dev@1234',
      full_name: 'E2E Blank',
      role: 'CASHIER',
      branch_id: BRANCH.thangalla,
      email: '',
      phone: '',
    };
    expect(
      (
        await sa().post('/users', {
          ...base,
          username: `e2e_blank_a_${unique()}`,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await sa().post('/users', {
          ...base,
          username: `e2e_blank_b_${unique()}`,
        })
      ).status,
    ).toBe(201);
    const mail = `taken.${unique()}@example.com`;
    expect(
      (
        await sa().post('/users', {
          ...base,
          username: `e2e_mail_a_${unique()}`,
          email: mail,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await sa().post('/users', {
          ...base,
          username: `e2e_mail_b_${unique()}`,
          email: mail,
        })
      ).code,
    ).toBe('USR_005');
  });
});

describe('SA-PRM role permissions', () => {
  it('SA-PRM-01 the matrix covers every role except SUPER_ADMIN; ADMIN cannot open it', async () => {
    const roles = (await sa().get('/permissions/roles')).data.map(
      (r: any) => r.role,
    );
    expect(roles).not.toContain('SUPER_ADMIN');
    expect(roles).toEqual(
      expect.arrayContaining([
        'ADMIN',
        'AUDITOR',
        'SUPERVISOR',
        'CHIEF',
        'CASHIER',
        'MANAGER',
      ]),
    );
    expect((await t.as('admin').get('/permissions/roles')).code).toBe(
      'AUTH_004',
    );
  });

  it('SA-PRM-02 revoking view:inventory from SUPERVISOR takes effect at once; granting it back restores access', async () => {
    const sup = (await sa().get('/permissions/roles')).data.find(
      (r: any) => r.role === 'SUPERVISOR',
    );
    const perm = sup.permissions.find(
      (p: any) => p.action === 'view:inventory',
    );
    try {
      await sa().patch('/permissions/roles', {
        role: 'SUPERVISOR',
        updates: [{ permission_id: perm.permission_id, granted: false }],
      });
      expect((await t.as(SUP.thangalla).get('/inventory')).code).toBe(
        'AUTH_004',
      );
      expect(
        (await t.as(SUP.thangalla).get('/auth/me')).data.permissions,
      ).not.toContain('view:inventory');
    } finally {
      await sa().patch('/permissions/roles', {
        role: 'SUPERVISOR',
        updates: [{ permission_id: perm.permission_id, granted: true }],
      });
    }
    expect((await t.as(SUP.thangalla).get('/inventory')).status).toBe(200);
  });

  it('SA-PRM-03 refuses grants that would have no effect or escalate: SUPER_ADMIN role, Super-Admin-only permissions, branch writes for head office, unknown ids', async () => {
    const id = async (action: string) =>
      (await t.sql(`SELECT permission_id FROM permission WHERE action = $1`, [action]))[0].permission_id;
    const patch = (role: string, permission_id: string, granted = true) =>
      sa().patch('/permissions/roles', { role, updates: [{ permission_id, granted }] });

    expect((await patch('SUPER_ADMIN', await id('view:inventory'))).code).toBe('VAL_001');
    expect((await patch('MANAGER', await id('configure:permissions'))).code).toBe('PRM_002');
    expect((await patch('ADMIN', await id('create:job_card'))).code).toBe('PRM_003');
    expect((await patch('AUDITOR', await id('process:payment'))).code).toBe('PRM_003');
    expect((await patch('MANAGER', randomUUID())).code).toBe('PRM_001');
    // Removing a branch write from head office is always allowed (nothing to grant)
    expect((await patch('ADMIN', await id('create:job_card'), false)).status).toBe(200);
    // Nothing was granted along the way
    expect((await t.as('admin').get('/auth/me')).data.permissions).not.toContain('create:job_card');
  });

  it('SA-PRM-04 manage:branches decides who adds branches: ADMIN is refused until it is ticked', async () => {
    const body = () => ({ code: `BR-PRM-${unique()}`, name: `Perm Branch ${unique()}`, branch_type: 'WORKSHOP' });
    expect((await t.as('admin').post('/branches', body())).code).toBe('AUTH_004');
    const r = await t.withGrant('ADMIN', 'manage:branches', () => t.as('admin').post('/branches', body()));
    expect(r.status).toBe(201);
    expect((await t.as('admin').post('/branches', body())).code).toBe('AUTH_004');
    // Keep it out of other specs' transfer targets
    await sa().patch(`/branches/${r.data.branch_id}`, { is_active: false });
  });

  it('SA-PRM-05 view:job_cards opens the workshop queue: revoking it from SUPERVISOR closes it; head office reads it', async () => {
    const queue = '/workshop-queue';
    expect((await t.as(SUP.thangalla).get(queue)).status).toBe(200);
    expect((await t.as('admin', { branch: 'thangalla' }).get(queue)).status).toBe(200);
    expect((await t.as('auditor1', { branch: 'thangalla' }).get(queue)).status).toBe(200);
    try {
      expect((await t.setGrant('SUPERVISOR', 'view:job_cards', false)).status).toBe(200);
      expect((await t.as(SUP.thangalla).get(queue)).code).toBe('AUTH_004');
    } finally {
      await t.setGrant('SUPERVISOR', 'view:job_cards', true);
    }
    expect((await t.as(SUP.thangalla).get(queue)).status).toBe(200);
  });

  it('SA-PRM-06 a save is audited with what was granted and revoked', async () => {
    await t.setGrant('CASHIER', 'view:stock_alerts', true);
    await t.setGrant('CASHIER', 'view:stock_alerts', false);
    // The audit write is asynchronous (never blocks the save)
    let rows: any[] = [];
    for (let i = 0; i < 20 && rows.length < 2; i++) {
      rows = await t.sql(
        `SELECT new_value FROM audit_log WHERE action = 'UPDATE_ROLE_PERMISSIONS' AND new_value->>'role' = 'CASHIER'
         ORDER BY logged_at DESC LIMIT 2`,
      );
      if (rows.length < 2) await new Promise((r) => setTimeout(r, 50));
    }
    expect(rows[0].new_value).toMatchObject({ revoked: ['view:stock_alerts'], granted: [] });
    expect(rows[1].new_value).toMatchObject({ granted: ['view:stock_alerts'], revoked: [] });
  });
});

describe('SA-VIEW head office views', () => {
  it('SA-VIEW-01 network inventory covers every branch, main first', async () => {
    const r = (await sa().get('/network/inventory')).data;
    expect(JSON.stringify(r)).toContain('Naiwala');
  });

  it('SA-VIEW-02 customers: head office reads all but cannot add (G2)', async () => {
    expect((await sa().get('/customers')).status).toBe(200);
    expect(
      (await sa().post('/customers', { name: 'HO', phone: '0770000001' })).code,
    ).toBe('CTX_003');
  });
});
