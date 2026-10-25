import { randomUUID } from 'node:crypto';
import { BRANCH, TestApp } from './helpers/app';
import {
  CHIEF,
  CASHIER,
  SUP,
  clearOpenRequests,
  colomboToday,
  receiveAll,
  sendAll,
  transfer,
} from './helpers/fixtures';

/** Inventory, Stock Alerts and Stock Requests for supervisors (Docs/testing/role-capabilities.md INV, ALR, TRF). */
let t: TestApp;
beforeAll(async () => (t = await TestApp.boot()));
afterAll(() => t.close());

const tha = () => t.as(SUP.thangalla);
const vey = () => t.as(SUP.veyangoda);

describe('INV inventory (own branch only, BR06)', () => {
  it('INV-01 tabs: counts equal rows, all = healthy + low + out, rows follow the stock rule', async () => {
    const all = (await tha().get('/inventory')).data;
    expect(all.counts.all).toBe(
      all.counts.healthy + all.counts.low + all.counts.out,
    );
    for (const [st, key] of [
      ['HEALTHY', 'healthy'],
      ['LOW', 'low'],
      ['OUT', 'out'],
    ] as const) {
      const rows = (await tha().get(`/inventory?status=${st}`)).data.rows;
      expect(rows.length).toBe(all.counts[key]);
      for (const r of rows) {
        if (st === 'OUT') expect(r.stock).toBeLessThanOrEqual(0);
        if (st === 'LOW')
          expect(r.stock > 0 && r.stock <= r.reorder_level).toBe(true);
        if (st === 'HEALTHY') expect(r.stock).toBeGreaterThan(r.reorder_level);
      }
    }
  });

  it('INV-02 search, category and sort', async () => {
    const s = (await tha().get('/inventory?q=bolt')).data;
    expect(
      s.rows.every((r: any) =>
        `${r.name}${r.sku}${r.category}`.toLowerCase().includes('bolt'),
      ),
    ).toBe(true);
    expect(s.counts.all).toBe(s.rows.length);
    const c = (await tha().get('/inventory?category=Pipes')).data.rows;
    expect(c.length).toBeGreaterThan(0);
    expect(c.every((r: any) => r.category === 'Pipes')).toBe(true);
    const q = (await tha().get('/inventory?sort=STOCK_ASC')).data.rows.map(
      (r: any) => r.stock,
    );
    expect(q).toEqual([...q].sort((a, b) => a - b));
  });

  it('INV-03 shows our own stock only; details carry movements and no other-branch figures', async () => {
    const row = (await tha().get('/inventory?q=PIP-GI-100')).data.rows[0];
    expect(row.stock).toBe(await t.stock('thangalla', 'PIP-GI-100'));
    const d = (await tha().get(`/inventory/${row.item_id}`)).data;
    expect(d.stock).toBe(row.stock);
    expect(d.movements.length).toBeGreaterThan(0);
    expect(d).not.toHaveProperty('branches');
    expect(d).not.toHaveProperty('network_total');
  });

  it('INV-04 unknown item → 404 STK_003; coils hidden at a workshop-only branch', async () => {
    const r = await tha().get(`/inventory/${randomUUID()}`);
    expect([r.status, r.code]).toEqual([404, 'STK_003']);
    expect(
      (await vey().get('/inventory')).data.rows.every(
        (x: any) => x.item_type !== 'COIL',
      ),
    ).toBe(true);
  });

  it('INV-05 an open request shows on the inventory row and disappears once received', async () => {
    const tr = await transfer(t, 'thangalla', 'veyangoda', [['PIP-GI-100', 2]]);
    const row = () =>
      tha()
        .get('/inventory?q=PIP-GI-100')
        .then((r) => r.data.rows[0]);
    expect((await row()).open_request?.status).toBe('WAITING');
    await vey().post(
      `/stock-transfers/${tr.transfer_id}/send`,
      sendAll(tr, () => 2),
    );
    expect((await row()).open_request).toMatchObject({
      status: 'SENT',
      qty: 2,
    });
    await tha().post(
      `/stock-transfers/${tr.transfer_id}/receive`,
      receiveAll(tr, () => 2),
    );
    expect((await row()).open_request).toBeNull();
  });
});

