import { randomUUID } from 'node:crypto';
import { BRANCH, TestApp } from './helpers/app';
import { SUP } from './helpers/fixtures';

/** New catalogue products: a branch asks, its manager approves (Docs/decisions/0013, ITM). */
let t: TestApp;
beforeAll(async () => (t = await TestApp.boot()));
afterAll(() => t.close());

const MGR = 'manager_thangalla';
const MGR_VEY = 'manager_veyangoda';
const sup = () => t.as(SUP.thangalla);
const mgr = () => t.as(MGR);

let seq = 0;
/** A hardware product no one has asked for yet. */
const hardware = (over: Record<string, unknown> = {}) => {
  seq++;
  return {
    client_request_id: randomUUID(),
    name: `E2E hinge ${Date.now() % 1e6}-${seq}`,
    item_type: 'HARDWARE',
    category: 'Fittings',
    unit: 'piece',
    suggested_price: 1500,
    ...over,
  };
};
const live = (
  r: {
    name: string;
    item_type: string;
    category: string;
    unit: string;
    attributes?: object;
  },
  over: Record<string, unknown> = {},
) => ({
  name: r.name,
  item_type: r.item_type,
  category: r.category,
  unit: r.unit,
  attributes: r.attributes ?? {},
  sku: `E2E-${Date.now() % 1e6}-${++seq}`,
  price: 1800,
  unit_cost: 1200,
  reorder_level: 4,
  ...over,
});

