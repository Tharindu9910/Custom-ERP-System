import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { API, databaseUrl } from './env';

/** Arranges data for browser tests through the real API (and reads state from the DB). */

export const BRANCH = {
  naiwala: '00000000-0000-0000-0000-000000000001', // ROOFING, main
  veyangoda: '00000000-0000-0000-0000-000000000002', // WORKSHOP, no override
  thangalla: '00000000-0000-0000-0000-000000000003', // ROOFING_WORKSHOP, override Override@123
} as const;
export type BranchKey = keyof typeof BRANCH;
export const BRANCH_NAME: Record<BranchKey, string> = { naiwala: 'Naiwala', veyangoda: 'Veyangoda', thangalla: 'Thangalla' };

export const SUP = { naiwala: 'supervisor_naiwala', veyangoda: 'supervisor_veyangoda', thangalla: 'supervisor_thangalla' } as const;
export const CASHIER = { naiwala: 'cashier_naiwala', veyangoda: 'cashier_veyangoda', thangalla: 'cashier_thangalla' } as const;
export const SA = 'superadmin';
export const OVERRIDE_PASSWORD = 'Override@123';
export const PASSWORDS: Record<string, string> = { superadmin: 'Super@123', admin: 'Admin@123', auditor1: 'Auditor@123' };
export const passwordFor = (u: string) => PASSWORDS[u] ?? 'Dev@1234';

export interface Res<T = any> {
  status: number;
  data: T;
  code?: string;
  body: any;
}

export async function login(username: string, password = passwordFor(username)) {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const body = await r.json();
  if (!r.ok) throw new Error(`login ${username}: ${r.status} ${JSON.stringify(body)}`);
  return body.data as { accessToken: string; refreshToken: string; user: any };
}

const tokens = new Map<string, string>();