describe('ALR stock alerts', () => {
  it('ALR-01 needs-restock = critical + low = rows; agrees with inventory; critical first', async () => {
    const al = (await tha().get('/stock-alerts')).data;
    const inv = (await tha().get('/inventory')).data;
    expect(al.counts.needs_restock).toBe(al.counts.critical + al.counts.low);
    expect(al.rows.length).toBe(al.counts.needs_restock);
    expect([al.counts.critical, al.counts.low]).toEqual([
      inv.counts.out,
      inv.counts.low,
    ]);
    if (al.rows.length) expect(al.rows[0].severity).toBe('CRITICAL');
  });

  it('ALR-02 deficit brings the item back to its minimum; tab counts equal rows', async () => {
    const al = (await tha().get('/stock-alerts')).data;
    for (const r of al.rows)
      expect(r.deficit).toBeCloseTo(
        r.severity === 'CRITICAL' ? r.reorder_level : r.reorder_level - r.stock,
        3,
      );
    for (const [f, key] of [
      ['CRITICAL', 'critical'],
      ['LOW', 'low'],
    ] as const) {
      expect(
        (await tha().get(`/stock-alerts?filter=${f}`)).data.rows.length,
      ).toBe(al.counts[key]);
    }
  });

  it('ALR-03 chief and cashier have no stock alerts (403)', async () => {
    expect((await t.as(CHIEF).get('/stock-alerts')).status).toBe(403);
    expect((await t.as(CASHIER.thangalla).get('/stock-alerts')).status).toBe(
      403,
    );
  });
});

