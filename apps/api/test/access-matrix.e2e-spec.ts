import { randomUUID } from 'node:crypto';
import { BRANCH, TestApp } from './helpers/app';
import {
  CASHIER,
  SUP,
  colomboToday,
  gatePass,
  jobCard,
  jobCardBody,
  newPhone,
  readyRoofingOrder,
  richCoil,
  roofingOrder,
  sheetLine,
  transfer,
  workerIds,
} from './helpers/fixtures';

/**
 * Who may call what (Docs/testing/role-capabilities.md §Access).
 * SA = superadmin (global, view-only on branch work); SUP = supervisor (own branch only).
 */
let t: TestApp;
const SA = 'superadmin';
const fake = randomUUID();

// Records the forbidden calls aim at; built by Thangalla staff
let gp: any,
  draftCard: any,
  paidCard: any,
  placed: any,
  ready: any,
  toThangalla: any,
  fromThangalla: any,
  coil: any,
  workers: string[];

beforeAll(async () => {
  t = await TestApp.boot();
  gp = await gatePass(t);
  draftCard = await jobCard(t);
  paidCard = await jobCard(t, { paid: true });
  placed = await roofingOrder(t);
  ready = await readyRoofingOrder(t);
  toThangalla = await transfer(t, 'veyangoda', 'thangalla', [
    ['FST-NM-012', 5],
  ]);
  fromThangalla = await transfer(t, 'thangalla', 'naiwala', [
    ['CON-CD-100', 2],
  ]);
  coil = await richCoil(t);
  workers = await workerIds(t, SUP.thangalla, 1);
});
afterAll(() => t.close());

describe('ACC-SA-READ head office reads any branch (X-Branch-Id) but needs one picked', () => {
  const reads = [
    '/gate-passes',
    '/workshop-queue',
    '/roofing-queue',
    '/inventory',
    '/stock-alerts',
    '/stock-transfers?direction=INCOMING',
    '/stock-transfers?direction=OUTGOING',
    '/cashier-queue',
    '/workers',
    '/branches/current',
  ];
  it.each(reads)('ACC-01 SA GET %s at Thangalla → 200', async (url) => {
    const r = await t.as(SA, { branch: 'thangalla' }).get(url);
    expect(r.status).toBe(200);
  });
  it.each([
    '/gate-passes',
    '/workshop-queue',
    '/roofing-queue',
    '/inventory',
    '/stock-alerts',
    '/cashier-queue',
  ])('ACC-02 SA GET %s with no branch picked → 400 CTX_001', async (url) => {
    const r = await t.as(SA).get(url);
    expect([r.status, r.code]).toEqual([400, 'CTX_001']);
  });
  it('ACC-03 SA reads a record of the picked branch (gate pass, order, transfer)', async () => {
    const sa = t.as(SA, { branch: 'thangalla' });
    expect((await sa.get(`/gate-passes/${gp.gate_pass_id}`)).status).toBe(200);
    expect((await sa.get(`/orders/${placed.order_id}`)).status).toBe(200);
    expect(
      (await sa.get(`/stock-transfers/${toThangalla.transfer_id}`)).status,
    ).toBe(200);
  });
  it('ACC-04 SA with another branch picked does not see Thangalla records (404)', async () => {
    const sa = t.as(SA, { branch: 'naiwala' });
    expect((await sa.get(`/orders/${placed.order_id}`)).status).toBe(404);
    expect((await sa.get(`/gate-passes/${gp.gate_pass_id}`)).status).toBe(404);
  });
  it('ACC-05 SA network views list every branch', async () => {
    const sa = t.as(SA);
    expect((await sa.get('/network/inventory')).status).toBe(200);
    expect((await sa.get('/network/stock-alerts')).status).toBe(200);
    expect((await sa.get('/network/stock-transfers')).status).toBe(200);
  });
  it('ACC-06 SA feature-off and wrong-section branches are refused (CTX_002)', async () => {
    expect(
      (await t.as(SA, { branch: 'veyangoda' }).get('/roofing-queue')).code,
    ).toBe('CTX_002');
    expect(
      (await t.as(SA, { branch: 'naiwala' }).get('/workshop-queue')).code,
    ).toBe('CTX_002');
  });
});

