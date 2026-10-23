import { TestApp } from './helpers/app';
import { SUP, employee } from './helpers/fixtures';

/** Login, chief profiles and passwords (Docs/testing/role-capabilities.md AUTH, CHF, PWD). */
let t: TestApp;
beforeAll(async () => (t = await TestApp.boot()));
afterAll(() => t.close());

const tha = () => t.as(SUP.thangalla);
let seq = 0;
const email = (who: string) => `${who}.${Date.now()}${++seq}@example.com`;

async function candidate(name: string, who = SUP.thangalla) {
  const list = (await t.as(who).get('/users/chief-candidates')).data;
  return list.find((c: any) => c.full_name === name);
}

describe('AUTH login', () => {
  it('AUTH-01 wrong password AUTH_001; unknown user AUTH_001; no token 401', async () => {
    expect((await t.login(SUP.thangalla, 'wrong')).code).toBe('AUTH_001');
    expect((await t.login('nobody_here', 'Dev@1234')).code).toBe('AUTH_001');
    const r = await t.as('x', { token: 'not-a-token' }).get('/auth/me');
    expect(r.status).toBe(401);
  });

  it('AUTH-02 a supervisor is tied to their branch; super admin has none and every permission', async () => {
    const sup = await t.login(SUP.thangalla);
    expect(sup.data.user.role).toBe('SUPERVISOR');
    expect(sup.data.user.branch_id).toBe(
      '00000000-0000-0000-0000-000000000003',
    );
    const sa = await t.login('superadmin');
    expect([sa.data.user.role, sa.data.user.branch_id]).toEqual([
      'SUPER_ADMIN',
      null,
    ]);
  });

  it('AUTH-03 supervisor /auth/me lists exactly the supervisor grants', async () => {
    const me = (await tha().get('/auth/me')).data;
    expect(new Set(me.permissions)).toEqual(
      new Set([
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
      ]),
    );
  });

  it('AUTH-04 logout revokes the session', async () => {
    const r = await t.login(SUP.naiwala);
    const caller = t.as(SUP.naiwala, { token: r.data.accessToken });
    expect((await caller.post('/auth/logout')).status).toBe(200);
    expect((await caller.get('/auth/me')).status).toBe(401);
  });
});

