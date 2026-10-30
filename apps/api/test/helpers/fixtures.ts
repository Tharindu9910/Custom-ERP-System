import { randomUUID } from 'node:crypto';
import { MovementType, Role } from '@erp/shared';
import { StockService } from '../../src/core/stock.service';
import { BRANCH, type BranchKey, OVERRIDE_PASSWORD, TestApp } from './app';

/** Data builders that go through the real API as the right role, so every test arranges its own records. */

export const SUP = {
  naiwala: 'supervisor_naiwala',
  veyangoda: 'supervisor_veyangoda',
  thangalla: 'supervisor_thangalla',
} as const;
export const CASHIER = {
  naiwala: 'cashier_naiwala',
  veyangoda: 'cashier_veyangoda',
  thangalla: 'cashier_thangalla',
} as const;
export const CHIEF = 'chief_thangalla';
export { OVERRIDE_PASSWORD };

let phoneSeq = 0;
/** A fresh customer phone per call (last 9 digits must be unique). */
export function newPhone(): string {
  phoneSeq++;
  return `07${String(Date.now()).slice(-6)}${String(phoneSeq).padStart(2, '0')}`.slice(
    0,
    10,
  );
}

export function colomboToday(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(
    d,
  );
}

export async function gatePass(
  t: TestApp,
  user: string = SUP.thangalla,
  over: Record<string, unknown> = {},
) {
  const phone = newPhone();
  const r = await t.as(user).post('/gate-passes', {
    client_request_id: randomUUID(),
    customer: { phone, name: 'E2E Customer' },
    items: [
      {
        material_type: 'MS Plain Sheet',
        thickness: '2',
        length: 8,
        length_unit: 'FT',
        color: 'Blue',
        quantity: 10,
      },
    ],
    ...over,
  });
  if (r.status !== 201)
    throw new Error(`gatePass ${r.status} ${JSON.stringify(r.body)}`);
  return { ...r.data, phone };
}

export async function workerIds(
  t: TestApp,
  user: string,
  n = 1,
): Promise<string[]> {
  const r = await t.as(user).get('/workers?active=true');
  if (r.status !== 200)
    throw new Error(`workers ${r.status} ${JSON.stringify(r.body)}`);
  return r.data.slice(0, n).map((w: any) => w.employee_id);
}

/**
 * A sheet material at a branch with stock available (job-card spelling: material + thickness).
 * `quantity` is what is available: on hand minus what open orders hold (Docs/decisions/0003).
 * Override tests take stock to 0, so when every sheet is low it is topped up through the real
 * StockService (an ADJUSTMENT movement), keeping the ledger and alerts consistent.
 */
export async function material(t: TestApp, branch: BranchKey, minStock = 3) {
  const pick = () =>
    t.sql<{
      item_id: string;
      sku: string;
      material_type: string;
      thickness: string;
      quantity: string;
    }>(
      `SELECT i.item_id, i.sku, i.attributes->>'material_type' AS material_type, i.attributes->>'thickness' AS thickness,
              s.quantity - s.reserved_quantity AS quantity
         FROM item i JOIN branch_stock s ON s.item_id = i.item_id
        WHERE s.branch_id = $1 AND i.item_type = 'MATERIAL' AND i.attributes->>'material_type' = 'MS Plain Sheet'
        ORDER BY s.quantity - s.reserved_quantity DESC, i.sku LIMIT 1`,
      [BRANCH[branch]],
    );
  let [row] = await pick();
  if (!row) throw new Error(`no MS Plain Sheet stocked at ${branch}`);
  if (Number(row.quantity) < minStock) {
    const [sup] = await t.sql<{ user_id: string }>(
      `SELECT user_id FROM "user" WHERE username = $1`,
      [SUP[branch]],
    );
    const actor = {
      user_id: sup.user_id,
      role: Role.SUPERVISOR,
      branch_id: BRANCH[branch],
      username: SUP[branch],
    };
    await t.db.transaction((em) =>
      t.app
        .get(StockService)
        .add(
          em,
          BRANCH[branch],
          { item_id: row.item_id, quantity: minStock + 10 },
          MovementType.ADJUSTMENT,
          actor,
          'E2E top-up',
        ),
    );
    [row] = await pick();
  }
  return { ...row, quantity: Number(row.quantity) };
}

export const ROLLING_LINE = {
  job_type: 'ROLLING',
  rolling_type: 'Pipe Bending',
  work_type: 'GI Pipe',
  size: '1"',
  quantity: 3,
};
/** A customized line (manual Custom on branch material, BR24), so the card needs an advance. */
export const CUSTOM_LINE = {
  job_type: 'CUT_BEND',
  material_source: 'BRANCH',
  custom: true,
  customized_reason_code: 'Special design',
  custom_charges: [
    {
      kind: 'CUT',
      description: 'Cut sheet to design',
      rate: 5000,
      quantity: 4,
    },
  ],
};

