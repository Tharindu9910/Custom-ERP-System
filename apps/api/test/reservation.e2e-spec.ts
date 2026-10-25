import { TestApp } from './helpers/app';
import {
  CASHIER,
  CUSTOM_LINE,
  OVERRIDE_PASSWORD,
  SUP,
  jobCard,
  jobCardBody,
  material,
  newPhone,
  richCoil,
  roofingOrder,
  sendAll,
  sheetLine,
  transfer,
  workerIds,
} from './helpers/fixtures';

/**
 * Branch material is held from the moment an order is saved until its work starts
 * (Docs/decisions/0003): available = on hand − reserved, and nothing else can take
 * what an open order holds.
 */
let t: TestApp;
beforeAll(async () => (t = await TestApp.boot()));
afterAll(() => t.close());

const tha = () => t.as(SUP.thangalla);

const sheet = (m: { material_type: string; thickness: string }, qty: number) => ({
  job_type: 'CUT_BEND',
  material_type: m.material_type,
  thickness: m.thickness,
  material_quantity: qty,
  cut_count: 1,
});

const inventoryRow = async (sku: string) => (await tha().get(`/inventory?q=${sku}`)).data.rows.find((r: any) => r.sku === sku);

describe('RSV stock reservation', () => {
  it('RSV-01 saving a job card holds its sheets; Inventory shows on hand / reserved / available; the item popup lists the hold', async () => {
    const m = await material(t, 'thangalla', 4);
    const before = await inventoryRow(m.sku);
    const card = await jobCard(t, { lines: [sheet(m, 2), CUSTOM_LINE] });

    const after = await inventoryRow(m.sku);
    expect(after.stock).toBe(before.stock);
    expect(after.reserved).toBe(before.reserved + 2);
    expect(after.available).toBe(before.available - 2);
    expect(after.available).toBe(after.stock - after.reserved);

    const d = (await tha().get(`/inventory/${after.item_id}`)).data;
    expect(d.reservations.some((r: any) => r.order_id === card.order_id && r.quantity === 2)).toBe(true);
  });

  it('RSV-02 a second card cannot take what the first one holds (409 lists available, not on hand)', async () => {
    const m = await material(t, 'thangalla', 4);
    await jobCard(t, { lines: [sheet(m, m.quantity), CUSTOM_LINE] });
    const onHand = await t.stock('thangalla', m.sku);

    const workers = await workerIds(t, SUP.thangalla, 1);
    const r = await tha().post('/job-cards', jobCardBody(newPhone(), workers, [sheet(m, 1), CUSTOM_LINE]));
    expect([r.status, r.code]).toEqual([409, 'STK_001']);
    expect(r.details.shortages[0]).toMatchObject({ required: 1, available: 0 });
    expect(r.details.shortages[0].reserved).toBeGreaterThanOrEqual(m.quantity);
    expect(await t.stock('thangalla', m.sku)).toBe(onHand);
  });

  it('RSV-03 voiding a draft releases its hold', async () => {
    const m = await material(t, 'thangalla', 3);
    const card = await jobCard(t, { lines: [sheet(m, 3), CUSTOM_LINE] });
    const held = await t.reserved('thangalla', m.sku);
    const v = await tha().post(`/job-cards/${card.order_id}/void`, { reason: 'Customer changed their mind' });
    expect(v.status).toBe(201);
    expect(await t.reserved('thangalla', m.sku)).toBe(held - 3);
    const [res] = await t.sql(`SELECT status, release_reason FROM stock_reservation WHERE order_id = $1`, [card.order_id]);
    expect(res).toEqual({ status: 'RELEASED', release_reason: 'order_cancelled' });
  });

  it('RSV-04 editing a card re-holds for the new quantity; an edit beyond what is available is refused and keeps the old hold', async () => {
    const m = await material(t, 'thangalla', 6);
    const workers = await workerIds(t, SUP.thangalla, 1);
    const card = await jobCard(t, { lines: [sheet(m, 2), CUSTOM_LINE] });
    const held = await t.reserved('thangalla', m.sku);
    const edit = (qty: number, version: number) =>
      tha().put(`/job-cards/${card.order_id}`, {
        ...jobCardBody(newPhone(), workers, [{ ...sheet(m, qty), line_id: card.lines[0].line_id }, CUSTOM_LINE]),
        client_request_id: undefined,
        version,
      });

    const up = await edit(4, card.version);
    expect(up.status).toBe(200);
    expect(await t.reserved('thangalla', m.sku)).toBe(held + 2);

    const free = (await inventoryRow(m.sku)).available;
    const tooMuch = await edit(4 + free + 1, up.data.version);
    expect([tooMuch.status, tooMuch.code]).toEqual([409, 'STK_001']);
    expect(await t.reserved('thangalla', m.sku)).toBe(held + 2);
  });

  it('RSV-05 starting a line consumes its hold: on hand and reserved both drop by the line quantity', async () => {
    const m = await material(t, 'thangalla', 3);
    const card = await jobCard(t, { lines: [sheet(m, 3), CUSTOM_LINE], paid: true });
    const onHand = await t.stock('thangalla', m.sku);
    const held = await t.reserved('thangalla', m.sku);
    const l = card.lines[0];
    const s = await tha().post(`/order-lines/${l.line_id}/start`, { version: l.version });
    expect(s.status).toBe(201);
    expect(await t.stock('thangalla', m.sku)).toBe(onHand - 3);
    expect(await t.reserved('thangalla', m.sku)).toBe(held - 3);
    const [res] = await t.sql(`SELECT status FROM stock_reservation WHERE line_id = $1`, [l.line_id]);
    expect(res.status).toBe('CONSUMED');
    const [mv] = await t.sql(`SELECT movement_type, quantity FROM stock_movement WHERE line_id = $1`, [l.line_id]);
    expect([mv.movement_type, Number(mv.quantity)]).toEqual(['JOB_USAGE', -3]);
  });

  it('RSV-06 a stock request can only be sent from available stock', async () => {
    const m = await material(t, 'thangalla', 3);
    await jobCard(t, { lines: [sheet(m, m.quantity), CUSTOM_LINE] });
    const onHand = await t.stock('thangalla', m.sku);
    expect(onHand).toBeGreaterThan(0);

    const tr = await transfer(t, 'veyangoda', 'thangalla', [[m.sku, 1]]);
    const view = (await tha().get(`/stock-transfers/${tr.transfer_id}`)).data;
    expect(view.lines[0].own_stock).toBe(onHand);
    expect(view.lines[0].own_available).toBe(0);
    const r = await tha().post(`/stock-transfers/${tr.transfer_id}/send`, sendAll(tr, () => 1));
    expect([r.status, r.code]).toEqual([409, 'TRF_004']);
    await t.as(SUP.veyangoda).post(`/stock-transfers/${tr.transfer_id}/cancel`);
  });

  it('RSV-07 two cards racing for the last sheets: exactly one is saved', async () => {
    const m = await material(t, 'thangalla', 2);
    const workers = await workerIds(t, SUP.thangalla, 1);
    const qty = m.quantity;
    const [a, b] = await Promise.all([
      tha().post('/job-cards', jobCardBody(newPhone(), workers, [sheet(m, qty), CUSTOM_LINE])),
      tha().post('/job-cards', jobCardBody(newPhone(), workers, [sheet(m, qty), CUSTOM_LINE])),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const row = await inventoryRow(m.sku);
    expect(row.available).toBe(0);
  });

  it('RSV-08 roofing: placing holds coil ft; cancelling releases it; an override places a short order holding only what is free', async () => {
    const coil = await richCoil(t);
    const sku = coil.sku;
    const before = await t.reserved('thangalla', sku);
    const o = await roofingOrder(t, { lines: [sheetLine(coil.item_id, { length_ft: 10, pieces: 2 })] });
    expect(await t.reserved('thangalla', sku)).toBe(before + 20);
    const c = await t.as(CASHIER.thangalla).post(`/roofing-orders/${o.order_id}/cancel`, { reason: 'Customer cancelled' });
    expect(c.status).toBe(201);
    expect(await t.reserved('thangalla', sku)).toBe(before);

    const free = (await tha().get('/items/coils')).data.find((x: any) => x.item_id === coil.item_id).stock_ft;
    const short = await t.withGrant('SUPERVISOR', 'override:stock', () =>
      roofingOrder(t, {
        lines: [sheetLine(coil.item_id, { length_ft: free + 5, pieces: 1 })],
        override: { password: OVERRIDE_PASSWORD, reason: 'Coil arriving today' },
      }),
    );
    const [res] = await t.sql(`SELECT quantity, shortfall, override_reason FROM stock_reservation WHERE order_id = $1`, [short.order_id]);
    expect([Number(res.quantity), Number(res.shortfall), res.override_reason]).toEqual([free, 5, 'Coil arriving today']);
    expect((await tha().get('/items/coils')).data.find((x: any) => x.item_id === coil.item_id).stock_ft).toBe(0);
    await t.as(CASHIER.thangalla).post(`/roofing-orders/${short.order_id}/cancel`, { reason: 'Test clean-up' });
  });

  it('RSV-09 the database agrees: reserved = sum of open holds, and 0 ≤ reserved ≤ on hand everywhere', async () => {
    const [drift] = await t.sql(`
      SELECT count(*)::int AS n FROM branch_stock s
      LEFT JOIN (SELECT branch_id, item_id, sum(quantity) AS total FROM stock_reservation WHERE status = 'RESERVED' GROUP BY 1, 2) r
        ON r.branch_id = s.branch_id AND r.item_id = s.item_id
      WHERE s.reserved_quantity <> COALESCE(r.total, 0) OR s.reserved_quantity < 0 OR s.reserved_quantity > s.quantity`);
    expect(drift.n).toBe(0);
  });
});
