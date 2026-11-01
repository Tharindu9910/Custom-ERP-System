import { randomUUID } from 'node:crypto';
import { TestApp } from './helpers/app';
import {
  CASHIER,
  CHIEF,
  OVERRIDE_PASSWORD,
  SUP,
  colomboToday,
  gatePass,
  newPhone,
  payBalance,
  readyRoofingOrder,
  richCoil,
  roofingOrder,
  roofingOrderBody,
  sheetLine,
} from './helpers/fixtures';

/** Supervisor roofing flow: place → start → complete → release (Docs/testing/role-capabilities.md RO, OQ). */
let t: TestApp;
let coil: any;
beforeAll(async () => {
  t = await TestApp.boot();
  coil = await richCoil(t);
});
afterAll(() => t.close());

const tha = () => t.as(SUP.thangalla);
// Only the cashier places an order with a payment; the supervisor submits it unpaid
const cas = () => t.as(CASHIER.thangalla);
const png = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
  'hex',
);

function body(
  lines: unknown[],
  payment: Record<string, unknown>,
  over: Record<string, unknown> = {},
) {
  return {
    client_request_id: randomUUID(),
    customer: { phone: newPhone(), name: 'Roof Test' },
    technician: 'Sampath',
    lines,
    discount: 0,
    payment,
    ...over,
  };
}

async function quote(lines: unknown[], discount = 0) {
  const q = await tha().post('/roofing-orders/quote', { lines, discount });
  expect(q.status).toBe(200);
  return q.data;
}

