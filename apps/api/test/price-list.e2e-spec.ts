import { TestApp } from './helpers/app';
import { CASHIER, CHIEF, ROLLING_LINE, SUP, jobCardBody, newPhone, workerIds } from './helpers/fixtures';

/**
 * Global price list (Docs/decisions/0004): one list for every branch.
 * Managers and head office edit it, the Auditor views it, branch staff don't see it.
 */
let t: TestApp;
const MGR = 'manager_thangalla';

beforeAll(async () => {
  t = await TestApp.boot();
});
afterAll(() => t.close());

/** The seeded rate the ROLLING_LINE fixture (GI Pipe, 1", pipe bending) prices from. */
async function giPipeRate(user = MGR) {
  const r = await t.as(user).get('/price-list/rates?line_type=ROLLING');
  const rate = r.data.find((x: any) => x.sub_type === 'PIPE_BEND' && x.work_type === 'GI Pipe' && x.thickness_or_size === ROLLING_LINE.size);
  if (!rate) throw new Error('GI Pipe 1" rate missing from the seed');
  return rate;
}

describe('PL-ACC who may see and edit the price list', () => {
  it.each(['superadmin', 'admin', 'auditor1', MGR])('PL-ACC-01 %s can view rates and items', async (user) => {
    expect((await t.as(user).get('/price-list/rates')).status).toBe(200);
    expect((await t.as(user).get('/price-list/items')).status).toBe(200);
  });

  it.each([SUP.thangalla, CASHIER.thangalla, CHIEF])('PL-ACC-02 %s cannot open the price list', async (user) => {
    const r = await t.as(user).get('/price-list/rates');
    expect([r.status, r.code]).toEqual([403, 'AUTH_004']);
  });

  it('PL-ACC-03 the auditor views but cannot edit', async () => {
    const rate = await giPipeRate();
    const r = await t.as('auditor1').patch(`/price-list/rates/${rate.rate_id}`, { rate: rate.rate + 100 });
    expect([r.status, r.code]).toEqual([403, 'AUTH_004']);
  });

  it('PL-ACC-04 head office (ADMIN) edits it — a global setting, not branch work', async () => {
    const rate = await giPipeRate('admin');
    const r = await t.as('admin').patch(`/price-list/rates/${rate.rate_id}`, { rate: rate.rate });
    expect(r.status).toBe(200);
  });

  it('PL-ACC-05 item prices need configure:item_prices', async () => {
    const id = await t.itemId('FST-NM-012');
    const [item] = await t.sql(`SELECT price FROM item WHERE item_id = $1`, [id]);
    const ok = await t.as(MGR).patch(`/price-list/items/${id}`, { price: item.price });
    expect(ok.status).toBe(200);
    await t.setGrant('MANAGER', 'configure:item_prices', false);
    try {
      const r = await t.as(MGR).patch(`/price-list/items/${id}`, { price: item.price + 100 });
      expect([r.status, r.code]).toEqual([403, 'AUTH_004']);
    } finally {
      await t.setGrant('MANAGER', 'configure:item_prices', true);
    }
  });
});

describe('PL-RATE editing work rates', () => {
  it('PL-RATE-01 a rate change prices new quotes in every branch; saved orders keep their price', async () => {
    const rate = await giPipeRate();
    const workers = await workerIds(t, SUP.thangalla, 1);
    const saved = await t.as(SUP.thangalla).post('/job-cards', jobCardBody(newPhone(), workers, [ROLLING_LINE]));
    expect(saved.status).toBe(201);
    const before = saved.data.total;

    const next = rate.rate + 2500;
    const r = await t.as(MGR).patch(`/price-list/rates/${rate.rate_id}`, { rate: next });
    expect([r.status, r.data.rate]).toEqual([200, next]);
    try {
      // Thangalla's manager changed it; Veyangoda's quote uses it too
      const q = await t.as(SUP.veyangoda).post('/job-cards/quote', { lines: [ROLLING_LINE] });
      expect(q.data.subtotal).toBe(next * ROLLING_LINE.quantity);
      const [order] = await t.sql(`SELECT total FROM "order" WHERE order_id = $1`, [saved.data.order_id]);
      expect(Number(order.total)).toBe(before);
    } finally {
      await t.as(MGR).patch(`/price-list/rates/${rate.rate_id}`, { rate: rate.rate });
    }
  });

  it('PL-RATE-02 adding a rate whose key already has an active rate is refused (PRC_003)', async () => {
    const rate = await giPipeRate();
    const r = await t.as(MGR).post('/price-list/rates', {
      line_type: 'ROLLING',
      sub_type: 'PIPE_BEND',
      work_type: 'GI Pipe',
      thickness_or_size: rate.thickness_or_size,
      price_basis: 'PER_PIECE',
      rate: 100,
    });
    expect([r.status, r.code]).toEqual([409, 'PRC_003']);
  });

  it('PL-RATE-03 a deactivated rate makes the job customized; a new rate prices it again', async () => {
    const line = { job_type: 'CUT_BEND', material_type: 'Stainless Steel (SS)', thickness: '6mm', material_quantity: 1, cut_count: 2 };
    const before = await t.as(SUP.thangalla).post('/job-cards/quote', { lines: [line] });
    expect(before.data.missing_rates.length).toBeGreaterThan(0);

    const add = await t.as(MGR).post('/price-list/rates', {
      line_type: 'CUT_BEND',
      sub_type: 'CUT',
      variant: 'Stainless Steel (SS)',
      thickness_or_size: '6mm',
      price_basis: 'PER_CUT',
      rate: 9000,
    });
    expect(add.status).toBe(201);
    try {
      const priced = await t.as(SUP.thangalla).post('/job-cards/quote', { lines: [line] });
      // The cut is priced now (the sheet itself may still have no catalogue price)
      expect(priced.data.missing_rates.length).toBeLessThan(before.data.missing_rates.length);

      const off = await t.as(MGR).patch(`/price-list/rates/${add.data.rate_id}`, { is_active: false });
      expect([off.status, off.data.is_active]).toEqual([200, false]);
      const again = await t.as(SUP.thangalla).post('/job-cards/quote', { lines: [line] });
      expect(again.data.missing_rates).toEqual(before.data.missing_rates);

      // Inactive rows stay listed for history
      const list = await t.as(MGR).get('/price-list/rates?line_type=CUT_BEND&include_inactive=true');
      expect(list.data.some((x: any) => x.rate_id === add.data.rate_id && !x.is_active)).toBe(true);
    } finally {
      await t.sql(`DELETE FROM price_rate WHERE rate_id = $1`, [add.data.rate_id]);
    }
  });

  it('PL-RATE-04 changes are audited', async () => {
    const rate = await giPipeRate();
    await t.as(MGR).patch(`/price-list/rates/${rate.rate_id}`, { rate: rate.rate + 1 });
    await t.as(MGR).patch(`/price-list/rates/${rate.rate_id}`, { rate: rate.rate });
    const rows = await t.sql(`SELECT action FROM audit_log WHERE entity_type = 'price_rate' AND entity_id = $1`, [rate.rate_id]);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