describe('TRF stock requests', () => {
  const req = async (
    from: keyof typeof SUP,
    to: string,
    lines: [string, number][],
    over: Record<string, unknown> = {},
  ) =>
    t.as(SUP[from]).post('/stock-transfers', {
      client_request_id: randomUUID(),
      supplying_branch_id: to,
      needed_before: colomboToday(3),
      lines: await Promise.all(
        lines.map(async ([sku, quantity]) => ({
          item_id: await t.itemId(sku),
          quantity,
        })),
      ),
      ...over,
    });

  it('TRF-01 targets are the other branches, main first, with no stock figures (BR06)', async () => {
    const r = (await tha().get('/stock-transfers/targets')).data;
    expect(r.map((x: any) => x.name)).toEqual(['Naiwala', 'Veyangoda']);
    expect(
      r.every(
        (x: any) => Object.keys(x).sort().join() === 'branch_id,is_main,name',
      ),
    ).toBe(true);
  });

  it('TRF-02 create rules: own branch TRF_006, past date TRF_007, duplicate line VAL_001, zero qty, unknown item STK_003', async () => {
    await clearOpenRequests(t, 'thangalla', ['BAR-FL-025']);
    expect(
      (await req('thangalla', BRANCH.thangalla, [['BAR-FL-025', 2]])).code,
    ).toBe('TRF_006');
    expect(
      (
        await req('thangalla', BRANCH.veyangoda, [['BAR-FL-025', 2]], {
          needed_before: colomboToday(-1),
        })
      ).code,
    ).toBe('TRF_007');
    expect(
      (
        await req('thangalla', BRANCH.veyangoda, [
          ['BAR-FL-025', 2],
          ['BAR-FL-025', 1],
        ])
      ).code,
    ).toBe('VAL_001');
    expect(
      (await req('thangalla', BRANCH.veyangoda, [['BAR-FL-025', 0]])).status,
    ).toBe(400);
    const unknown = await tha().post('/stock-transfers', {
      client_request_id: randomUUID(),
      supplying_branch_id: BRANCH.veyangoda,
      needed_before: colomboToday(2),
      lines: [{ item_id: randomUUID(), quantity: 1 }],
    });
    expect([unknown.status, unknown.code]).toEqual([404, 'STK_003']);
  });

  it('TRF-03 creates Waiting with a GI number; idempotent; an item with an open request is refused (TRF_003)', async () => {
    await clearOpenRequests(t, 'thangalla', ['SHT-MS-030']);
    const rid = randomUUID();
    const a = await req('thangalla', BRANCH.veyangoda, [['SHT-MS-030', 1]], {
      client_request_id: rid,
      is_urgent: true,
      notes: 'E2E',
      needed_before: colomboToday(),
    });
    expect([a.status, a.data.display_status]).toEqual([201, 'WAITING']);
    expect(a.data.transfer_number).toMatch(
      new RegExp(`^GI-${colomboToday().slice(0, 4)}-`),
    );
    const b = await req('thangalla', BRANCH.veyangoda, [['SHT-MS-030', 1]], {
      client_request_id: rid,
    });
    expect(b.data.transfer_id).toBe(a.data.transfer_id);
    const dup = await req('thangalla', BRANCH.naiwala, [['SHT-MS-030', 1]]);
    expect([dup.status, dup.code]).toEqual([409, 'TRF_003']);
  });

  it('TRF-04 each side sees its own stock on the lines; a third branch gets 404', async () => {
    const tr = await transfer(t, 'thangalla', 'veyangoda', [['PIP-GI-100', 1]]);
    expect(tr.lines[0].own_stock).toBe(
      await t.stock('thangalla', 'PIP-GI-100'),
    );
    const sup = (await vey().get(`/stock-transfers/${tr.transfer_id}`)).data;
    expect(sup.lines[0].own_stock).toBe(
      await t.stock('veyangoda', 'PIP-GI-100'),
    );
    expect([sup.side, sup.needs_action]).toEqual(['INCOMING', true]);
    const third = await t
      .as(SUP.naiwala)
      .get(`/stock-transfers/${tr.transfer_id}`);
    expect([third.status, third.code]).toEqual([404, 'TRF_001']);
  });

  it('TRF-05 wrong side is refused: requester cannot send, supplier cannot cancel or receive (TRF_010); receive before send TRF_002', async () => {
    const tr = await transfer(t, 'thangalla', 'veyangoda', [['FST-NM-012', 3]]);
    expect(
      (
        await tha().post(
          `/stock-transfers/${tr.transfer_id}/send`,
          sendAll(tr, () => 1),
        )
      ).code,
    ).toBe('TRF_010');
    expect(
      (await vey().post(`/stock-transfers/${tr.transfer_id}/cancel`)).code,
    ).toBe('TRF_010');
    expect(
      (
        await tha().post(
          `/stock-transfers/${tr.transfer_id}/receive`,
          receiveAll(tr, () => 1),
        )
      ).code,
    ).toBe('TRF_002');
  });

  it('TRF-06 send rules: over asked 400 TRF_004, over own stock 409 TRF_004 with available, nothing TRF_005, unknown line TRF_008', async () => {
    const have = await t.stock('veyangoda', 'FST-BM-1250');
    const tr = await transfer(t, 'thangalla', 'veyangoda', [
      ['FST-BM-1250', have + 10],
    ]);
    const over = await vey().post(
      `/stock-transfers/${tr.transfer_id}/send`,
      sendAll(tr, (l) => l.qty_requested + 1),
    );
    expect([over.status, over.code]).toEqual([400, 'TRF_004']);
    const more = await vey().post(
      `/stock-transfers/${tr.transfer_id}/send`,
      sendAll(tr, () => have + 1),
    );
    expect([more.status, more.code, more.details.lines[0].available]).toEqual([
      409,
      'TRF_004',
      have,
    ]);
    expect(
      (
        await vey().post(
          `/stock-transfers/${tr.transfer_id}/send`,
          sendAll(tr, () => 0),
        )
      ).code,
    ).toBe('TRF_005');
    expect(
      (
        await vey().post(`/stock-transfers/${tr.transfer_id}/send`, {
          lines: [{ transfer_line_id: randomUUID(), qty_sent: 1 }],
        })
      ).code,
    ).toBe('TRF_008');
    expect(await t.stock('veyangoda', 'FST-BM-1250')).toBe(have);
  });

  it('TRF-07 send → stock leaves the supplier; receive short with a note → stock arrives, Received', async () => {
    const tr = await transfer(t, 'thangalla', 'veyangoda', [
      ['FST-NM-012', 10],
    ]);
    const vBefore = await t.stock('veyangoda', 'FST-NM-012');
    const sent = await vey().post(
      `/stock-transfers/${tr.transfer_id}/send`,
      sendAll(tr, () => 10),
    );
    expect([sent.status, sent.data.display_status]).toEqual([201, 'SENT']);
    expect(await t.stock('veyangoda', 'FST-NM-012')).toBe(vBefore - 10);
    expect(
      (
        await vey().post(`/stock-transfers/${tr.transfer_id}/reject`, {
          reason: 'Too late now',
        })
      ).code,
    ).toBe('TRF_002');
    expect(
      (await tha().post(`/stock-transfers/${tr.transfer_id}/cancel`)).code,
    ).toBe('TRF_002');
    expect(
      (
        await tha().post(
          `/stock-transfers/${tr.transfer_id}/receive`,
          receiveAll(tr, () => 11),
        )
      ).code,
    ).toBe('TRF_004');
    const tBefore = await t.stock('thangalla', 'FST-NM-012');
    const got = await tha().post(
      `/stock-transfers/${tr.transfer_id}/receive`,
      receiveAll(tr, () => 8, '2 nuts missing'),
    );
    expect([
      got.status,
      got.data.display_status,
      got.data.receive_notes,
    ]).toEqual([201, 'RECEIVED', '2 nuts missing']);
    expect(await t.stock('thangalla', 'FST-NM-012')).toBe(tBefore + 8);
    expect(
      (
        await tha().post(
          `/stock-transfers/${tr.transfer_id}/receive`,
          receiveAll(tr, () => 0),
        )
      ).code,
    ).toBe('TRF_002');
  });

  it('TRF-08 reject needs a real reason; cancel by the requester; neither moves stock', async () => {
    const rj = await transfer(t, 'thangalla', 'naiwala', [['CON-PR-001', 2]]);
    expect(
      (
        await t
          .as(SUP.naiwala)
          .post(`/stock-transfers/${rj.transfer_id}/reject`, { reason: 'no' })
      ).status,
    ).toBe(400);
    const r = await t
      .as(SUP.naiwala)
      .post(`/stock-transfers/${rj.transfer_id}/reject`, {
        reason: 'Need these ourselves',
      });
    expect([r.data.display_status, r.data.reject_reason]).toEqual([
      'REJECTED',
      'Need these ourselves',
    ]);
    expect(
      (await tha().post(`/stock-transfers/${rj.transfer_id}/cancel`)).status,
    ).toBe(409);
    const cn = await transfer(t, 'thangalla', 'veyangoda', [['CON-PR-001', 1]]);
    expect(
      (await tha().post(`/stock-transfers/${cn.transfer_id}/cancel`)).data
        .display_status,
    ).toBe('CANCELLED');
    const moved = await t.sql(
      `SELECT 1 FROM stock_movement m JOIN stock_transfer_line l ON l.transfer_line_id = m.transfer_line_id WHERE l.transfer_id = ANY($1)`,
      [[rj.transfer_id, cn.transfer_id]],
    );
    expect(moved).toHaveLength(0);
  });

  it('TRF-09 header counts and action badges match the lists', async () => {
    const out = (
      await tha().get('/stock-transfers?direction=OUTGOING&open=false')
    ).data;
    const inc = (
      await tha().get('/stock-transfers?direction=INCOMING&open=false')
    ).data;
    expect(out.counts.ours).toBe(out.rows.length);
    expect(out.counts.to_us).toBe(inc.rows.length);
    const openOut = (
      await tha().get('/stock-transfers?direction=OUTGOING&open=true')
    ).data.rows;
    const openIn = (
      await tha().get('/stock-transfers?direction=INCOMING&open=true')
    ).data.rows;
    expect(out.counts.to_receive).toBe(
      openOut.filter((r: any) => r.needs_action).length,
    );
    expect(out.counts.to_send).toBe(
      openIn.filter((r: any) => r.needs_action).length,
    );
    // Rows needing our action come first
    const idx = openOut.findIndex((r: any) => !r.needs_action);
    if (idx >= 0)
      expect(openOut.slice(idx).every((r: any) => !r.needs_action)).toBe(true);
  });

  it('TRF-10 a chief cannot use stock requests (403)', async () => {
    expect(
      (await t.as(CHIEF).get('/stock-transfers?direction=OUTGOING')).status,
    ).toBe(403);
  });
});