describe('ITM new catalogue products', () => {
  it('ITM-01 a supervisor request waits: not in the catalogue, not offered for stock requests', async () => {
    const body = hardware();
    const r = await sup().post('/item-requests', body);
    expect(r.status).toBe(201);
    expect(r.data.status).toBe('PENDING');
    expect(r.data.item).toBeNull();
    expect(
      await t.sql(`SELECT 1 FROM item WHERE name = $1`, [body.name]),
    ).toHaveLength(0);
    const offered = (
      await sup().get(
        `/stock-transfers/items?q=${encodeURIComponent(body.name)}`,
      )
    ).data;
    expect(offered).toHaveLength(0);
    // The same client_request_id is a retry, not a second request
    expect((await sup().post('/item-requests', body)).data.request_id).toBe(
      r.data.request_id,
    );
    expect(
      (await mgr().get('/item-requests/count')).data.pending,
    ).toBeGreaterThanOrEqual(1);
  });

  it('ITM-02 the manager approves with SKU, price and minimum: the item goes live and the branch keeps it; audited', async () => {
    const req = (await sup().post('/item-requests', hardware())).data;
    const dto = live(req, { name: `${req.name} (fixed)` });
    const r = await mgr().post(`/item-requests/${req.request_id}/approve`, dto);
    expect(r.status).toBe(201);
    expect(r.data.status).toBe('APPROVED');
    expect(r.data.item.sku).toBe(dto.sku);
    const [item] = await t.sql(
      `SELECT name, price, is_active FROM item WHERE item_id = $1`,
      [r.data.item.item_id],
    );
    expect(item).toMatchObject({
      name: dto.name,
      price: 1800,
      is_active: true,
    });
    const [row] = await t.sql(
      `SELECT quantity, reorder_level FROM branch_stock WHERE branch_id = $1 AND item_id = $2`,
      [BRANCH.thangalla, r.data.item.item_id],
    );
    expect(Number(row.quantity)).toBe(0);
    expect(Number(row.reorder_level)).toBe(4);
    // Nothing on hand and a minimum of 4: it is waiting in Restock
    const alerts = (await sup().get('/stock-alerts')).data.rows;
    expect(
      alerts.some(
        (a: { item_id: string }) => a.item_id === r.data.item.item_id,
      ),
    ).toBe(true);
    const audit = await t.sql(
      `SELECT action FROM audit_log WHERE entity_id = ANY($1::uuid[])`,
      [[req.request_id, r.data.item.item_id]],
    );
    expect(audit.map((a) => a.action).sort()).toEqual(
      expect.arrayContaining(['APPROVE', 'CREATE']),
    );
    // Decided requests can't be decided again
    expect(
      (
        await mgr().post(`/item-requests/${req.request_id}/reject`, {
          reason: 'too late',
        })
      ).code,
    ).toBe('ITM_004');
  });

  it('ITM-03 reject needs a reason; only the requester cancels, and only while waiting', async () => {
    const a = (await sup().post('/item-requests', hardware())).data;
    expect(
      (
        await mgr().post(`/item-requests/${a.request_id}/reject`, {
          reason: '',
        })
      ).status,
    ).toBe(400);
    const rj = await mgr().post(`/item-requests/${a.request_id}/reject`, {
      reason: 'We already stock a similar hinge',
    });
    expect(rj.data).toMatchObject({
      status: 'REJECTED',
      reject_reason: 'We already stock a similar hinge',
    });

    const b = (await sup().post('/item-requests', hardware())).data;
    expect(
      (await mgr().post(`/item-requests/${b.request_id}/cancel`)).code,
    ).toBe('ITM_005');
    expect(
      (await sup().post(`/item-requests/${b.request_id}/cancel`)).data.status,
    ).toBe('CANCELLED');
    expect(
      (await sup().post(`/item-requests/${b.request_id}/cancel`)).code,
    ).toBe('ITM_004');
  });

  it('ITM-04 who decides: supervisor 403, another branch manager 404, head office 403', async () => {
    const req = (await sup().post('/item-requests', hardware())).data;
    const url = `/item-requests/${req.request_id}/approve`;
    expect((await sup().post(url, live(req))).status).toBe(403);
    expect((await t.as(MGR_VEY).post(url, live(req))).code).toBe('ITM_003');
    expect(
      (await t.as('admin', { branch: 'thangalla' }).post(url, live(req)))
        .status,
    ).toBe(403);
    // Head office reads the branch's requests
    const list = (
      await t.as('admin', { branch: 'thangalla' }).get('/item-requests')
    ).data.rows;
    expect(
      list.some((r: { request_id: string }) => r.request_id === req.request_id),
    ).toBe(true);
    // A supervisor can't approve their own request by sending the approval with it
    expect(
      (
        await sup().post('/item-requests', {
          ...hardware(),
          approve: {
            sku: 'E2E-SELF-1',
            price: 100,
            unit_cost: 0,
            reorder_level: 1,
          },
        })
      ).status,
    ).toBe(403);
  });

  it('ITM-05 duplicates: a sheet with the same material + thickness, a taken SKU, a hardware name', async () => {
    const [sheet] = await t.sql(
      `SELECT name, sku, attributes FROM item WHERE item_type = 'MATERIAL' AND is_active LIMIT 1`,
    );
    const dupSheet = await sup().post('/item-requests', {
      client_request_id: randomUUID(),
      name: 'Another name, same sheet',
      item_type: 'MATERIAL',
      category: 'Sheets',
      unit: 'sheet',
      attributes: {
        material_type: sheet.attributes.material_type,
        thickness: sheet.attributes.thickness,
      },
    });
    expect(dupSheet.code).toBe('ITM_002');
    expect(dupSheet.details).toMatchObject({ sku: sheet.sku });

    const req = (await sup().post('/item-requests', hardware())).data;
    expect(
      (
        await mgr().post(
          `/item-requests/${req.request_id}/approve`,
          live(req, { sku: 'PIP-GI-100' }),
        )
      ).code,
    ).toBe('ITM_001');
    expect(
      (
        await mgr().post(
          `/item-requests/${req.request_id}/approve`,
          live(req, { price: 0 }),
        )
      ).status,
    ).toBe(400);
    const [pipe] = await t.sql(
      `SELECT name FROM item WHERE sku = 'PIP-GI-100'`,
    );
    expect(
      (
        await sup().post(
          '/item-requests',
          hardware({ name: pipe.name.toUpperCase() }),
        )
      ).code,
    ).toBe('ITM_002');
  });

  it("ITM-06 a manager's own product posts directly; head office adds from Price List", async () => {
    const body = hardware();
    const r = await mgr().post('/item-requests', {
      ...body,
      approve: {
        sku: `E2E-MGR-${Date.now() % 1e6}`,
        price: 900,
        unit_cost: 500,
        reorder_level: 2,
      },
    });
    expect(r.status).toBe(201);
    expect(r.data.status).toBe('APPROVED');
    expect(r.data.item).not.toBeNull();

    const sku = `E2E-HO-${Date.now() % 1e6}`;
    const ho = await t.as('admin').post('/items', {
      name: `Head office bracket ${sku}`,
      item_type: 'HARDWARE',
      category: 'Fittings',
      unit: 'piece',
      sku,
      price: 700,
      unit_cost: 400,
    });
    expect(ho.status).toBe(201);
    expect(
      (await t.sql(`SELECT 1 FROM item WHERE sku = $1 AND is_active`, [sku]))
        .length,
    ).toBe(1);
    // Branch staff can't add straight to the catalogue
    expect(
      (
        await mgr().post('/items', {
          name: 'x',
          item_type: 'HARDWARE',
          category: 'Fittings',
          unit: 'piece',
          sku: `${sku}-B`,
          price: 1,
          unit_cost: 0,
        })
      ).status,
    ).toBe(403);
  });
});