describe('RO create order', () => {
  it('RO-01 coils list only at roofing branches, with own stock', async () => {
    const r = await tha().get('/items/coils');
    expect(r.data.length).toBeGreaterThan(10);
    expect(r.data.every((c: any) => 'stock_ft' in c)).toBe(true);
  });

  it('RO-02 design photo: images only; the uploader can read it, another branch cannot', async () => {
    const bad = await t.upload(
      SUP.thangalla,
      Buffer.from('not an image'),
      'x.png',
    );
    expect([bad.status, bad.code]).toEqual([400, 'ATT_002']);
    const ok = await t.upload(SUP.thangalla, png);
    expect(ok.status).toBe(201);
    const id = ok.data.attachment_id;
    expect((await tha().get(`/attachments/${id}/file`)).status).toBe(200);
    expect(
      (await t.as(SUP.veyangoda).get(`/attachments/${id}/file`)).status,
    ).toBe(404);
  });

  it('RO-03 item rules: customized without photo ORD_009, unknown coil ORD_016', async () => {
    const q = await quote([sheetLine(coil.item_id)]);
    const pay = { amount: q.min_to_place, mode: 'CASH' };
    const noPhoto = await cas().post(
      '/roofing-orders',
      body(
        [
          {
            category: 'Flashing',
            job_type: 'CUSTOMIZED',
            material_source: 'BRANCH',
            coil_item_id: coil.item_id,
            length_ft: 8,
            pieces: 2,
          },
        ],
        pay,
      ),
    );
    expect([noPhoto.status, noPhoto.code]).toEqual([400, 'ORD_009']);
    const unknown = await cas().post(
      '/roofing-orders',
      body([sheetLine(randomUUID())], pay),
    );
    expect([unknown.status, unknown.code]).toEqual([400, 'ORD_016']);
  });

  it('RO-04 money rules: discount over max ORD_010, below minimum PAY_002, above total PAY_003, card without reference PAY_004', async () => {
    const lines = [sheetLine(coil.item_id)];
    const q = await quote(lines);
    const cases: [Record<string, unknown>, Record<string, unknown>, string][] =
      [
        [
          { amount: q.min_to_place, mode: 'CASH' },
          { discount: q.max_discount + 100 },
          'ORD_010',
        ],
        [{ amount: q.min_to_place - 1, mode: 'CASH' }, {}, 'PAY_002'],
        [{ amount: q.total + 1, mode: 'CASH' }, {}, 'PAY_003'],
        [{ amount: q.min_to_place, mode: 'CARD' }, {}, 'PAY_004'],
      ];
    for (const [payment, over, code] of cases) {
      const r = await cas().post('/roofing-orders', body(lines, payment, over));
      expect([r.status, r.code]).toEqual([400, code]);
    }
  });

  it('RO-05 places an order: WO-FORM number, Placed, server total = quote, one payment, idempotent', async () => {
    const lines = [
      sheetLine(coil.item_id),
      {
        category: 'Gutter Accessories',
        job_type: 'STANDARD',
        material_source: 'BRANCH',
        accessory_type: 'Bracket (Aluminium)',
        quantity: 6,
      },
    ];
    const q = await quote(lines, 500);
    const b = body(
      lines,
      { amount: q.min_to_place, mode: 'CARD', reference: 'TXN-1' },
      { discount: 500 },
    );
    const r = await cas().post('/roofing-orders', b);
    expect(r.status).toBe(201);
    expect(r.data.order_number).toMatch(/^WO-FORM-/);
    expect([r.data.status, r.data.display_label]).toEqual([
      'IN_QUEUE',
      'Placed',
    ]);
    expect(r.data.total).toBe(q.total);
    expect(r.data.paid_amount).toBe(q.min_to_place);
    const again = await cas().post('/roofing-orders', b);
    expect(again.data.order_id).toBe(r.data.order_id);
    const payments = await t.sql(`SELECT 1 FROM payment WHERE order_id = $1`, [
      r.data.order_id,
    ]);
    expect(payments).toHaveLength(1);
  });

  /** A customer-supplied gutter on one gate pass item (Docs/decisions/0007). */
  const customerGutter = (
    gpItemId: string,
    pieces: number,
    over: Record<string, unknown> = {},
  ) => ({
    category: 'Gutter',
    job_type: 'STANDARD',
    material_source: 'CUSTOMER',
    length_ft: 10,
    pieces: 2,
    customer_material: { gp_item_id: gpItemId, quantity: pieces },
    ...over,
  });
  const zincPass = (quantity = 5) =>
    gatePass(t, SUP.thangalla, {
      items: [{ material_type: 'Zinc Coated', thickness: '1.5', quantity }],
    });
  // The cashier places with the minimum; anyone else submits without payment
  const placeFor = async (who: string, phone: string, lines: unknown[]) => {
    const q = await quote(lines);
    const { payment: _p, ...unpaid } = body(lines, {}, { customer: { phone, name: 'Roof Test' } });
    return t
      .as(who)
      .post(
        '/roofing-orders',
        who === CASHIER.thangalla
          ? { ...unpaid, payment: { amount: q.min_to_place, mode: 'CASH' } }
          : unpaid,
      );
  };

  it('RO-08 using a gate pass on an order follows allocate:gate_pass_order: a chief may by default; unticked, it is refused', async () => {
    const place = async () => {
      const gp = await zincPass(2);
      return placeFor(CHIEF, gp.phone, [
        customerGutter(gp.items[0].gp_item_id, 1),
      ]);
    };
    expect((await place()).status).toBe(201);
    try {
      expect(
        (await t.setGrant('CHIEF', 'allocate:gate_pass_order', false)).status,
      ).toBe(200);
      expect((await place()).code).toBe('AUTH_004');
    } finally {
      await t.setGrant('CHIEF', 'allocate:gate_pass_order', true);
    }
  });

  it('RO-06 an item on customer material takes its gate pass item; the order shows it per item', async () => {
    const gp = await zincPass();
    const r = await placeFor(CASHIER.thangalla, gp.phone, [
      customerGutter(gp.items[0].gp_item_id, 3),
      sheetLine(coil.item_id),
    ]);
    expect(r.status).toBe(201);
    const gutter = r.data.lines.find(
      (l: any) => l.material_source === 'CUSTOMER',
    );
    expect(gutter.customer_material).toMatchObject({
      gp_item_id: gp.items[0].gp_item_id,
      quantity: 3,
    });
    expect(r.data.customer_materials[0]).toMatchObject({
      quantity: 3,
      line_id: gutter.line_id,
    });
    expect(
      (await tha().get(`/gate-passes/${gp.gate_pass_id}`)).data.summary
        .total_available,
    ).toBe(2);
  });

  it('RO-06b customer material needs a gate pass item; items sharing one are checked on their total', async () => {
    const gp = await zincPass();
    const { customer_material: _m, ...noItem } = customerGutter(
      gp.items[0].gp_item_id,
      1,
    );
    const q = await quote([sheetLine(coil.item_id)]);
    const missing = await cas().post(
      '/roofing-orders',
      body(
        [noItem],
        { amount: q.min_to_place, mode: 'CASH' },
        { customer: { phone: gp.phone, name: 'Roof Test' } },
      ),
    );
    expect(missing.status).toBe(400);
    const item = gp.items[0].gp_item_id;
    const over = await placeFor(CASHIER.thangalla, gp.phone, [
      customerGutter(item, 3),
      customerGutter(item, 3),
    ]);
    expect([over.status, over.code]).toEqual([409, 'ALC_001']);
    const other = await zincPass();
    const wrong = await placeFor(CASHIER.thangalla, gp.phone, [
      customerGutter(other.items[0].gp_item_id, 1),
    ]);
    expect([wrong.status, wrong.code]).toEqual([400, 'GP_003']);
  });

  it('RO-06c editing moves gate pass material between items; keeping it needs no allocate permission', async () => {
    const gp = await zincPass();
    const item = gp.items[0].gp_item_id;
    const placed = (
      await placeFor(CASHIER.thangalla, gp.phone, [
        customerGutter(item, 2),
        sheetLine(coil.item_id),
      ])
    ).data;
    const gutter = placed.lines.find(
      (l: any) => l.material_source === 'CUSTOMER',
    );
    const sheet = placed.lines.find((l: any) => l.material_source === 'BRANCH');
    const edit = (who: string, lines: unknown[], version: number) =>
      t.as(who).put(`/roofing-orders/${placed.order_id}`, {
        customer: { phone: gp.phone, name: 'Roof Test' },
        lines,
        discount: 0,
        version,
      });
    const r1 = await edit(
      CASHIER.thangalla,
      [
        { ...customerGutter(item, 5), line_id: gutter.line_id },
        { ...sheetLine(coil.item_id), line_id: sheet.line_id },
      ],
      placed.version,
    );
    expect(r1.status).toBe(200);
    expect(
      (await tha().get(`/gate-passes/${gp.gate_pass_id}`)).data.summary
        .total_available,
    ).toBe(0);
    // Dropping the customer item gives every piece back
    const r2 = await edit(
      CASHIER.thangalla,
      [{ ...sheetLine(coil.item_id), line_id: sheet.line_id }],
      r1.data.version,
    );
    expect(r2.status).toBe(200);
    const after = (await tha().get(`/gate-passes/${gp.gate_pass_id}`)).data
      .summary;
    expect([after.status, after.total_available]).toEqual(['OPEN', 5]);
  });

  it('RO-09 the order history opens with view:orders (Order Queue History button), not only create:roofing_order', async () => {
    const r = await tha().get(
      `/roofing-orders/history?from=${colomboToday()}&to=${colomboToday()}`,
    );
    expect(r.status).toBe(200);
  });

  it('RO-07 a workshop-only branch cannot place roofing orders (CTX_002)', async () => {
    const r = await t
      .as(SUP.veyangoda)
      .post(
        '/roofing-orders',
        body([sheetLine(coil.item_id)], { amount: 100000, mode: 'CASH' }),
      );
    expect([r.status, r.code]).toEqual([403, 'CTX_002']);
  });
});