export async function call<T = any>(user: string, method: string, url: string, body?: unknown, branch?: BranchKey): Promise<Res<T>> {
  let token = tokens.get(user);
  if (!token) {
    token = (await login(user)).accessToken;
    tokens.set(user, token);
  }
  const headers: Record<string, string> = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  if (branch) headers['x-branch-id'] = BRANCH[branch];
  const r = await fetch(`${API}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.status === 401 && tokens.has(user)) {
    tokens.delete(user);
    return call(user, method, url, body, branch);
  }
  const json = await r.json().catch(() => ({}));
  return { status: r.status, data: json.data, code: json.error?.code, body: json };
}

async function ok<T = any>(p: Promise<Res<T>>, what: string): Promise<T> {
  const r = await p;
  if (r.status >= 300) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.data;
}

let pool: pg.Pool | undefined;
export async function sql<T = any>(query: string, params: unknown[] = []): Promise<T[]> {
  pool ??= new pg.Pool({ connectionString: databaseUrl(), max: 2 });
  return (await pool.query(query, params)).rows as T[];
}

export async function stock(branch: BranchKey, sku: string): Promise<number> {
  const rows = await sql(`SELECT s.quantity FROM branch_stock s JOIN item i ON i.item_id = s.item_id WHERE s.branch_id = $1 AND i.sku = $2`, [BRANCH[branch], sku]);
  return rows.length ? Number(rows[0].quantity) : 0;
}

/** Held for open orders (Docs/decisions/0003). */
export async function reserved(branch: BranchKey, sku: string): Promise<number> {
  const rows = await sql(`SELECT s.reserved_quantity FROM branch_stock s JOIN item i ON i.item_id = s.item_id WHERE s.branch_id = $1 AND i.sku = $2`, [BRANCH[branch], sku]);
  return rows.length ? Number(rows[0].reserved_quantity) : 0;
}
export async function itemId(sku: string): Promise<string> {
  return (await sql(`SELECT item_id FROM item WHERE sku = $1`, [sku]))[0].item_id;
}

let seq = 0;
export function newPhone(): string {
  seq++;
  return `07${String(Date.now()).slice(-6)}${String(seq % 100).padStart(2, '0')}`;
}
export function colomboToday(offsetDays = 0): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date(Date.now() + offsetDays * 86_400_000));
}

// ── Builders ─────────────────────────────────────────────────────────────

export async function gatePass(user: string = SUP.thangalla, items?: unknown[], name = `GP Customer ${seq + 1}`) {
  const phone = newPhone();
  const gp = await ok(
    call(user, 'POST', '/gate-passes', {
      client_request_id: randomUUID(),
      customer: { phone, name },
      items: items ?? [{ material_type: 'MS Plain Sheet', thickness: '2mm', length: 8, length_unit: 'FT', quantity: 10 }],
    }),
    'gatePass',
  );
  return { ...gp, phone, name };
}

export const ROLLING_LINE = { job_type: 'ROLLING', rolling_type: 'Pipe Bending', work_type: 'GI Pipe', size: '1"', quantity: 3 };
export const CUSTOM_LINE = { job_type: 'CUT_BEND', material_source: 'CUSTOMER', custom_charges: [{ kind: 'CUT', description: 'Cut customer sheet', rate: 5000, quantity: 4 }] };

export async function workerIds(user: string, n = 1): Promise<string[]> {
  return (await ok(call(user, 'GET', '/workers?active=true'), 'workers')).slice(0, n).map((w: any) => w.employee_id);
}

/**
 * A sheet material at a branch with stock on hand. Override tests take stock to 0, so when every
 * sheet is low it is topped up with an ADJUSTMENT movement written the way StockService writes
 * one (stock row, movement with quantity_after, alert resolved), keeping the ledger consistent.
 */
export async function material(branch: BranchKey, minStock = 3) {
  const pick = async () =>
    (
      await sql(
        // quantity = available: on hand minus what open orders hold (Docs/decisions/0003)
        `SELECT i.item_id, i.sku, i.name, i.attributes->>'material_type' AS material_type, i.attributes->>'thickness' AS thickness,
                s.quantity - s.reserved_quantity AS quantity
           FROM item i JOIN branch_stock s ON s.item_id = i.item_id
          WHERE s.branch_id = $1 AND i.item_type = 'MATERIAL' AND i.attributes->>'material_type' = 'MS Plain Sheet'
          ORDER BY s.quantity - s.reserved_quantity DESC, i.sku LIMIT 1`,
        [BRANCH[branch]],
      )
    )[0];
  let row = await pick();
  if (Number(row.quantity) < minStock) {
    pool ??= new pg.Pool({ connectionString: databaseUrl(), max: 2 });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const add = minStock + 10;
      const { rows } = await client.query(
        `UPDATE branch_stock SET quantity = quantity + $3 WHERE branch_id = $1 AND item_id = $2 RETURNING quantity, reorder_level`,
        [BRANCH[branch], row.item_id, add],
      );
      await client.query(
        `INSERT INTO stock_movement (branch_id, item_id, movement_type, quantity, quantity_after, reason, created_by, moved_at)
         SELECT $1, $2, 'ADJUSTMENT', $3, $4, 'E2E top-up', user_id, clock_timestamp() AT TIME ZONE current_setting('TimeZone') FROM "user" WHERE username = $5`,
        [BRANCH[branch], row.item_id, add, rows[0].quantity, SUP[branch]],
      );
      if (Number(rows[0].quantity) > Number(rows[0].reorder_level)) {
        await client.query(`UPDATE stock_alert SET status = 'RESOLVED' WHERE branch_id = $1 AND item_id = $2 AND status <> 'RESOLVED'`, [BRANCH[branch], row.item_id]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    row = await pick();
  }
  return { ...row, quantity: Number(row.quantity) } as { item_id: string; sku: string; name: string; material_type: string; thickness: string; quantity: number };
}

export async function jobCard(opts: { branch?: BranchKey; lines?: unknown[]; paid?: boolean; name?: string } = {}) {
  const branch = opts.branch ?? 'thangalla';
  const user = SUP[branch];
  const card = await ok(
    call(user, 'POST', '/job-cards', {
      client_request_id: randomUUID(),
      customer: { phone: newPhone(), name: opts.name ?? `JC Customer ${seq + 1}` },
      job_date: colomboToday(),
      worker_ids: await workerIds(user),
      material_source: 'BRANCH',
      lines: opts.lines ?? [CUSTOM_LINE],
    }),
    'jobCard',
  );
  return opts.paid ? payAdvance(card, branch) : card;
}

export async function payAdvance(order: any, branch: BranchKey = 'thangalla') {
  const q = await ok(call(CASHIER[branch], 'GET', '/cashier-queue'), 'cashier-queue');
  const row = q.find((x: any) => x.order_id === order.order_id);
  return ok(call(CASHIER[branch], 'POST', `/orders/${order.order_id}/payments`, { client_request_id: randomUUID(), amount: Math.max(row?.min_advance ?? 0, 100), mode: 'CASH' }), 'payAdvance');
}

export async function payBalance(order: any, branch: BranchKey = 'thangalla') {
  return ok(call(CASHIER[branch], 'POST', `/orders/${order.order_id}/payments`, { client_request_id: randomUUID(), amount: order.balance, mode: 'CASH' }), 'payBalance');
}

export async function coil(minFt = 1000, user: string = SUP.thangalla) {
  const coils = await ok(call(user, 'GET', '/items/coils'), 'coils');
  return coils.find((c: any) => c.stock_ft >= minFt);
}

export function sheetLine(coilId: string, over: Record<string, unknown> = {}) {
  return { category: 'Roofing', job_type: 'STANDARD', material_source: 'BRANCH', coil_item_id: coilId, pattern: 'Tile Roofing', length_ft: 10, pieces: 2, total_cuts: 1, total_bends: 0, ...over };
}

export async function roofingOrder(opts: { lines?: unknown[]; payFull?: boolean; name?: string } = {}) {
  const user = SUP.thangalla;
  const lines = opts.lines ?? [sheetLine((await coil()).item_id)];
  const q = await ok(call(user, 'POST', '/roofing-orders/quote', { lines }), 'quote');
  return ok(
    call(user, 'POST', '/roofing-orders', {
      client_request_id: randomUUID(),
      customer: { phone: newPhone(), name: opts.name ?? `Roof Customer ${seq + 1}` },
      order_date: colomboToday(),
      technician: 'Sampath',
      material_source: 'BRANCH',
      lines,
      discount: 0,
      payment: { amount: opts.payFull ? q.total : q.min_to_place, mode: 'CASH' },
    }),
    'roofingOrder',
  );
}

export async function readyRoofingOrder(opts: { payFull?: boolean; name?: string } = {}) {
  const o = await roofingOrder(opts);
  const s = await ok(call(SUP.thangalla, 'POST', `/roofing-orders/${o.order_id}/start`, { version: o.version }), 'start');
  return ok(call(SUP.thangalla, 'POST', `/roofing-orders/${o.order_id}/complete`, { version: s.version }), 'complete');
}

export const receiveAll = (tr: any, qty: (l: any) => number) => ({ lines: tr.lines.map((l: any) => ({ transfer_line_id: l.transfer_line_id, qty_received: qty(l) })) });
export const sendAll = (tr: any, qty: (l: any) => number) => ({ lines: tr.lines.map((l: any) => ({ transfer_line_id: l.transfer_line_id, qty_sent: qty(l) })) });

/** Closes open requests from a branch for these SKUs so they can be asked for again. */
export async function clearOpenRequests(from: BranchKey, skus: string[]) {
  const open = await sql(
    `SELECT DISTINCT t.transfer_id, t.status FROM stock_transfer t JOIN stock_transfer_line l ON l.transfer_id = t.transfer_id JOIN item i ON i.item_id = l.item_id
      WHERE t.requesting_branch_id = $1 AND t.status IN ('PENDING', 'ISSUED') AND i.sku = ANY($2)`,
    [BRANCH[from], skus],
  );
  for (const o of open) {
    if (o.status === 'PENDING') await call(SUP[from], 'POST', `/stock-transfers/${o.transfer_id}/cancel`);
    else {
      const tr = (await call(SUP[from], 'GET', `/stock-transfers/${o.transfer_id}`)).data;
      await call(SUP[from], 'POST', `/stock-transfers/${o.transfer_id}/receive`, receiveAll(tr, (l) => l.qty_sent));
    }
  }
}

export async function transfer(from: BranchKey, to: BranchKey, lines: [sku: string, qty: number][], over: Record<string, unknown> = {}) {
  await clearOpenRequests(from, lines.map(([s]) => s));
  return ok(
    call(SUP[from], 'POST', '/stock-transfers', {
      client_request_id: randomUUID(),
      supplying_branch_id: BRANCH[to],
      needed_before: colomboToday(3),
      lines: await Promise.all(lines.map(async ([sku, quantity]) => ({ item_id: await itemId(sku), quantity }))),
      ...over,
    }),
    'transfer',
  );
}

export async function employee(branch: BranchKey, name = `E2E Employee ${Date.now() % 100000}`) {
  return (await sql(`INSERT INTO employee (branch_id, full_name, designation) VALUES ($1, $2, 'WORKSHOP CHIEF') RETURNING employee_id, full_name`, [BRANCH[branch], name]))[0] as {
    employee_id: string;
    full_name: string;
  };
}

export async function setFeature(branch: BranchKey, feature: string, on: boolean) {
  return ok(call(SA, 'PATCH', `/branches/${BRANCH[branch]}/config`, { features: { [feature]: on } }), 'setFeature');
}