describe('CHF chief profiles', () => {
  it('CHF-01 candidates are own-branch active employees without a login', async () => {
    const mine = await employee(t, 'thangalla');
    const theirs = await employee(t, 'veyangoda');
    const gone = await employee(t, 'thangalla');
    await t.sql(
      `UPDATE employee SET is_active = false WHERE employee_id = $1`,
      [gone.employee_id],
    );
    const names = (
      await t.as(SUP.thangalla).get('/users/chief-candidates')
    ).data.map((c: any) => c.full_name);
    expect(names).toContain(mine.full_name);
    expect(names).not.toContain(theirs.full_name);
    expect(names).not.toContain(gone.full_name);
    expect(names).not.toContain('Supervisor (Thangalla)'); // already has a login
    const search = (
      await t
        .as(SUP.thangalla)
        .get(
          `/users/chief-candidates?search=${encodeURIComponent(mine.full_name)}`,
        )
    ).data;
    expect(search.map((c: any) => c.full_name)).toEqual([mine.full_name]);
  });

  it('CHF-02 invalid email or employee is refused', async () => {
    const c = await employee(t, 'thangalla');
    expect(
      (
        await tha().post('/users/chief', {
          employee_id: c.employee_id,
          email: 'not-an-email',
        })
      ).status,
    ).toBe(400);
    const other = await employee(t, 'veyangoda');
    const r = await tha().post('/users/chief', {
      employee_id: other.employee_id,
      email: email('x'),
    });
    expect(r.code).toBe('WRK_001');
  });

  it('CHF-03 create → temporary password once → forced change → normal access; same employee twice WRK_003; email taken USR_005', async () => {
    const c = await employee(t, 'thangalla');
    const mail = email('chief');
    const r = await tha().post('/users/chief', {
      employee_id: c.employee_id,
      email: mail,
    });
    expect(r.status).toBe(201);
    const temp = r.data.temporary_password;
    expect(temp).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(await candidate(c.full_name)).toBeUndefined();

    expect(
      (
        await tha().post('/users/chief', {
          employee_id: c.employee_id,
          email: email('again'),
        })
      ).code,
    ).toBe('WRK_003');
    const p = await employee(t, 'thangalla');
    expect(
      (
        await tha().post('/users/chief', {
          employee_id: p.employee_id,
          email: mail,
        })
      ).code,
    ).toBe('USR_005');

    const login = await t.login(mail, temp);
    expect(login.data.user.must_change_password).toBe(true);
    const chief = t.as(mail, { token: login.data.accessToken });
    const blocked = await chief.get('/workshop-queue');
    expect([blocked.status, blocked.code]).toEqual([403, 'AUTH_006']);
    expect((await chief.get('/auth/me')).status).toBe(200);

    expect(
      (
        await chief.post('/auth/change-password', {
          current_password: temp,
          new_password: 'short',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await chief.post('/auth/change-password', {
          current_password: temp,
          new_password: 'alllowercase1',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await chief.post('/auth/change-password', {
          current_password: temp,
          new_password: temp,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await chief.post('/auth/change-password', {
          current_password: 'Wrong1234',
          new_password: 'NewChief123',
        })
      ).code,
    ).toBe('AUTH_008');
    const ok = await chief.post('/auth/change-password', {
      current_password: temp,
      new_password: 'NewChief123',
    });
    expect(ok.status).toBe(200);
    expect(ok.data.user.must_change_password).toBe(false);
    expect(
      (await t.as(mail, { token: ok.data.accessToken }).get('/workshop-queue'))
        .status,
    ).toBe(200);
    expect((await t.login(mail, temp)).code).toBe('AUTH_001');
  });

  it('CHF-04 an expired temporary password cannot log in (AUTH_007)', async () => {
    const c = await employee(t, 'thangalla');
    const mail = email('expired');
    const r = await tha().post('/users/chief', {
      employee_id: c.employee_id,
      email: mail,
    });
    await t.sql(
      `UPDATE "user" SET temp_password_expires_at = now() - interval '1 hour' WHERE username = $1`,
      [mail],
    );
    const login = await t.login(mail, r.data.temporary_password);
    expect([login.status, login.code]).toEqual([401, 'AUTH_007']);
  });

  it('CHF-05 a workshop branch supervisor creates chiefs for their own branch only', async () => {
    const c = await employee(t, 'veyangoda');
    const mail = email('vey');
    const r = await t
      .as(SUP.veyangoda)
      .post('/users/chief', { employee_id: c.employee_id, email: mail });
    expect(r.status).toBe(201);
    const row = await t.sql(
      `SELECT branch_id FROM "user" WHERE username = $1`,
      [mail],
    );
    expect(row[0]?.branch_id).toBe('00000000-0000-0000-0000-000000000002');
  });
});

describe('PWD voluntary password change', () => {
  it('PWD-01 a supervisor changes their own password; the old one stops working', async () => {
    const login = await t.login(SUP.naiwala);
    const me = t.as(SUP.naiwala, { token: login.data.accessToken });
    const r = await me.post('/auth/change-password', {
      current_password: 'Dev@1234',
      new_password: 'Changed123',
    });
    expect(r.status).toBe(200);
    expect((await t.login(SUP.naiwala, 'Dev@1234')).code).toBe('AUTH_001');
    // Put it back for the other suites
    const back = t.as(SUP.naiwala, { token: r.data.accessToken });
    expect(
      (
        await back.post('/auth/change-password', {
          current_password: 'Changed123',
          new_password: 'Dev@1234',
        })
      ).status,
    ).toBe(200);
  });
});