/** A line on the customer's own material: one gate pass item (Docs/decisions/0007). */
export function customerLine(gpItemId: string, quantity: number) {
  return {
    job_type: 'CUT_BEND',
    material_source: 'CUSTOMER',
    custom_charges: [
      {
        kind: 'CUT',
        description: 'Cut customer sheet',
        rate: 5000,
        quantity: 4,
      },
    ],
    customer_material: { gp_item_id: gpItemId, quantity },
  };
}

export function jobCardBody(
  phone: string,
  workers: string[],
  lines: unknown[],
  over: Record<string, unknown> = {},
) {
  return {
    client_request_id: randomUUID(),
    customer: { phone, name: 'E2E Job Customer' },
    job_date: colomboToday(),
    worker_ids: workers,
    lines,
    ...over,
  };
}

/**
 * A job card. Lines default to one customized line (so it stays DRAFT awaiting the advance).
 * `paid: true` has the cashier pay the minimum advance so it reaches the Workshop Queue.
 */
export async function jobCard(
  t: TestApp,
  opts: {
    user?: string;
    lines?: unknown[];
    paid?: boolean;
    branch?: BranchKey;
    override?: { password: string; reason: string };
  } = {},
) {
  const branch = opts.branch ?? 'thangalla';
  const user = opts.user ?? SUP[branch];
  const workers = await workerIds(t, user, 1);
  const r = await t
    .as(user)
    .post(
      '/job-cards',
      jobCardBody(
        newPhone(),
        workers,
        opts.lines ?? [CUSTOM_LINE],
        opts.override ? { override: opts.override } : {},
      ),
    );
  if (r.status !== 201)
    throw new Error(`jobCard ${r.status} ${JSON.stringify(r.body)}`);
  return opts.paid ? payAdvance(t, r.data, branch) : r.data;
}

export async function payAdvance(
  t: TestApp,
  order: any,
  branch: BranchKey = 'thangalla',
) {
  const q = await t.as(CASHIER[branch]).get('/cashier-queue');
  const row = q.data.find((x: any) => x.order_id === order.order_id);
  const amount = Math.max(row?.min_advance ?? 0, 100);
  const r = await t
    .as(CASHIER[branch])
    .post(`/orders/${order.order_id}/payments`, {
      client_request_id: randomUUID(),
      amount,
      mode: 'CASH',
    });
  if (r.status !== 201)
    throw new Error(`payAdvance ${r.status} ${JSON.stringify(r.body)}`);
  return r.data;
}

export async function payBalance(
  t: TestApp,
  order: any,
  branch: BranchKey = 'thangalla',
) {
  const r = await t
    .as(CASHIER[branch])
    .post(`/orders/${order.order_id}/payments`, {
      client_request_id: randomUUID(),
      amount: order.balance,
      mode: 'CASH',
    });
  if (r.status !== 201)
    throw new Error(`payBalance ${r.status} ${JSON.stringify(r.body)}`);
  return r.data;
}

export async function richCoil(
  t: TestApp,
  user: string = SUP.thangalla,
  minFt = 1000,
) {
  const r = await t.as(user).get('/items/coils');
  const c = r.data.find((x: any) => x.stock_ft >= minFt);
  if (!c) throw new Error('no coil with stock');
  return c;
}

export function sheetLine(coilId: string, over: Record<string, unknown> = {}) {
  return {
    category: 'Roofing',
    job_type: 'STANDARD',
    material_source: 'BRANCH',
    coil_item_id: coilId,
    pattern: 'Tile Roofing',
    length_ft: 10,
    pieces: 2,
    total_cuts: 1,
    total_bends: 0,
    ...over,
  };
}

/** A placed roofing order paying the minimum (so a balance is due). */
export async function roofingOrder(
  t: TestApp,
  opts: {
    user?: string;
    lines?: unknown[];
    payFull?: boolean;
    override?: { password: string; reason: string };
  } = {},
) {
  const r = await t
    .as(opts.user ?? SUP.thangalla)
    .post('/roofing-orders', await roofingOrderBody(t, opts));
  if (r.status !== 201)
    throw new Error(`roofingOrder ${r.status} ${JSON.stringify(r.body)}`);
  return r.data;
}

