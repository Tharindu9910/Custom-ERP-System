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
    order_date: colomboToday(),
    technician: 'Sampath',
    material_source: 'BRANCH',
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
    const noPhoto = await tha().post(
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
    const unknown = await tha().post(
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
      const r = await tha().post('/roofing-orders', body(lines, payment, over));
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
    const r = await tha().post('/roofing-orders', b);
    expect(r.status).toBe(201);
    expect(r.data.order_number).toMatch(/^WO-FORM-/);
    expect([r.data.status, r.data.display_label]).toEqual([
      'IN_QUEUE',
      'Placed',
    ]);
    expect(r.data.total).toBe(q.total);
    expect(r.data.paid_amount).toBe(q.min_to_place);
    const again = await tha().post('/roofing-orders', b);
    expect(again.data.order_id).toBe(r.data.order_id);
    const payments = await t.sql(`SELECT 1 FROM payment WHERE order_id = $1`, [
      r.data.order_id,
    ]);
    expect(payments).toHaveLength(1);
  });

  it('RO-06 customer material from a gate pass is committed to the order', async () => {
    const gp = await gatePass(t, SUP.thangalla, {
      items: [{ material_type: 'Zinc Coated', thickness: '1.5', quantity: 5 }],
    });
    const line = {
      category: 'Gutter',
      job_type: 'STANDARD',
      material_source: 'CUSTOMER',
      length_ft: 10,
      pieces: 2,
    };
    const q = await quote([line]);
    const r = await tha().post(
      '/roofing-orders',
      body(
        [line],
        { amount: q.min_to_place, mode: 'CASH' },
        {
          customer: { phone: gp.phone, name: 'Roof Test' },
          material_source: 'CUSTOMER',
          gate_pass_id: gp.gate_pass_id,
          allocations: [{ gp_item_id: gp.items[0].gp_item_id, quantity: 3 }],
        },
      ),
    );
    expect(r.status).toBe(201);
    expect(r.data.customer_materials[0].quantity).toBe(3);
    expect(
      (await tha().get(`/gate-passes/${gp.gate_pass_id}`)).data.summary
        .total_available,
    ).toBe(2);
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
    const short = await tha().post(
      '/roofing-orders',
      await roofingOrderBody(t, { lines }),
    );
    expect([short.status, short.code, short.details?.override_allowed]).toEqual(
      [409, 'STK_001', true],
    );
    expect(
      (
        await tha().post(
          '/roofing-orders',
          await roofingOrderBody(t, {
            lines,
            override: { password: 'nope', reason: 'Urgent job' },
          }),
        )
      ).code,
    ).toBe('STK_002');
    const o = await roofingOrder(t, {
      lines,
      override: { password: OVERRIDE_PASSWORD, reason: 'Urgent job' },
    });
    const ok = await tha().post(`/roofing-orders/${o.order_id}/start`, {
      version: o.version,
    });
    expect(ok.status).toBe(201);
    // Everything free is used; what other open orders hold stays for them
    expect(await t.stock('thangalla', low.sku)).toBe(await t.reserved('thangalla', low.sku));
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
    const o = await roofingOrder(t);
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