/** The cashier takes the minimum (or, with nothing due, sends it on) for an unpaid order. */
async function toOrderQueue(draft: any) {
  const r =
    draft.min_advance > 0
      ? await cas().post(`/orders/${draft.order_id}/payments`, {
          client_request_id: randomUUID(),
          amount: draft.min_advance,
          mode: 'CASH',
        })
      : await cas().post(`/roofing-orders/${draft.order_id}/send-to-queue`, {
          version: draft.version,
        });
  expect(r.status).toBe(201);
  return r.data;
}

describe('RS supervisor orders go through the cashier', () => {
  it('RS-01 the supervisor submits without payment: Awaiting Payment on the Cashier Queue, not on the Order Queue; the date is stamped', async () => {
    const lines = [sheetLine(coil.item_id)];
    const q = await quote(lines);
    const { payment: _p, ...b } = body(lines, {});
    const r = await tha().post('/roofing-orders', b);
    expect(r.status).toBe(201);
    expect([r.data.status, r.data.display_label, r.data.paid_amount]).toEqual(['DRAFT', 'Awaiting Payment', 0]);
    expect(r.data.header.order_date).toBe(colomboToday());
    expect(r.data.min_advance).toBe(q.min_to_place);
    expect(r.data.can_edit).toBe(true);

    const row = (await cas().get('/cashier-queue')).data.find((x: any) => x.order_id === r.data.order_id);
    expect([row.column, row.advance_due]).toEqual(['AWAITING_PAYMENT', q.min_to_place]);
    const queue = (await tha().get(`/roofing-queue?tab=ALL&search=${r.data.order_number}`)).data;
    expect(queue.rows).toHaveLength(0);

    const placed = await toOrderQueue(r.data);
    expect([placed.status, placed.display_label]).toEqual(['IN_QUEUE', 'Placed']);
  });

  it('RS-02 only the cashier takes a payment or gives a discount while placing', async () => {
    const lines = [sheetLine(coil.item_id)];
    const q = await quote(lines, 100);
    const paid = await tha().post('/roofing-orders', body(lines, { amount: q.min_to_place, mode: 'CASH' }));
    expect([paid.status, paid.code]).toEqual([403, 'ORD_029']);
    const { payment: _p, ...discounted } = body(lines, {}, { discount: 100 });
    const d = await tha().post('/roofing-orders', discounted);
    expect([d.status, d.code]).toEqual([403, 'ORD_028']);
  });

  it('RS-03 the supervisor edits an unpaid order (not its discount); once money is taken only the cashier can', async () => {
    const draft = await roofingOrder(t, { unpaid: true, lines: [sheetLine(coil.item_id, { pieces: 2 })] });
    const edit = (who: string, version: number, over: Record<string, unknown> = {}) =>
      t.as(who).put(`/roofing-orders/${draft.order_id}`, {
        customer: { phone: draft.customer.phone, name: 'Roof Test' },
        lines: [{ ...sheetLine(coil.item_id, { pieces: 4 }), line_id: draft.lines[0].line_id }],
        discount: 0,
        version,
        ...over,
      });
    const r1 = await edit(SUP.thangalla, draft.version);
    expect(r1.status).toBe(200);
    expect(r1.data.status).toBe('DRAFT');
    expect(r1.data.total).toBeGreaterThan(draft.total);
    expect(r1.data.header.order_date).toBe(draft.header.order_date);
    expect((await edit(SUP.thangalla, r1.data.version, { discount: 100 })).code).toBe('ORD_028');

    const placed = await toOrderQueue(r1.data);
    const r2 = await edit(SUP.thangalla, placed.version);
    expect([r2.status, r2.code]).toEqual([403, 'AUTH_004']);
    expect((await edit(CASHIER.thangalla, placed.version)).status).toBe(200);
  });

  it('RS-04 an unpaid order can be cancelled by the cashier; it releases its coil', async () => {
    const before = await t.reserved('thangalla', coil.sku);
    const draft = await roofingOrder(t, { unpaid: true, lines: [sheetLine(coil.item_id, { length_ft: 10, pieces: 1 })] });
    expect(await t.reserved('thangalla', coil.sku)).toBe(before + 10);
    const c = await cas().post(`/roofing-orders/${draft.order_id}/cancel`, { reason: 'Customer left' });
    expect([c.status, c.data.display_label]).toEqual([201, 'Cancelled']);
    expect(await t.reserved('thangalla', coil.sku)).toBe(before);
  });
});

