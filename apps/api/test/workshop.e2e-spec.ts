import { randomUUID } from 'node:crypto';
import { TestApp } from './helpers/app';
import {
  CHIEF,
  CUSTOM_LINE,
  OVERRIDE_PASSWORD,
  ROLLING_LINE,
  SUP,
  customerLine,
  gatePass,
  jobCard,
  jobCardBody,
  material,
  newPhone,
  payAdvance,
  workerIds,
  toWorkshop,
  CASHIER,
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

  it('JC-02 an all-standard card (Rs 0 advance) still waits at the cashier, who sends it on without payment', async () => {
    const card = await jobCard(t, { lines: [ROLLING_LINE] });
    expect([card.min_advance, card.status]).toEqual([0, 'DRAFT']);
    const row = (await t.as(CASHIER.thangalla).get('/cashier-queue')).data.find((x: any) => x.order_id === card.order_id);
    expect([row.column, row.advance_due]).toEqual(['AWAITING_PAYMENT', 0]);
    const sent = await toWorkshop(t, card);
    expect([sent.status, sent.paid_amount]).toEqual(['IN_QUEUE', 0]);
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

  it('JC-06 a customer line takes its gate pass item; more than the pass holds is refused (ALC_001)', async () => {
    const gp = await gatePass(t);
    const workers = await workerIds(t, SUP.thangalla);
    const item = gp.items[0].gp_item_id;
    const over = await tha().post(
      '/job-cards',
      jobCardBody(gp.phone, workers, [customerLine(item, 11)]),
    );
    expect([over.status, over.code]).toEqual([409, 'ALC_001']);
    const ok = await tha().post(
      '/job-cards',
      jobCardBody(gp.phone, workers, [customerLine(item, 4), ROLLING_LINE]),
    );
    expect(ok.status).toBe(201);
    const line = ok.data.lines.find(
      (l: any) => l.material_source === 'CUSTOMER',
    );
    expect(line.customer_material).toMatchObject({
      gp_item_id: item,
      pass_number: gp.pass_number,
      quantity: 4,
    });
    expect(
      ok.data.lines.find((l: any) => l.material_source === 'BRANCH')
        .customer_material,
    ).toBeNull();
    const after = await tha().get(`/gate-passes/${gp.gate_pass_id}`);
    expect(after.data.summary.status).toBe('PARTIALLY_ASSIGNED');
    expect(after.data.summary.total_available).toBe(6);
  });

  it('JC-06b customer material always needs a gate pass item, from that customer', async () => {
    const workers = await workerIds(t, SUP.thangalla);
    const { customer_material: _m, ...noItem } = customerLine(randomUUID(), 1);
    expect(
      (
        await tha().post(
          '/job-cards',
          jobCardBody(newPhone(), workers, [noItem]),
        )
      ).status,
    ).toBe(400);
    const gp = await gatePass(t);
    const r = await tha().post(
      '/job-cards',
      jobCardBody(newPhone(), workers, [
        customerLine(gp.items[0].gp_item_id, 1),
      ]),
    );
    expect([r.status, r.code]).toEqual([400, 'GP_003']);
  });

  it('JC-06c lines sharing one item are checked on their total', async () => {
    const gp = await gatePass(t);
    const workers = await workerIds(t, SUP.thangalla);
    const item = gp.items[0].gp_item_id;
    const over = await tha().post(
      '/job-cards',
      jobCardBody(gp.phone, workers, [
        customerLine(item, 6),
        customerLine(item, 5),
      ]),
    );
    expect([over.status, over.code]).toEqual([409, 'ALC_001']);
    const ok = await tha().post(
      '/job-cards',
      jobCardBody(gp.phone, workers, [
        customerLine(item, 6),
        customerLine(item, 4),
      ]),
    );
    expect(ok.status).toBe(201);
    expect(
      (await tha().get(`/gate-passes/${gp.gate_pass_id}`)).data.summary
        .total_available,
    ).toBe(0);
  });

  it('JC-06d editing moves material between lines; removing the customer line gives it back', async () => {
    const gp = await gatePass(t);
    const workers = await workerIds(t, SUP.thangalla);
    const item = gp.items[0].gp_item_id;
    const card = (
      await tha().post(
        '/job-cards',
        jobCardBody(gp.phone, workers, [customerLine(item, 3), ROLLING_LINE]),
      )
    ).data;
    const custLine = card.lines.find(
      (l: any) => l.material_source === 'CUSTOMER',
    );
    const rollLine = card.lines.find(
      (l: any) => l.material_source === 'BRANCH',
    );
    const edit = (lines: unknown[], version: number) =>
      tha().put(`/job-cards/${card.order_id}`, {
        ...jobCardBody(gp.phone, workers, lines),
        client_request_id: undefined,
        version,
      });

    const r1 = await edit(
      [
        { ...customerLine(item, 7), line_id: custLine.line_id },
        { ...ROLLING_LINE, line_id: rollLine.line_id },
      ],
      card.version,
    );
    expect(r1.status).toBe(200);
    expect(
      (await tha().get(`/gate-passes/${gp.gate_pass_id}`)).data.summary
        .total_available,
    ).toBe(3);

    const r2 = await edit(
      [{ ...ROLLING_LINE, line_id: rollLine.line_id }],
      r1.data.version,
    );
    expect(r2.status).toBe(200);
    const after = (await tha().get(`/gate-passes/${gp.gate_pass_id}`)).data
      .summary;
    expect([after.status, after.total_available]).toEqual(['OPEN', 10]);
  });

  it("JC-06e the customer's passes are listed for a card being edited even when it used them up", async () => {
    const gp = await gatePass(t);
    const workers = await workerIds(t, SUP.thangalla);
    const card = (
      await tha().post(
        '/job-cards',
        jobCardBody(gp.phone, workers, [
          customerLine(gp.items[0].gp_item_id, 10),
        ]),
      )
    ).data;
    const plain = await tha().get(
      `/gate-passes/available?phone=${encodeURIComponent(gp.phone)}`,
    );
    expect(plain.data.map((x: any) => x.gate_pass_id)).not.toContain(
      gp.gate_pass_id,
    );
    const forEdit = await tha().get(
      `/gate-passes/available?phone=${encodeURIComponent(gp.phone)}&order_id=${card.order_id}`,
    );
    expect(forEdit.data.map((x: any) => x.gate_pass_id)).toContain(
      gp.gate_pass_id,
    );
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

  it('JC-12 once any payment is taken the card can no longer be edited (ORD_027)', async () => {
    const workers = await workerIds(t, SUP.thangalla);
    const card = await jobCard(t);
    const paid = await t.as('cashier_thangalla').post(`/orders/${card.order_id}/payments`, { client_request_id: randomUUID(), amount: 100, mode: 'CASH' });
    const r = await tha().put(`/job-cards/${card.order_id}`, {
      ...jobCardBody(newPhone(), workers, [CUSTOM_LINE]),
      client_request_id: undefined,
      version: paid.data.version,
    });
    expect([r.status, r.code]).toEqual([409, 'ORD_027']);
    expect((await tha().get(`/orders/${card.order_id}`)).data.can_edit).toBe(false);
  });

  it('JC-13 the supervisor sets a custom sub-job advance; 0 sends the card straight to the queue (Docs/decisions/0010)', async () => {
    const quote = await tha().post('/job-cards/quote', { lines: [CUSTOM_LINE] });
    expect(quote.data.lines[0].advance_editable).toBe(true);
    expect(quote.data.min_advance).toBe(quote.data.lines[0].suggested_advance);
    const card = await jobCard(t, { lines: [{ ...CUSTOM_LINE, advance: 0 }] });
    expect([card.min_advance, card.status]).toEqual([0, 'DRAFT']);
    expect((await toWorkshop(t, card)).status).toBe('IN_QUEUE');
  });

  it('JC-14 a sub-job advance above its total is refused (ORD_026)', async () => {
    const r = await tha().post('/job-cards', jobCardBody(newPhone(), await workerIds(t, SUP.thangalla), [{ ...CUSTOM_LINE, advance: 999_999_999 }]));
    expect([r.status, r.code]).toEqual([400, 'ORD_026']);
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
    // override:stock is MANAGER-only by default: the right password alone is not enough
    const noPerm = await tha().post('/job-cards', {
      ...body(),
      override: { password: OVERRIDE_PASSWORD, reason: 'Urgent customer' },
    });
    expect([noPerm.status, noPerm.code]).toEqual([403, 'AUTH_004']);

    const before = await t.reserved('thangalla', m.sku);
    const card = await t.withGrant('SUPERVISOR', 'override:stock', async () => {
      const wrong = await tha().post('/job-cards', {
        ...body(),
        override: { password: 'wrong', reason: 'Urgent customer' },
      });
      expect([wrong.status, wrong.code]).toEqual([400, 'STK_002']);
      return jobCard(t, {
        lines,
        paid: true,
        override: {
          password: OVERRIDE_PASSWORD,
          reason: 'Sheets arrived, not entered yet',
        },
      });
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
    const r = await t.withGrant('SUPERVISOR', 'override:stock', () =>
      t
        .as(SUP.veyangoda)
        .post(
          '/job-cards',
          body({
            override: { password: OVERRIDE_PASSWORD, reason: 'Trying anyway' },
          }),
        ),
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
    // Standard rolling needs no advance: the cashier sends the unpaid card on (a paid one is ORD_027)
    const card = await toWorkshop(t, await jobCard(t, { lines: [ROLLING_LINE] }));
    // Sub-jobs start with the card (Start Job, Docs/decisions/0005)
    const s = await tha().post(`/job-cards/${card.order_id}/start`, { version: card.version, line_ids: [card.lines[0].line_id] });
    expect(s.status).toBe(201);
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

  it('WQ-10 the cashier takes more while the job is in the workshop; the card does not move', async () => {
    const queued = await payAdvance(t, await jobCard(t));
    expect(queued.status).toBe('IN_QUEUE');
    const queue = async () => (await t.as('cashier_thangalla').get('/cashier-queue')).data.find((x: any) => x.order_id === queued.order_id);
    const row = await queue();
    expect(row.column).toBe('IN_WORKSHOP');
    expect(row.balance).toBeGreaterThan(1);

    const pay = (amount: number) =>
      t.as('cashier_thangalla').post(`/orders/${queued.order_id}/payments`, { client_request_id: randomUUID(), amount, mode: 'CASH' });
    const part = await pay(Math.floor(row.balance / 2));
    expect(part.data.status).toBe('IN_QUEUE');
    expect((await queue()).balance).toBe(part.data.balance);

    const rest = await pay(part.data.balance);
    expect(rest.data.status).toBe('IN_QUEUE');
    expect(rest.data.balance).toBe(0);
    // Paid in full, it stays under In Workshop until the workshop finishes it
    expect([(await queue()).column, (await queue()).balance]).toEqual(['IN_WORKSHOP', 0]);
  });

  // Finish an advance-paid card: Finished at the workshop, Finished – Balance Due at the cashier
  const finishedCard = async () => {
    const queued = await payAdvance(t, await jobCard(t));
    const started = await tha().post(`/job-cards/${queued.order_id}/start`, { version: queued.version, line_ids: queued.lines.map((l: any) => l.line_id) });
    expect(started.status).toBe(201);
    const done = await tha().post(`/job-cards/${queued.order_id}/complete`, { version: started.data.version });
    expect(done.data.status).toBe('COMPLETED');
    return done.data;
  };
  const cashierRow = async (id: string) => (await t.as('cashier_thangalla').get('/cashier-queue')).data.find((x: any) => x.order_id === id);
  const workshopRow = async (id: string) => (await tha().get('/workshop-queue')).data.rows.find((x: any) => x.order_id === id);

  it('WQ-11 paid in full, a finished card leaves the cashier for Ready for Collection; the supervisor hands it over', async () => {
    const card = await finishedCard();
    expect(card.balance).toBeGreaterThan(0);
    expect((await workshopRow(card.order_id)).display_status).toBe('COMPLETED');
    expect((await cashierRow(card.order_id)).column).toBe('FINISHED_BALANCE_DUE');

    const paid = await t
      .as('cashier_thangalla')
      .post(`/orders/${card.order_id}/payments`, { client_request_id: randomUUID(), amount: card.balance, mode: 'CASH' });
    // Paying never closes the card
    expect([paid.data.status, paid.data.balance]).toEqual(['COMPLETED', 0]);
    expect(await cashierRow(card.order_id)).toBeUndefined();
    const ready = await workshopRow(card.order_id);
    expect([ready.display_status, ready.display_label]).toEqual(['READY_FOR_COLLECTION', 'Ready for Collection']);

    const closed = await tha().post(`/job-cards/${card.order_id}/close`, { version: paid.data.version, released_to: 'Collector Name' });
    expect(closed.status).toBe(201);
    expect([closed.data.status, closed.data.released_to]).toEqual(['CLOSED', 'Collector Name']);
    expect(await workshopRow(card.order_id)).toBeUndefined();
  });

  it('WQ-13 send-to-workshop is the cashier\'s, only for a draft with nothing still due (ORD_005)', async () => {
    const owing = await jobCard(t); // a customized line needs an advance
    const r = await t.as(CASHIER.thangalla).post(`/job-cards/${owing.order_id}/send-to-workshop`, { version: owing.version });
    expect([r.status, r.code]).toEqual([409, 'ORD_005']);
    const free = await jobCard(t, { lines: [ROLLING_LINE] });
    expect((await tha().post(`/job-cards/${free.order_id}/send-to-workshop`, { version: free.version })).status).toBe(403);
    const sent = await toWorkshop(t, free);
    const again = await t.as(CASHIER.thangalla).post(`/job-cards/${free.order_id}/send-to-workshop`, { version: sent.version });
    expect([again.status, again.code]).toEqual([409, 'ORD_002']);
  });

  it('WQ-12 only the supervisor hands over, never with money owed, and a payment cannot close', async () => {
    const card = await finishedCard();
    const owed = await tha().post(`/job-cards/${card.order_id}/close`, { version: card.version, released_to: 'X' });
    expect([owed.status, owed.code]).toEqual([409, 'ORD_006']);

    // Collect & Close is gone: the schema refuses the extra fields
    const withClose = await t
      .as('cashier_thangalla')
      .post(`/orders/${card.order_id}/payments`, { client_request_id: randomUUID(), amount: card.balance, mode: 'CASH', close: true });
    expect(withClose.status).toBe(400);

    const paid = await t
      .as('cashier_thangalla')
      .post(`/orders/${card.order_id}/payments`, { client_request_id: randomUUID(), amount: card.balance, mode: 'CASH' });
    const cashier = await t.as('cashier_thangalla').post(`/job-cards/${card.order_id}/close`, { version: paid.data.version, released_to: 'X' });
    expect(cashier.status).toBe(403);
    // Who collected is required
    const nameless = await tha().post(`/job-cards/${card.order_id}/close`, { version: paid.data.version, released_to: ' ' });
    expect(nameless.status).toBe(400);
  });
});