/** The body roofingOrder() posts, for tests that need the raw response (e.g. a 409 on placing). */
export async function roofingOrderBody(
  t: TestApp,
  opts: {
    user?: string;
    lines?: unknown[];
    payFull?: boolean;
    override?: { password: string; reason: string };
  } = {},
) {
  const user = opts.user ?? SUP.thangalla;
  const lines = opts.lines ?? [sheetLine((await richCoil(t, user)).item_id)];
  const q = await t.as(user).post('/roofing-orders/quote', { lines });
  if (q.status !== 200)
    throw new Error(`quote ${q.status} ${JSON.stringify(q.body)}`);
  return {
    client_request_id: randomUUID(),
    customer: { phone: newPhone(), name: 'E2E Roof Customer' },
    order_date: colomboToday(),
    technician: 'Sampath',
    material_source: 'BRANCH',
    lines,
    discount: 0,
    payment: {
      amount: opts.payFull ? q.data.total : q.data.min_to_place,
      mode: 'CASH',
    },
    ...(opts.override ? { override: opts.override } : {}),
  };
}

/** Placed → started → completed (Ready). */
export async function readyRoofingOrder(
  t: TestApp,
  opts: { payFull?: boolean } = {},
) {
  const o = await roofingOrder(t, opts);
  const s = await t
    .as(SUP.thangalla)
    .post(`/roofing-orders/${o.order_id}/start`, { version: o.version });
  if (s.status !== 201)
    throw new Error(`start ${s.status} ${JSON.stringify(s.body)}`);
  const c = await t
    .as(SUP.thangalla)
    .post(`/roofing-orders/${o.order_id}/complete`, {
      version: s.data.version,
    });
  if (c.status !== 201)
    throw new Error(`complete ${c.status} ${JSON.stringify(c.body)}`);
  return c.data;
}

/**
 * Closes open requests from a branch for these SKUs (cancel if waiting, receive if sent), so a
 * test can ask for them again even when the database was not reset (E2E_SKIP_RESET=1).
 */
export async function clearOpenRequests(
  t: TestApp,
  from: BranchKey,
  skus: string[],
) {
  const open = await t.sql<{ transfer_id: string; status: string }>(
    `SELECT DISTINCT t.transfer_id, t.status FROM stock_transfer t
       JOIN stock_transfer_line l ON l.transfer_id = t.transfer_id JOIN item i ON i.item_id = l.item_id
      WHERE t.requesting_branch_id = $1 AND t.status IN ('PENDING', 'ISSUED') AND i.sku = ANY($2)`,
    [BRANCH[from], skus],
  );
  for (const o of open) {
    if (o.status === 'PENDING')
      await t.as(SUP[from]).post(`/stock-transfers/${o.transfer_id}/cancel`);
    else {
      const tr = (
        await t.as(SUP[from]).get(`/stock-transfers/${o.transfer_id}`)
      ).data;
      await t.as(SUP[from]).post(
        `/stock-transfers/${o.transfer_id}/receive`,
        receiveAll(tr, (l) => l.qty_sent),
      );
    }
  }
}

/** A stock request from one branch to another for hardware SKUs. */
export async function transfer(
  t: TestApp,
  from: BranchKey,
  to: BranchKey,
  lines: [sku: string, qty: number][],
  over: Record<string, unknown> = {},
) {
  await clearOpenRequests(
    t,
    from,
    lines.map(([sku]) => sku),
  );
  const body = {
    client_request_id: randomUUID(),
    supplying_branch_id: BRANCH[to],
    needed_before: colomboToday(3),
    lines: await Promise.all(
      lines.map(async ([sku, quantity]) => ({
        item_id: await t.itemId(sku),
        quantity,
      })),
    ),
    ...over,
  };
  const r = await t.as(SUP[from]).post('/stock-transfers', body);
  if (r.status !== 201)
    throw new Error(`transfer ${r.status} ${JSON.stringify(r.body)}`);
  return r.data;
}

export const sendAll = (tr: any, qty: (line: any) => number) => ({
  lines: tr.lines.map((l: any) => ({
    transfer_line_id: l.transfer_line_id,
    qty_sent: qty(l),
  })),
});
export const receiveAll = (
  tr: any,
  qty: (line: any) => number,
  notes?: string,
) => ({
  lines: tr.lines.map((l: any) => ({
    transfer_line_id: l.transfer_line_id,
    qty_received: qty(l),
  })),
  ...(notes ? { notes } : {}),
});

/** A new active employee with no login (chief-profile candidate). Inserted directly: no supervisor screen adds employees. */
export async function employee(
  t: TestApp,
  branch: BranchKey,
  name = `E2E Employee ${Date.now()}${++phoneSeq}`,
) {
  const rows = await t.sql<{ employee_id: string; full_name: string }>(
    `INSERT INTO employee (branch_id, full_name, designation) VALUES ($1, $2, 'WORKSHOP CHIEF') RETURNING employee_id, full_name`,
    [BRANCH[branch], name],
  );
  return rows[0];
}