describe('LEDGER stock ledger after the flows above', () => {
  it('LEDGER-01 stock = sum of movements, never negative, latest movement = stock, no tied timestamps (G11)', async () => {
    const [r] = await t.sql<{
      drift: number;
      negative: number;
      latest: number;
      ties: number;
    }>(`
      SELECT
        (SELECT count(*)::int FROM branch_stock s
           LEFT JOIN (SELECT branch_id, item_id, sum(quantity) q FROM stock_movement GROUP BY 1, 2) m ON m.branch_id = s.branch_id AND m.item_id = s.item_id
          WHERE s.quantity <> COALESCE(m.q, 0)) AS drift,
        (SELECT count(*)::int FROM branch_stock WHERE quantity < 0) AS negative,
        (SELECT count(*)::int FROM branch_stock s WHERE s.quantity <> (SELECT m.quantity_after FROM stock_movement m
           WHERE m.branch_id = s.branch_id AND m.item_id = s.item_id ORDER BY m.moved_at DESC, m.movement_id DESC LIMIT 1)) AS latest,
        (SELECT count(*)::int FROM (SELECT 1 FROM stock_movement GROUP BY branch_id, item_id, moved_at HAVING count(*) > 1) x) AS ties`);
    expect(r).toEqual({ drift: 0, negative: 0, latest: 0, ties: 0 });
  });
});