describe('ACC-SA-WRITE head office cannot change branch work (403 CTX_003)', () => {
  const sa = () => t.as(SA, { branch: 'thangalla' });
  const writes: [string, () => Promise<{ status: number; code?: string }>][] = [
    [
      'create gate pass',
      () =>
        sa().post('/gate-passes', {
          client_request_id: randomUUID(),
          customer: { phone: newPhone(), name: 'X' },
          items: [{ material_type: 'MS Plain Sheet', quantity: 1 }],
        }),
    ],
    [
      'create job card',
      () =>
        sa().post(
          '/job-cards',
          jobCardBody(newPhone(), workers, [
            {
              job_type: 'ROLLING',
              rolling_type: 'Pipe Bending',
              work_type: 'GI Pipe',
              size: '1"',
              quantity: 1,
            },
          ]),
        ),
    ],
    [
      'edit job card',
      () =>
        sa().put(`/job-cards/${draftCard.order_id}`, {
          ...jobCardBody(newPhone(), workers, [
            {
              job_type: 'ROLLING',
              rolling_type: 'Pipe Bending',
              work_type: 'GI Pipe',
              size: '1"',
              quantity: 1,
            },
          ]),
          client_request_id: undefined,
          version: draftCard.version,
        }),
    ],
    [
      'void job card',
      () =>
        sa().post(`/job-cards/${draftCard.order_id}/void`, {
          reason: 'Head office test',
        }),
    ],
    [
      'start line',
      () =>
        sa().post(`/order-lines/${paidCard.lines[0].line_id}/start`, {
          version: paidCard.lines[0].version,
        }),
    ],
    [
      'complete line',
      () =>
        sa().post(`/order-lines/${paidCard.lines[0].line_id}/complete`, {
          version: paidCard.lines[0].version,
        }),
    ],
    [
      'place roofing order',
      () =>
        sa().post('/roofing-orders', {
          client_request_id: randomUUID(),
          customer: { phone: newPhone(), name: 'X' },
          order_date: colomboToday(),
          lines: [sheetLine(coil.item_id)],
          payment: { amount: 100000, mode: 'CASH' },
        }),
    ],
    [
      'start roofing order',
      () =>
        sa().post(`/roofing-orders/${placed.order_id}/start`, {
          version: placed.version,
        }),
    ],
    [
      'complete roofing order',
      () =>
        sa().post(`/roofing-orders/${placed.order_id}/complete`, {
          version: placed.version,
        }),
    ],
    [
      'release roofing order',
      () =>
        sa().post(`/roofing-orders/${ready.order_id}/release`, {
          version: ready.version,
          released_to: 'Someone',
        }),
    ],
    [
      'cancel roofing order',
      () =>
        sa().post(`/roofing-orders/${placed.order_id}/cancel`, {
          reason: 'Head office test',
        }),
    ],
    [
      'record payment',
      () =>
        sa().post(`/orders/${placed.order_id}/payments`, {
          client_request_id: randomUUID(),
          amount: 100,
          mode: 'CASH',
        }),
    ],
    [
      'create stock request',
      () =>
        sa().post('/stock-transfers', {
          client_request_id: randomUUID(),
          supplying_branch_id: BRANCH.naiwala,
          needed_before: colomboToday(2),
          lines: [{ item_id: fake, quantity: 1 }],
        }),
    ],
    [
      'send stock',
      () =>
        sa().post(`/stock-transfers/${toThangalla.transfer_id}/send`, {
          lines: [
            {
              transfer_line_id: toThangalla.lines[0].transfer_line_id,
              qty_sent: 1,
            },
          ],
        }),
    ],
    [
      'reject stock request',
      () =>
        sa().post(`/stock-transfers/${toThangalla.transfer_id}/reject`, {
          reason: 'Head office test',
        }),
    ],
    [
      'cancel stock request',
      () => sa().post(`/stock-transfers/${fromThangalla.transfer_id}/cancel`),
    ],
    [
      'receive stock',
      () =>
        sa().post(`/stock-transfers/${fromThangalla.transfer_id}/receive`, {
          lines: [
            {
              transfer_line_id: fromThangalla.lines[0].transfer_line_id,
              qty_received: 1,
            },
          ],
        }),
    ],
    [
      'create chief profile',
      () =>
        sa().post('/users/chief', {
          employee_id: fake,
          email: 'chief.sa@example.com',
        }),
    ],
    [
      'add worker',
      () =>
        sa().post('/workers', {
          full_name: 'SA Worker',
          designation: 'CLEANER',
        }),
    ],
    [
      'add customer (G2)',
      () => sa().post('/customers', { name: 'SA Customer', phone: newPhone() }),
    ],
  ];
  it.each(writes)('ACC-10 SA cannot %s', async (_name, call) => {
    const r = await call();
    expect([r.status, r.code]).toEqual([403, 'CTX_003']);
  });
  it('ACC-13 SA cannot upload a design photo', async () => {
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d4948445200000001000000010806000000',
      'hex',
    );
    const r = await t.upload(SA, png, 'd.png', 'image/png', 'thangalla');
    expect([r.status, r.code]).toEqual([403, 'CTX_003']);
  });
  it('ACC-11 SA cannot edit a customer (G2)', async () => {
    const c = await t.sql<{ customer_id: string }>(
      `SELECT customer_id FROM customer LIMIT 1`,
    );
    const r = await t
      .as(SA)
      .patch(`/customers/${c[0].customer_id}`, { name: 'Changed by SA' });
    expect([r.status, r.code]).toEqual([403, 'CTX_003']);
  });
  it('ACC-12 nothing changed after the refused writes', async () => {
    const d = await t.as(SUP.thangalla).get(`/orders/${draftCard.order_id}`);
    expect(d.data.status).toBe('DRAFT');
    const p = await t.as(SUP.thangalla).get(`/orders/${placed.order_id}`);
    expect(p.data.display_label).toBe('Placed');
    const tr = await t
      .as(SUP.thangalla)
      .get(`/stock-transfers/${toThangalla.transfer_id}`);
    expect(tr.data.display_status).toBe('WAITING');
  });
});