describe('RA item advances (Docs/decisions/0011)', () => {
  it('RA-01 standard items take the branch % (fixed); a customized item is pre-filled, may be typed (0..total, ORD_031); the order minimum is their sum', async () => {
    const photo = (await t.upload(SUP.thangalla, png)).data.attachment_id;
    const standard = sheetLine(coil.item_id);
    const custom = { category: 'Flashing', job_type: 'CUSTOMIZED', material_source: 'BRANCH', coil_item_id: coil.item_id, length_ft: 8, pieces: 2, design_attachment_id: photo };
    const q = await quote([standard, custom]);
    const [s, c] = q.lines;
    expect([s.advance_editable, c.advance_editable]).toEqual([false, true]);
    expect(q.min_to_place).toBe(s.suggested_advance + c.suggested_advance);

    // A typed advance on a standard item is ignored; on the customized one it counts
    const typed = await quote([{ ...standard, advance: 1 }, { ...custom, advance: 12345 }]);
    expect(typed.min_to_place).toBe(s.suggested_advance + 12345);

    const { payment: _p, ...over } = body([standard, { ...custom, advance: c.line_total + 1 }], {});
    expect((await tha().post('/roofing-orders', over)).code).toBe('ORD_031');

    const { payment: _q, ...b } = body([standard, { ...custom, advance: 12345 }], {});
    const r = await tha().post('/roofing-orders', b);
    expect(r.status).toBe(201);
    expect(r.data.min_advance).toBe(s.suggested_advance + 12345);
    expect(r.data.lines.map((l: any) => l.advance)).toEqual([s.suggested_advance, 12345]);
    const row = (await cas().get('/cashier-queue')).data.find((x: any) => x.order_id === r.data.order_id);
    expect(row.advance_due).toBe(s.suggested_advance + 12345);
  });
});

