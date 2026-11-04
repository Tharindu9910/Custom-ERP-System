import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TestApp } from './helpers/app';
import { CASHIER, SUP, newPhone } from './helpers/fixtures';

/** Malformed input gets a coded 400, not a 500; retries replay; audit trail (audit round, Phase 2). */
let t: TestApp;
beforeAll(async () => (t = await TestApp.boot()));
afterAll(() => t.close());

describe('validation: malformed requests get VAL_001, never a 500', () => {
  it('HARD-01 login without a password or with a non-string username', async () => {
    const noPass = t.app.getHttpServer();
    expect((await request(noPass).post('/auth/login').send({ username: 'x' })).status).toBe(400);
    expect((await request(noPass).post('/auth/login').send({ username: { $ne: 1 }, password: 'x' })).status).toBe(400);
  });

  it('HARD-02 a bad id in the path is VAL_001', async () => {
    for (const url of ['/customers/not-a-uuid', '/workers/not-a-uuid', '/gate-passes/not-a-uuid']) {
      const r = url.startsWith('/gate')
        ? await t.as(SUP.thangalla).get(url)
        : await t.as(url.startsWith('/cust') ? CASHIER.thangalla : 'manager_thangalla').patch(url, {});
      expect([url, r.status, r.code]).toEqual([url, 400, 'VAL_001']);
    }
  });

  it('HARD-03 customer and worker bodies: wrong types and oversized values are refused', async () => {
    const bad = await t.as(CASHIER.thangalla).post('/customers', { name: 12, phone: newPhone() });
    expect([bad.status, bad.code]).toEqual([400, 'VAL_001']);
    const long = await t.as(CASHIER.thangalla).post('/customers', { name: 'x'.repeat(500), phone: newPhone() });
    expect(long.status).toBe(400);
    const missing = await t.as(CASHIER.thangalla).post('/customers', {});
    expect(missing.status).toBe(400);
  });

  it('HARD-04 an amount the database cannot hold is refused before the payment is tried', async () => {
    const r = await t.as(CASHIER.thangalla).post(`/orders/${randomUUID()}/payments`, { client_request_id: randomUUID(), amount: 3_000_000_000, mode: 'CASH' });
    expect([r.status, r.code]).toEqual([400, 'VAL_001']);
  });

  it('HARD-05 an impossible calendar date is refused', async () => {
    const r = await t.as(SUP.thangalla).get('/gate-passes?from=2026-02-31');
    expect([r.status, r.code]).toEqual([400, 'VAL_001']);
  });
});

describe('retries and races', () => {
  it('HARD-06 two gate-pass creates racing on one client_request_id both answer with the same pass', async () => {
    const body = { client_request_id: randomUUID(), customer: { phone: newPhone(), name: 'Race Customer' }, items: [{ material_type: 'MS Plain Sheet', thickness: '2', length: 8, length_unit: 'FT', color: 'Blue', quantity: 2 }] };
    const [a, b] = await Promise.all([t.as(SUP.thangalla).post('/gate-passes', body), t.as(SUP.thangalla).post('/gate-passes', body)]);
    expect([a.status, b.status].every((s) => s === 201 || s === 200)).toBe(true);
    expect(a.data.gate_pass_id ?? a.data.summary?.gate_pass_id).toBe(b.data.gate_pass_id ?? b.data.summary?.gate_pass_id);
    const rows = await t.db.query(`SELECT count(*)::int AS n FROM gate_pass WHERE client_request_id = $1`, [body.client_request_id]);
    expect(rows[0].n).toBe(1);
  });
});

describe('audit trail', () => {
  it('HARD-07 login, and a failed login on a real account are recorded', async () => {
    await t.login(SUP.thangalla);
    await t.login(SUP.thangalla, 'wrong-password');
    await new Promise((r) => setTimeout(r, 300)); // the listener writes asynchronously
    const again: { action: string }[] = await t.db.query(
      `SELECT a.action FROM audit_log a JOIN "user" u ON u.user_id = a.user_id WHERE u.username = $1 AND a.entity_type = 'user'`,
      [SUP.thangalla],
    );
    expect(again.map((r) => r.action)).toEqual(expect.arrayContaining(['LOGIN', 'LOGIN_FAILED']));
  });
});

describe('users', () => {
  it('HARD-08 a deactivated user cannot sign in, and reactivating restores it', async () => {
    const username = `hard_deact_${Date.now()}`;
    const made = await t.as('superadmin').post('/users', {
      username, password: 'Dev@1234', full_name: 'Deact Me', role: 'CASHIER', branch_id: '00000000-0000-0000-0000-000000000003',
    });
    expect(made.status).toBe(201);
    const off = await t.as('superadmin').patch(`/users/${made.data.user_id}`, { is_active: false });
    expect([off.status, off.data.is_active]).toEqual([200, false]);
    expect((await t.login(username, 'Dev@1234')).status).toBe(401);
    await t.as('superadmin').patch(`/users/${made.data.user_id}`, { is_active: true });
    expect((await t.login(username, 'Dev@1234')).status).toBe(200);
  });
});
