import { randomUUID } from 'node:crypto';
import { TestApp } from './helpers/app';
import {
  CHIEF,
  CUSTOM_LINE,
  OVERRIDE_PASSWORD,
  ROLLING_LINE,
  SUP,
  gatePass,
  jobCard,
  jobCardBody,
  material,
  newPhone,
  payAdvance,
  workerIds,
} from './helpers/fixtures';

/** Supervisor workshop flow: gate pass → job card → advance → start/complete (Docs/testing/role-capabilities.md GP, JC, WQ). */
let t: TestApp;
beforeAll(async () => (t = await TestApp.boot()));
afterAll(() => t.close());

const tha = () => t.as(SUP.thangalla);

describe('GP gate pass', () => {
  it('GP-01 creates a gate pass with a GP number, OPEN with every piece available', async () => {
    const gp = await gatePass(t, SUP.thangalla, {
      items: [
        {
          material_type: 'MS Plain Sheet',
          thickness: '2',
          length: 8,
          length_unit: 'FT',
          color: 'Blue',
          quantity: 10,
        },
        { material_type: 'Zinc Coated', thickness: '1.5', quantity: 3 },
      ],
    });
    expect(gp.pass_number).toMatch(/^GP-\d+/);
    expect(gp.summary.status).toBe('OPEN');
    expect(gp.summary.total_available).toBe(13);
  });

  it('GP-02 needs a material and one of thickness, length or quantity (400)', async () => {
    const r = await tha().post('/gate-passes', {
      client_request_id: randomUUID(),
      customer: { phone: newPhone(), name: 'X' },
      items: [{ material_type: 'X' }],
    });
    expect(r.status).toBe(400);
    const none = await tha().post('/gate-passes', {
      client_request_id: randomUUID(),
      customer: { phone: newPhone(), name: 'X' },
      items: [],
    });
    expect(none.status).toBe(400);
  });

  it('GP-03 is idempotent on client_request_id', async () => {
    const body = {
      client_request_id: randomUUID(),
      customer: { phone: newPhone(), name: 'Twice' },
      items: [{ material_type: 'MS Plain Sheet', quantity: 2 }],
    };
    const a = await tha().post('/gate-passes', body);
    const b = await tha().post('/gate-passes', body);
    expect(b.data.gate_pass_id).toBe(a.data.gate_pass_id);
  });

  it('GP-04 a workshop-only branch drops the colour', async () => {
    const gp = await gatePass(t, SUP.veyangoda);
    expect(gp.items[0].color ?? null).toBeNull();
    const roof = await gatePass(t, SUP.thangalla);
    expect(roof.items[0].color).toBe('Blue');
  });

  it('GP-05 queue counts equal the rows of each tab; search narrows to one pass', async () => {
    const gp = await gatePass(t);
    for (const [tab, key] of [
      ['ALL', 'total'],
      ['AVAILABLE', 'available'],
    ] as const) {
      const r = await tha().get(`/gate-passes?status=${tab}`);
      expect(r.data.counts[key]).toBe(r.data.rows.length);
    }
    const s = await tha().get(`/gate-passes?search=${gp.pass_number}`);
    expect(s.data.rows.map((x: any) => x.gate_pass_id)).toEqual([
      gp.gate_pass_id,
    ]);
    const old = await tha().get('/gate-passes?from=2000-01-01&to=2000-01-02');
    expect(old.data.rows).toHaveLength(0);
  });

  it('GP-06 another branch cannot open the pass (404)', async () => {
    const gp = await gatePass(t);
    expect(
      (await t.as(SUP.veyangoda).get(`/gate-passes/${gp.gate_pass_id}`)).status,
    ).toBe(404);
  });

  it('GP-07 available passes for a customer phone feed the order forms', async () => {
    const gp = await gatePass(t);
    const r = await tha().get(
      `/gate-passes/available?phone=${encodeURIComponent(gp.phone)}`,
    );
    expect(r.data.map((x: any) => x.gate_pass_id)).toContain(gp.gate_pass_id);
  });
});