describe('OQ order queue', () => {
  it('OQ-01 tab counts equal their rows and add up; search and placed-on filter', async () => {
    const o = await roofingOrder(t);
    const c = (await tha().get('/roofing-queue?tab=ACTIVE')).data.counts;
    for (const [tab, key] of [
      ['ACTIVE', 'active'],
      ['PLACED', 'placed'],
      ['IN_PROGRESS', 'in_progress'],
      ['READY', 'ready'],
      ['RELEASED', 'released'],
      ['CANCELLED', 'cancelled'],
      ['ALL', 'all'],
    ] as const) {
      const r = (await tha().get(`/roofing-queue?tab=${tab}`)).data;
      if (!r.has_more) expect(r.rows.length).toBe(c[key]);
    }
    expect(c.active).toBe(c.placed + c.in_progress + c.ready);
    expect(c.all).toBe(c.active + c.released + c.cancelled);
    const s = (
      await tha().get(`/roofing-queue?tab=PLACED&search=${o.order_number}`)
    ).data;
    expect(s.rows).toHaveLength(1);
    expect(
      (await tha().get('/roofing-queue?tab=ALL&placed_on=2000-01-01')).data
        .counts.all,
    ).toBe(0);
  });

  it('OQ-02 start deducts coil feet (length × pieces) and moves to In Progress', async () => {
    const o = await roofingOrder(t, {
      lines: [sheetLine(coil.item_id, { length_ft: 10, pieces: 2 })],
    });
    const before = await t.stock('thangalla', coil.sku);
    const r = await tha().post(`/roofing-orders/${o.order_id}/start`, {
      version: o.version,
    });
    expect([r.status, r.data.display_label]).toEqual([201, 'In Progress']);
    expect(await t.stock('thangalla', coil.sku)).toBe(before - 20);
  });

  it('OQ-03 stale version ORD_003; release before Ready ORD_017', async () => {
    const o = await roofingOrder(t);
    expect(
      (
        await tha().post(`/roofing-orders/${o.order_id}/start`, {
          version: o.version + 3,
        })
      ).code,
    ).toBe('ORD_003');
    const s = await tha().post(`/roofing-orders/${o.order_id}/start`, {
      version: o.version,
    });
    const r = await tha().post(`/roofing-orders/${o.order_id}/release`, {
      version: s.data.version,
      released_to: 'X',
    });
    expect([r.status, r.code]).toEqual([409, 'ORD_017']);
  });

  it('OQ-04 short coil: placing → STK_001 → wrong password STK_002 → override places; start takes all free coil without asking again', async () => {
    const low = (await tha().get('/items/coils')).data.find(
      (c: any) => c.stock_ft > 0 && c.stock_ft < 1000,
    );
    const lines = [
      sheetLine(low.item_id, { length_ft: low.stock_ft + 50, pieces: 1 }),
    ];
    const short = await cas().post(
      '/roofing-orders',
      await roofingOrderBody(t, { lines }),
    );
    expect([short.status, short.code, short.details?.override_allowed]).toEqual(
      [409, 'STK_001', true],
    );
    // override:stock is MANAGER-only by default: the right password alone is not enough
    expect(
      (
        await cas().post(
          '/roofing-orders',
          await roofingOrderBody(t, {
            lines,
            override: { password: OVERRIDE_PASSWORD, reason: 'Urgent job' },
          }),
        )
      ).code,
    ).toBe('AUTH_004');
    const o = await t.withGrant('CASHIER', 'override:stock', async () => {
      expect(
        (
          await cas().post(
            '/roofing-orders',
            await roofingOrderBody(t, {
              lines,
              override: { password: 'nope', reason: 'Urgent job' },
            }),
          )
        ).code,
      ).toBe('STK_002');
      return roofingOrder(t, {
        lines,
        override: { password: OVERRIDE_PASSWORD, reason: 'Urgent job' },
      });
    });
    const ok = await tha().post(`/roofing-orders/${o.order_id}/start`, {
      version: o.version,
    });
    expect(ok.status).toBe(201);
    // Everything free is used; what other open orders hold stays for them
    expect(await t.stock('thangalla', low.sku)).toBe(
      await t.reserved('thangalla', low.sku),
    );
  });

  it('OQ-05 complete → Ready with every line inspected', async () => {
    const o = await readyRoofingOrder(t);
    expect(o.display_label).toBe('Ready');
    expect(
      o.lines
        .filter((l: any) => l.status !== 'CANCELLED')
        .every((l: any) => l.inspected_by),
    ).toBe(true);
  });

  it('OQ-06 release with a balance due is refused (ORD_006); the supervisor cannot collect it; after the cashier does, release closes the order', async () => {
    const o = await readyRoofingOrder(t);
    expect(o.balance).toBeGreaterThan(0);
    const blocked = await tha().post(`/roofing-orders/${o.order_id}/release`, {
      version: o.version,
      released_to: 'Customer',
    });
    expect([blocked.status, blocked.code]).toEqual([409, 'ORD_006']);
    expect(
      (
        await tha().post(`/orders/${o.order_id}/payments`, {
          client_request_id: randomUUID(),
          amount: o.balance,
          mode: 'CASH',
        })
      ).code,
    ).toBe('AUTH_004');
    const paid = await payBalance(t, o);
    expect(paid.balance).toBe(0);
    expect(
      (
        await tha().post(`/roofing-orders/${o.order_id}/release`, {
          version: paid.version,
          released_to: '',
        })
      ).status,
    ).toBe(400);
    const r = await tha().post(`/roofing-orders/${o.order_id}/release`, {
      version: paid.version,
      released_to: 'Roof Test',
      note: 'Van CAB-1234',
    });
    expect([r.status, r.data.status, r.data.display_label]).toEqual([
      201,
      'CLOSED',
      'Released',
    ]);
    expect(r.data.milestones.released.note).toContain('Handed to Roof Test');
  });

  it('OQ-07 only the supervisor releases (chief 403); only the cashier cancels (supervisor 403)', async () => {
    const o = await readyRoofingOrder(t, { payFull: true });
    expect(
      (
        await t.as(CHIEF).post(`/roofing-orders/${o.order_id}/release`, {
          version: o.version,
          released_to: 'X',
        })
      ).status,
    ).toBe(403);
    const placed = await roofingOrder(t);
    expect(
      (
        await tha().post(`/roofing-orders/${placed.order_id}/cancel`, {
          reason: 'Customer left',
        })
      ).code,
    ).toBe('AUTH_004');
    const c = await t
      .as(CASHIER.thangalla)
      .post(`/roofing-orders/${placed.order_id}/cancel`, {
        reason: 'Customer changed their mind',
      });
    expect(c.data.display_label).toBe('Cancelled');
  });

  it("OQ-08 BR21: a chief cannot start a supervisor's order while the supervisor is active", async () => {
    await t.token(SUP.thangalla);
    // The supervisor submits it; the cashier's minimum sends it to the Order Queue
    const draft = await roofingOrder(t, { unpaid: true });
    const o = await toOrderQueue(draft);
    const r = await t
      .as(CHIEF)
      .post(`/roofing-orders/${o.order_id}/start`, { version: o.version });
    expect([r.status, r.code]).toEqual([409, 'ORD_007']);
  });

  it('OQ-09 another branch cannot see the order (404)', async () => {
    const o = await roofingOrder(t);
    expect((await t.as(SUP.naiwala).get(`/orders/${o.order_id}`)).status).toBe(
      404,
    );
  });
});
