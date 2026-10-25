import { TestApp } from './helpers/app';
import { CASHIER, CUSTOM_LINE, ROLLING_LINE, SUP, colomboToday, jobCard, roofingOrder } from './helpers/fixtures';

/** HIS: History popup on Create Job Card / Create Order (own branch, date range, paged). */
let t: TestApp;
beforeAll(async () => (t = await TestApp.boot()));
afterAll(() => t.close());

const tha = () => t.as(SUP.thangalla);
const today = colomboToday();

describe('HIS order history', () => {
  it('HIS-01 job cards in the range are listed newest first with status, creator and totals; voided ones too', async () => {
    const a = await jobCard(t, { lines: [ROLLING_LINE] });
    const b = await jobCard(t, { lines: [CUSTOM_LINE] }); // stays DRAFT, so it can be voided
    expect((await tha().post(`/job-cards/${b.order_id}/void`, { reason: 'Customer left' })).status).toBe(201);
    const r = await tha().get(`/job-cards/history?from=${today}&to=${today}&search=${b.order_number}`);
    expect(r.status).toBe(200);
    expect(r.data.rows).toHaveLength(1);
    expect(r.data.rows[0]).toMatchObject({ order_number: b.order_number, status: 'VOIDED', date: today });
    expect(r.data.rows[0].created_by_name).toBeTruthy();

    const ra = (await tha().get(`/job-cards/history?from=${today}&to=${today}&search=${a.order_number}`)).data;
    expect(ra.rows[0]).toMatchObject({ order_number: a.order_number, status: 'IN_QUEUE' });

    const all = (await tha().get(`/job-cards/history?from=${today}&to=${today}`)).data;
    expect(all.total).toBeGreaterThanOrEqual(2);
    expect(all.rows.every((x: any) => x.date === today)).toBe(true);
    // Newest first
    const times = all.rows.map((x: any) => x.created_at);
    expect(times).toEqual([...times].sort().reverse());
  });

  it('HIS-02 a range before the card was made does not list it; total and paging agree', async () => {
    const c = await jobCard(t, { lines: [ROLLING_LINE] });
    const old = (await tha().get(`/job-cards/history?from=2000-01-01&to=2000-01-31&search=${c.order_number}`)).data;
    expect([old.total, old.rows.length]).toEqual([0, 0]);
    const p1 = (await tha().get(`/job-cards/history?from=${colomboToday(-30)}&to=${today}`)).data;
    expect(p1.rows.length).toBe(Math.min(p1.total, p1.page_size));
    if (p1.total > p1.page_size) {
      const p2 = (await tha().get(`/job-cards/history?from=${colomboToday(-30)}&to=${today}&page=2`)).data;
      expect(p2.rows[0].order_id).not.toBe(p1.rows[0].order_id);
    }
  });

  it('HIS-03 bad ranges are refused (from after to, more than 366 days)', async () => {
    expect((await tha().get(`/job-cards/history?from=${today}&to=${colomboToday(-1)}`)).status).toBe(400);
    expect((await tha().get(`/job-cards/history?from=2024-01-01&to=2025-06-01`)).status).toBe(400);
    expect((await tha().get(`/job-cards/history?to=${today}`)).status).toBe(400);
  });

  it('HIS-04 own branch only (BR06): another branch does not see the card', async () => {
    const c = await jobCard(t, { lines: [ROLLING_LINE] });
    const r = (await t.as(SUP.veyangoda).get(`/job-cards/history?from=${today}&to=${today}&search=${c.order_number}`)).data;
    expect(r.total).toBe(0);
  });

  it('HIS-05 roofing orders have their own history, which the cashier can open too', async () => {
    const o = await roofingOrder(t);
    const r = (await tha().get(`/roofing-orders/history?from=${today}&to=${today}&search=${o.order_number}`)).data;
    expect(r.rows[0]).toMatchObject({ order_number: o.order_number, display_label: 'Placed' });
    expect(r.rows[0].item_count).toBe(1);
    const cashier = await t.as(CASHIER.thangalla).get(`/roofing-orders/history?from=${today}&to=${today}&search=${o.order_number}`);
    expect(cashier.data.total).toBe(1);
    // Job card history doesn't list roofing orders
    expect((await tha().get(`/job-cards/history?from=${today}&to=${today}&search=${o.order_number}`)).data.total).toBe(0);
  });
});