describe('ACC-SUP supervisor permissions', () => {
  it.each([
    ['/gate-passes'],
    ['/workshop-queue'],
    ['/roofing-queue'],
    ['/inventory'],
    ['/stock-alerts'],
    ['/stock-transfers?direction=INCOMING'],
    ['/stock-transfers/targets'],
    ['/users/chief-candidates'],
    ['/items/coils'],
    ['/workers?active=true'],
  ])('ACC-20 Thangalla supervisor GET %s → 200', async (url) => {
    expect((await t.as(SUP.thangalla).get(url)).status).toBe(200);
  });

  const forbidden: [
    string,
    () => Promise<{ status: number; code?: string }>,
  ][] = [
    ['open the cashier queue', () => t.as(SUP.thangalla).get('/cashier-queue')],
    [
      'record a payment',
      () =>
        t.as(SUP.thangalla).post(`/orders/${placed.order_id}/payments`, {
          client_request_id: randomUUID(),
          amount: 100,
          mode: 'CASH',
        }),
    ],
    [
      'edit a roofing order',
      () =>
        t.as(SUP.thangalla).put(`/roofing-orders/${placed.order_id}`, {
          version: placed.version,
        }),
    ],
    [
      'cancel a roofing order',
      () =>
        t.as(SUP.thangalla).post(`/roofing-orders/${placed.order_id}/cancel`, {
          reason: 'Supervisor test',
        }),
    ],
    [
      'edit a customer',
      () => t.as(SUP.thangalla).patch(`/customers/${fake}`, { name: 'X' }),
    ],
    [
      'add a worker',
      () =>
        t
          .as(SUP.thangalla)
          .post('/workers', { full_name: 'X', designation: 'CLEANER' }),
    ],
    ['list users', () => t.as(SUP.thangalla).get('/users')],
    ['add a user', () => t.as(SUP.thangalla).post('/users', { username: 'x' })],
    [
      'change a role',
      () => t.as(SUP.thangalla).patch(`/users/${fake}/role`, { role: 'CHIEF' }),
    ],
    ['read permissions', () => t.as(SUP.thangalla).get('/permissions/roles')],
    [
      'save permissions',
      () =>
        t
          .as(SUP.thangalla)
          .patch('/permissions/roles', { role: 'SUPERVISOR', actions: [] }),
    ],
    [
      'add a branch',
      () => t.as(SUP.thangalla).post('/branches', { name: 'X' }),
    ],
    [
      'edit branch details',
      () =>
        t
          .as(SUP.thangalla)
          .patch(`/branches/${BRANCH.thangalla}`, { name: 'X' }),
    ],
    [
      'edit branch config',
      () =>
        t
          .as(SUP.thangalla)
          .patch(`/branches/${BRANCH.thangalla}/config`, { features: {} }),
    ],
  ];
  it.each(forbidden)(
    'ACC-21 supervisor cannot %s (403 AUTH_004)',
    async (_n, call) => {
      const r = await call();
      expect([r.status, r.code]).toEqual([403, 'AUTH_004']);
    },
  );

  it.each([
    '/network/inventory',
    '/network/stock-alerts',
    '/network/stock-transfers',
  ])('ACC-22 supervisor cannot use %s (403 CTX_004)', async (url) => {
    const r = await t.as(SUP.thangalla).get(url);
    expect([r.status, r.code]).toEqual([403, 'CTX_004']);
  });

  it.each([
    ['veyangoda', '/roofing-queue'],
    ['veyangoda', '/items/coils'],
    ['naiwala', '/workshop-queue'],
  ] as const)(
    'ACC-23 %s supervisor: %s is not run at the branch (403 CTX_002)',
    async (branch, url) => {
      const r = await t.as(SUP[branch]).get(url);
      expect([r.status, r.code]).toEqual([403, 'CTX_002']);
    },
  );

  it('ACC-24 a supervisor ignores X-Branch-Id and stays on their own branch', async () => {
    const r = await t
      .as(SUP.veyangoda, { branch: 'thangalla' })
      .get('/branches/current');
    expect(r.data.branch_id).toBe(BRANCH.veyangoda);
    const o = await t
      .as(SUP.veyangoda, { branch: 'thangalla' })
      .get(`/orders/${placed.order_id}`);
    expect(o.status).toBe(404);
  });

  it("ACC-25 another branch's records are 404 to a supervisor (BR06)", async () => {
    const vey = t.as(SUP.veyangoda);
    expect((await vey.get(`/gate-passes/${gp.gate_pass_id}`)).status).toBe(404);
    expect((await vey.get(`/orders/${paidCard.order_id}`)).status).toBe(404);
    expect(
      (
        await t
          .as(SUP.naiwala)
          .get(`/stock-transfers/${toThangalla.transfer_id}`)
      ).status,
    ).toBe(404);
    const item = await t.itemId('PIP-GI-100');
    const own = await t.as(SUP.veyangoda).get(`/inventory/${item}`);
    expect(own.data.stock).toBe(await t.stock('veyangoda', 'PIP-GI-100'));
  });

  it("ACC-26 a supervisor cannot act on another branch's orders", async () => {
    const vey = t.as(SUP.veyangoda);
    const line = paidCard.lines[0];
    expect(
      (
        await vey.post(`/order-lines/${line.line_id}/start`, {
          version: line.version,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await vey.post(`/job-cards/${draftCard.order_id}/void`, {
          reason: 'Other branch',
        })
      ).status,
    ).toBe(404);
  });

  it('ACC-27 cashier_thangalla is not a supervisor: no stock alerts, no release', async () => {
    expect((await t.as(CASHIER.thangalla).get('/stock-alerts')).status).toBe(
      403,
    );
    expect(
      (
        await t
          .as(CASHIER.thangalla)
          .post(`/roofing-orders/${ready.order_id}/release`, {
            version: ready.version,
            released_to: 'X',
          })
      ).status,
    ).toBe(403);
  });
});