describe('JC job card', () => {
  it('JC-01 a card with a customized line is DRAFT awaiting payment, not yet in the Workshop Queue', async () => {
    const card = await jobCard(t);
    expect(card.order_number).toMatch(/^JC-/);
    expect([card.status, card.display_status]).toEqual([
      'DRAFT',
      'AWAITING_PAYMENT',
    ]);
    const q = await tha().get('/workshop-queue?status=PENDING');
    expect(q.data.rows.some((r: any) => r.order_id === card.order_id)).toBe(
      false,
    );
    const a = await tha().get('/workshop-queue?status=AWAITING_PAYMENT');
    expect(a.data.rows.some((r: any) => r.order_id === card.order_id)).toBe(
      true,
    );
  });

  it('JC-02 an all-standard card (0% advance) goes straight to the queue', async () => {
    const card = await jobCard(t, { lines: [ROLLING_LINE] });
    expect(card.status).toBe('IN_QUEUE');
  });

  it('JC-03 needs at least one worker and one sub-job', async () => {
    expect(
      (
        await tha().post(
          '/job-cards',
          jobCardBody(newPhone(), [], [ROLLING_LINE]),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await tha().post(
          '/job-cards',
          jobCardBody(newPhone(), await workerIds(t, SUP.thangalla), []),
        )
      ).status,
    ).toBe(400);
  });

  it('JC-04 a worker from another branch is refused (ORD_014)', async () => {
    const other = await workerIds(t, SUP.veyangoda);
    const r = await tha().post(
      '/job-cards',
      jobCardBody(newPhone(), other, [ROLLING_LINE]),
    );
    expect([r.status, r.code]).toEqual([400, 'ORD_014']);
  });

  it('JC-05 a material with no standard rate needs a custom price (PRC_001); the quote reports it', async () => {
    const line = {
      job_type: 'CUT_BEND',
      material_type: 'Stainless Steel (SS)',
      thickness: '6mm',
      material_quantity: 1,
      cut_count: 1,
    };
    const q = await tha().post('/job-cards/quote', { lines: [line] });
    expect(q.status).toBe(200);
    expect(q.data.missing_rates).toBeTruthy();
    const r = await tha().post(
      '/job-cards',
      jobCardBody(newPhone(), await workerIds(t, SUP.thangalla), [line]),
    );
    expect([r.status, r.code]).toEqual([400, 'PRC_001']);
  });

  it('JC-06 allocating more than the gate pass holds is refused (ALC_001); within it, material is committed', async () => {
    const gp = await gatePass(t);
    const workers = await workerIds(t, SUP.thangalla);
    const over = await tha().post(
      '/job-cards',
      jobCardBody(gp.phone, workers, [CUSTOM_LINE], {
        material_source: 'CUSTOMER',
        gate_pass_id: gp.gate_pass_id,
        allocations: [{ gp_item_id: gp.items[0].gp_item_id, quantity: 11 }],
      }),
    );
    expect([over.status, over.code]).toEqual([409, 'ALC_001']);
    const ok = await tha().post(
      '/job-cards',
      jobCardBody(gp.phone, workers, [CUSTOM_LINE], {
        material_source: 'CUSTOMER',
        gate_pass_id: gp.gate_pass_id,
        allocations: [{ gp_item_id: gp.items[0].gp_item_id, quantity: 4 }],
      }),
    );
    expect(ok.status).toBe(201);
    const after = await tha().get(`/gate-passes/${gp.gate_pass_id}`);
    expect(after.data.summary.status).toBe('PARTIALLY_ASSIGNED');
    expect(after.data.summary.total_available).toBe(6);
  });

  it('JC-07 is idempotent on client_request_id', async () => {
    const body = jobCardBody(newPhone(), await workerIds(t, SUP.thangalla), [
      CUSTOM_LINE,
    ]);
    const a = await tha().post('/job-cards', body);
    const b = await tha().post('/job-cards', body);
    expect(b.data.order_id).toBe(a.data.order_id);
  });

  it('JC-08 edit while DRAFT: change a line and add one; the advance is recalculated', async () => {
    const workers = await workerIds(t, SUP.thangalla);
    const card = (
      await tha().post(
        '/job-cards',
        jobCardBody(newPhone(), workers, [ROLLING_LINE, CUSTOM_LINE]),
      )
    ).data;
    const body = {
      ...jobCardBody(card.customer_phone ?? newPhone(), workers, [
        { ...ROLLING_LINE, line_id: card.lines[0].line_id, quantity: 5 },
        { ...CUSTOM_LINE, line_id: card.lines[1].line_id },
        {
          ...CUSTOM_LINE,
          custom_charges: [
            {
              kind: 'BEND',
              description: 'Extra bends',
              rate: 8000,
              quantity: 2,
            },
          ],
        },
      ]),
      client_request_id: undefined,
      version: card.version,
    };
    const r = await tha().put(`/job-cards/${card.order_id}`, body);
    expect(r.status).toBe(200);
    expect(
      r.data.lines.filter((l: any) => l.status !== 'CANCELLED'),
    ).toHaveLength(3);
    expect(r.data.min_advance).toBeGreaterThan(card.min_advance);
  });

  it('JC-09 a stale version is refused (ORD_003)', async () => {
    const workers = await workerIds(t, SUP.thangalla);
    const card = await jobCard(t);
    const r = await tha().put(`/job-cards/${card.order_id}`, {
      ...jobCardBody(newPhone(), workers, [CUSTOM_LINE]),
      client_request_id: undefined,
      version: card.version + 5,
    });
    expect([r.status, r.code]).toEqual([409, 'ORD_003']);
  });

  it('JC-10 void needs a reason of 3+ characters; a DRAFT unpaid card becomes VOIDED', async () => {
    const card = await jobCard(t);
    expect(
      (await tha().post(`/job-cards/${card.order_id}/void`, { reason: 'no' }))
        .status,
    ).toBe(400);
    const r = await tha().post(`/job-cards/${card.order_id}/void`, {
      reason: 'Customer changed mind',
    });
    expect([r.status, r.data.status]).toEqual([201, 'VOIDED']);
  });

  it('JC-11 a paid card cannot be voided (409)', async () => {
    const card = await jobCard(t, { paid: true });
    const r = await tha().post(`/job-cards/${card.order_id}/void`, {
      reason: 'Too late now',
    });
    expect(r.status).toBe(409);
  });
});

describe('WQ workshop queue and floor actions', () => {
  it('WQ-01 KPIs equal the rows of each tab and add up', async () => {
    const all = (await tha().get('/workshop-queue?status=ALL')).data;
    for (const [tab, key] of [
      ['ALL', 'total'],
      ['AWAITING_PAYMENT', 'awaiting_payment'],
      ['PENDING', 'pending'],
      ['IN_PROGRESS', 'in_progress'],
      ['COMPLETED', 'completed'],
    ] as const) {
      const r = (await tha().get(`/workshop-queue?status=${tab}`)).data;
      expect(r.counts[key]).toBe(r.rows.length);
    }
    expect(all.counts.total).toBe(
      all.counts.pending + all.counts.in_progress + all.counts.completed,
    );
  });

  it('WQ-02 a DRAFT card cannot be started until the advance is paid (ORD_005)', async () => {
    const card = await jobCard(t);
    const l = card.lines[0];
    const r = await tha().post(`/order-lines/${l.line_id}/start`, {
      version: l.version,
    });
    expect([r.status, r.code]).toEqual([409, 'ORD_005']);
  });

  it('WQ-03 paid → Pending → start deducts the sheets → complete records the supervisor as inspector', async () => {
    const m = await material(t, 'thangalla', 3);
    const card = await jobCard(t, {
      lines: [
        {
          job_type: 'CUT_BEND',
          material_type: m.material_type,
          thickness: m.thickness,
          material_quantity: 2,
          cut_count: 2,
        },
        CUSTOM_LINE,
      ],
      paid: true,
    });
    expect(card.status).toBe('IN_QUEUE');
    const row = (
      await tha().get('/workshop-queue?status=PENDING')
    ).data.rows.find((r: any) => r.order_id === card.order_id);
    expect(row?.display_status).toBe('PENDING');

    const before = await t.stock('thangalla', m.sku);
    const l = card.lines[0];
    const started = await tha().post(`/order-lines/${l.line_id}/start`, {
      version: l.version,
    });
    expect(started.status).toBe(201);
    expect(started.data.status).toBe('IN_PROGRESS');
    expect(await t.stock('thangalla', m.sku)).toBe(before - 2);

    const cur = started.data.lines.find((x: any) => x.line_id === l.line_id);
    const done = await tha().post(`/order-lines/${l.line_id}/complete`, {
      version: cur.version,
    });
    expect(done.status).toBe(201);
    expect(
      done.data.lines.find((x: any) => x.line_id === l.line_id).inspected_by,
    ).toBe('Supervisor (Thangalla)');
  });

  it('WQ-04 a stale line version is refused (ORD_003)', async () => {
    const card = await jobCard(t, { paid: true });
    const l = card.lines[0];
    const r = await tha().post(`/order-lines/${l.line_id}/start`, {
      version: l.version + 5,
    });
    expect([r.status, r.code]).toEqual([409, 'ORD_003']);
  });

  it('WQ-05 short stock: saving → 409 STK_001 → wrong password STK_002 → right password saves (holds what is free); start takes all free stock without asking again', async () => {
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
    const body = () => jobCardBody(newPhone(), workers, lines);
    const short = await tha().post('/job-cards', body());
    expect([short.status, short.code, short.details?.override_allowed]).toEqual(
      [409, 'STK_001', true],
    );
    expect(short.details.shortages[0]).toMatchObject({
      required: m.quantity + 5,
      available: m.quantity,
    });
    const wrong = await tha().post('/job-cards', {
      ...body(),
      override: { password: 'wrong', reason: 'Urgent customer' },
    });
    expect([wrong.status, wrong.code]).toEqual([400, 'STK_002']);

    const before = await t.reserved('thangalla', m.sku);
    const card = await jobCard(t, {
      lines,
      paid: true,
      override: {
        password: OVERRIDE_PASSWORD,
        reason: 'Sheets arrived, not entered yet',
      },
    });
    // Only what was free is held; the 5 short are authorised, not held
    expect(await t.reserved('thangalla', m.sku)).toBe(before + m.quantity);

    const l = card.lines[0];
    const ok = await tha().post(`/order-lines/${l.line_id}/start`, {
      version: l.version,
    });
    expect(ok.status).toBe(201);
    // Everything free is used; what other open orders hold stays on the shelf for them
    expect(await t.stock('thangalla', m.sku)).toBe(before);
    expect(await t.reserved('thangalla', m.sku)).toBe(before);
    const movement = await t.sql(
      `SELECT reason FROM stock_movement WHERE line_id = $1 AND movement_type = 'OVERRIDE'`,
      [l.line_id],
    );
    expect(movement[0].reason).toContain('Sheets arrived, not entered yet');
  });

  it('WQ-06 a branch without the override refuses it (STK_004)', async () => {
    const m = await material(t, 'veyangoda', 1);
    const workers = await workerIds(t, SUP.veyangoda, 1);
    const body = (over: Record<string, unknown> = {}) =>
      jobCardBody(
        newPhone(),
        workers,
        [
          {
            job_type: 'CUT_BEND',
            material_type: m.material_type,
            thickness: m.thickness,
            material_quantity: m.quantity + 5,
            cut_count: 1,
          },
          CUSTOM_LINE,
        ],
        over,
      );
    const short = await t.as(SUP.veyangoda).post('/job-cards', body());
    expect([short.code, short.details?.override_allowed]).toEqual([
      'STK_001',
      false,
    ]);
    const r = await t.as(SUP.veyangoda).post(
      '/job-cards',
      body({ override: { password: OVERRIDE_PASSWORD, reason: 'Trying anyway' } }),
    );
    expect(r.code).toBe('STK_004');
  });

  it("WQ-07 BR21: a chief is blocked on a supervisor's card while the supervisor is active; the supervisor never is", async () => {
    await t.token(SUP.thangalla); // fresh session = supervisor active
    const card = await jobCard(t, { paid: true });
    const l = card.lines[0];
    const chief = await t
      .as(CHIEF)
      .post(`/order-lines/${l.line_id}/start`, { version: l.version });
    expect([chief.status, chief.code]).toEqual([409, 'ORD_007']);
    expect(
      (
        await tha().post(`/order-lines/${l.line_id}/start`, {
          version: l.version,
        })
      ).status,
    ).toBe(201);
  });

  it('WQ-08 a card with started work can no longer be edited (ORD_004)', async () => {
    const workers = await workerIds(t, SUP.thangalla);
    const card = await jobCard(t, {
      lines: [ROLLING_LINE, CUSTOM_LINE],
      paid: true,
    });
    const l = card.lines[0];
    const s = await tha().post(`/order-lines/${l.line_id}/start`, {
      version: l.version,
    });
    const r = await tha().put(`/job-cards/${card.order_id}`, {
      ...jobCardBody(newPhone(), workers, [ROLLING_LINE]),
      client_request_id: undefined,
      version: s.data.version,
    });
    expect([r.status, r.code]).toEqual([409, 'ORD_004']);
  });

  it("WQ-09 the cashier's partial advance keeps the card DRAFT", async () => {
    const card = await jobCard(t);
    const q = await t.as('cashier_thangalla').get('/cashier-queue');
    const row = q.data.find((x: any) => x.order_id === card.order_id);
    const r = await t
      .as('cashier_thangalla')
      .post(`/orders/${card.order_id}/payments`, {
        client_request_id: randomUUID(),
        amount: Math.max(1, row.min_advance - 100),
        mode: 'CASH',
      });
    expect(r.data.status).toBe('DRAFT');
    const paid = await payAdvance(t, r.data);
    expect(paid.status).toBe('IN_QUEUE');
  });
});
