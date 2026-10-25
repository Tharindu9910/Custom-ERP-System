import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });

/**
 * Value check for the supervisor screens (plan §Verification 5). Against a
 * running API, every KPI and tab count must equal the length of the list it
 * opens; in the database, stock must equal the sum of its movements, never be
 * negative, and have exactly one open alert while low; reserved stock must equal
 * what open orders hold (Docs/decisions/0003).
 *
 *   pnpm check:numbers            (API on API_URL or http://localhost:$API_PORT)
 *
 * Logs in once per branch supervisor (the auth limit is 10 logins a minute).
 */

const API = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 3000}`;
const PASSWORD = process.env.CHECK_PASSWORD ?? 'Dev@1234';
const USERS = (process.env.CHECK_USERS ?? 'supervisor_thangalla,supervisor_veyangoda,supervisor_naiwala').split(',');

const failures: string[] = [];
let passed = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else failures.push(`${name}${detail ? `  [${detail}]` : ''}`);
}

async function api<T>(token: string, url: string): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API}${url}`, { headers: { authorization: `Bearer ${token}` } });
  const body = (await res.json()) as { data: T };
  return { status: res.status, data: body.data };
}

async function login(username: string): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed for ${username}: ${res.status}`);
  return ((await res.json()) as { data: { accessToken: string } }).data.accessToken;
}

/** count === rows.length for each tab; skipped quietly when the screen is off for the branch. */
async function tabs<C extends Record<string, number>>(
  who: string,
  screen: string,
  token: string,
  url: (tab: string) => string,
  pairs: [countKey: keyof C & string, tab: string][],
): Promise<C | null> {
  for (const [key, tab] of pairs) {
    const r = await api<{ rows: unknown[]; counts: C; has_more?: boolean }>(token, url(tab));
    if (r.status === 403) return null;
    if (r.status !== 200) {
      check(`${who} ${screen} loads`, false, `HTTP ${r.status}`);
      return null;
    }
    // Capped history lists only promise the latest rows
    if (r.data.has_more) check(`${who} ${screen} ${tab} has at least ${key}`, r.data.counts[key] >= r.data.rows.length);
    else check(`${who} ${screen} ${key} = rows in ${tab}`, r.data.counts[key] === r.data.rows.length, `${r.data.counts[key]} vs ${r.data.rows.length}`);
  }
  return (await api<{ counts: C }>(token, url(pairs[0][1]))).data.counts;
}

async function screens(username: string): Promise<void> {
  const token = await login(username);
  const who = username;

  const gp = await tabs<{ total: number; available: number }>(who, 'Gate Pass', token, (s) => `/gate-passes?status=${s}`, [
    ['total', 'ALL'],
    ['available', 'AVAILABLE'],
  ]);
  if (gp) check(`${who} Gate Pass available ≤ total`, gp.available <= gp.total);

  const wq = await tabs<{ total: number; awaiting_payment: number; pending: number; in_progress: number; completed: number }>(
    who,
    'Workshop Queue',
    token,
    (s) => `/workshop-queue?status=${s}`,
    [
      ['total', 'ALL'],
      ['awaiting_payment', 'AWAITING_PAYMENT'],
      ['pending', 'PENDING'],
      ['in_progress', 'IN_PROGRESS'],
      ['completed', 'COMPLETED'],
    ],
  );
  if (wq) check(`${who} Workshop Queue total = pending + in progress + completed`, wq.total === wq.pending + wq.in_progress + wq.completed);

  const rq = await tabs<{ active: number; placed: number; in_progress: number; ready: number; released: number; cancelled: number; all: number }>(
    who,
    'Order Queue',
    token,
    (t) => `/roofing-queue?tab=${t}`,
    [
      ['active', 'ACTIVE'],
      ['placed', 'PLACED'],
      ['in_progress', 'IN_PROGRESS'],
      ['ready', 'READY'],
      ['released', 'RELEASED'],
      ['cancelled', 'CANCELLED'],
      ['all', 'ALL'],
    ],
  );
  if (rq) {
    check(`${who} Order Queue active = placed + in progress + ready`, rq.active === rq.placed + rq.in_progress + rq.ready);
    check(`${who} Order Queue all = active + released + cancelled`, rq.all === rq.active + rq.released + rq.cancelled);
  }

  const inv = await tabs<{ all: number; healthy: number; low: number; out: number }>(who, 'Inventory', token, (s) => `/inventory?status=${s}`, [
    ['all', 'ALL'],
    ['healthy', 'HEALTHY'],
    ['low', 'LOW'],
    ['out', 'OUT'],
  ]);
  if (inv) check(`${who} Inventory all = healthy + low + out`, inv.all === inv.healthy + inv.low + inv.out);
  const stockRows = await api<{ rows: { name: string; stock: number; reserved: number; available: number }[] }>(token, '/inventory?status=ALL');
  if (stockRows.status === 200) {
    const off = stockRows.data.rows.filter((r) => Math.round((r.stock - r.reserved) * 1000) !== Math.round(r.available * 1000) || r.reserved < 0 || r.available < 0);
    check(`${who} Inventory available = on hand − reserved, never negative`, off.length === 0, off.map((r) => r.name).join(', '));
  }

  const alerts = await tabs<{ needs_restock: number; critical: number; low: number; healthy: number }>(
    who,
    'Stock Alerts',
    token,
    (f) => `/stock-alerts?filter=${f}`,
    [
      ['needs_restock', 'NEEDS_RESTOCK'],
      ['critical', 'CRITICAL'],
      ['low', 'LOW'],
    ],
  );
  if (alerts && inv) {
    check(`${who} Stock Alerts critical = Inventory out`, alerts.critical === inv.out);
    check(`${who} Stock Alerts low = Inventory low`, alerts.low === inv.low);
    check(`${who} Stock Alerts healthy = Inventory healthy`, alerts.healthy === inv.healthy);
  }

  // Stock Requests: header totals and action badges against the full lists
  type T = { rows: { needs_action: boolean; display_status: string }[]; counts: Record<'to_us' | 'ours' | 'to_send' | 'to_receive', number>; has_more: boolean };
  const incoming = await api<T>(token, '/stock-transfers?direction=INCOMING&open=false');
  if (incoming.status === 200) {
    const outgoing = await api<T>(token, '/stock-transfers?direction=OUTGOING&open=false');
    const c = incoming.data.counts;
    if (!incoming.data.has_more) check(`${who} Stock Requests to_us = rows`, c.to_us === incoming.data.rows.length, `${c.to_us} vs ${incoming.data.rows.length}`);
    if (!outgoing.data.has_more) check(`${who} Stock Requests ours = rows`, c.ours === outgoing.data.rows.length, `${c.ours} vs ${outgoing.data.rows.length}`);
    const toSend = (await api<T>(token, '/stock-transfers?direction=INCOMING&open=true')).data.rows.filter((r) => r.needs_action).length;
    const toReceive = (await api<T>(token, '/stock-transfers?direction=OUTGOING&open=true')).data.rows.filter((r) => r.needs_action).length;
    check(`${who} Stock Requests to_send = waiting rows`, c.to_send === toSend, `${c.to_send} vs ${toSend}`);
    check(`${who} Stock Requests to_receive = sent rows`, c.to_receive === toReceive, `${c.to_receive} vs ${toReceive}`);
  }
}

async function database(): Promise<void> {
  const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL });
  await ds.initialize();
  try {
    const drift: { n: number }[] = await ds.query(`
      SELECT count(*)::int AS n FROM branch_stock s
      LEFT JOIN (SELECT branch_id, item_id, sum(quantity) AS total FROM stock_movement GROUP BY 1, 2) m
        ON m.branch_id = s.branch_id AND m.item_id = s.item_id
      WHERE s.quantity <> COALESCE(m.total, 0)`);
    check('Stock = sum of movements for every branch item', drift[0].n === 0, `${drift[0].n} rows differ`);

    const orphan: { n: number }[] = await ds.query(`
      SELECT count(*)::int AS n FROM (SELECT DISTINCT branch_id, item_id FROM stock_movement) m
      LEFT JOIN branch_stock s ON s.branch_id = m.branch_id AND s.item_id = m.item_id WHERE s.item_id IS NULL`);
    check('Every movement belongs to a stock row', orphan[0].n === 0, `${orphan[0].n} missing`);

    const negative: { n: number }[] = await ds.query(`SELECT count(*)::int AS n FROM branch_stock WHERE quantity < 0`);
    check('No negative stock', negative[0].n === 0);

    const after: { n: number }[] = await ds.query(`
      SELECT count(*)::int AS n FROM branch_stock s
      WHERE s.quantity <> (SELECT m.quantity_after FROM stock_movement m
                           WHERE m.branch_id = s.branch_id AND m.item_id = s.item_id
                           ORDER BY m.moved_at DESC, m.movement_id DESC LIMIT 1)`);
    check('Latest movement quantity_after = stock', after[0].n === 0, `${after[0].n} rows differ`);

    // Same rule as the shared stockLevel(): low = at or below the reorder level
    const alerts: { missing: number; stale: number }[] = await ds.query(`
      SELECT count(*) FILTER (WHERE s.quantity <= s.reorder_level AND a.alert_id IS NULL)::int AS missing,
             count(*) FILTER (WHERE s.quantity > s.reorder_level AND a.alert_id IS NOT NULL)::int AS stale
      FROM branch_stock s
      LEFT JOIN stock_alert a ON a.branch_id = s.branch_id AND a.item_id = s.item_id AND a.status <> 'RESOLVED'`);
    check('Every low or out item has an open alert', alerts[0].missing === 0, `${alerts[0].missing} missing`);
    check('No open alert on a healthy item', alerts[0].stale === 0, `${alerts[0].stale} stale`);

    const transfers: { n: number }[] = await ds.query(`
      SELECT count(*)::int AS n FROM stock_transfer_line l JOIN stock_transfer t ON t.transfer_id = l.transfer_id
      WHERE (t.status IN ('ISSUED', 'CONFIRMED') AND (l.qty_sent IS NULL OR l.qty_sent > l.qty_requested))
         OR (t.status = 'CONFIRMED' AND (l.qty_received IS NULL OR l.qty_received > l.qty_sent))
         OR (t.status IN ('PENDING', 'REJECTED', 'CANCELLED') AND (l.qty_sent IS NOT NULL OR l.qty_received IS NOT NULL))`);
    check('Stock request quantities match their status (sent ≤ asked, received ≤ sent)', transfers[0].n === 0, `${transfers[0].n} lines`);

    const moved: { n: number }[] = await ds.query(`
      SELECT count(*)::int AS n FROM stock_transfer_line l
      WHERE COALESCE(l.qty_sent, 0) <> -COALESCE((SELECT sum(quantity) FROM stock_movement WHERE transfer_line_id = l.transfer_line_id AND quantity < 0), 0)
         OR COALESCE(l.qty_received, 0) <> COALESCE((SELECT sum(quantity) FROM stock_movement WHERE transfer_line_id = l.transfer_line_id AND quantity > 0), 0)`);
    check('Stock request lines match their stock movements', moved[0].n === 0, `${moved[0].n} lines`);

    const held: { n: number }[] = await ds.query(`
      SELECT count(*)::int AS n FROM branch_stock s
      LEFT JOIN (SELECT branch_id, item_id, sum(quantity) AS total FROM stock_reservation WHERE status = 'RESERVED' GROUP BY 1, 2) r
        ON r.branch_id = s.branch_id AND r.item_id = s.item_id
      WHERE s.reserved_quantity <> COALESCE(r.total, 0)`);
    check('Reserved stock = sum of open reservations for every branch item', held[0].n === 0, `${held[0].n} rows differ`);

    const overHeld: { n: number }[] = await ds.query(`SELECT count(*)::int AS n FROM branch_stock WHERE reserved_quantity < 0 OR reserved_quantity > quantity`);
    check('Reserved stock is between 0 and on hand', overHeld[0].n === 0);

    const stale: { n: number }[] = await ds.query(`
      SELECT count(*)::int AS n FROM stock_reservation r
      JOIN "order" o ON o.order_id = r.order_id JOIN order_line l ON l.line_id = r.line_id
      WHERE r.status = 'RESERVED' AND (o.status IN ('VOIDED', 'CLOSED') OR l.status NOT IN ('PENDING', 'ASSIGNED'))`);
    check('No reservation on a closed/voided order or a started/cancelled line', stale[0].n === 0, `${stale[0].n} stale`);

    const unheld: { n: number }[] = await ds.query(`
      SELECT count(*)::int AS n FROM order_line l JOIN "order" o ON o.order_id = l.order_id
      WHERE o.status IN ('DRAFT', 'IN_QUEUE', 'IN_PROGRESS') AND l.status IN ('PENDING', 'ASSIGNED')
        AND l.material_source = 'BRANCH' AND l.item_id IS NOT NULL AND l.quantity > 0
        AND NOT EXISTS (SELECT 1 FROM stock_reservation r WHERE r.line_id = l.line_id AND r.status = 'RESERVED')`);
    check('Every unstarted branch-material line has a reservation', unheld[0].n === 0, `${unheld[0].n} lines without one`);
  } finally {
    await ds.destroy();
  }
}

async function main(): Promise<void> {
  for (const u of USERS) await screens(u);
  await database();
  console.log(`\n${passed} checks passed, ${failures.length} failed`);
  failures.forEach((f) => console.log(`  FAIL ${f}`));
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
