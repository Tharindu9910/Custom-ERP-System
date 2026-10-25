import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });

/**
 * One-off, after deploying migration StockReservation1761200000000 (Docs/decisions/0003):
 * open orders created before reservations existed hold nothing. This holds their
 * branch material, oldest order first, from what each branch has free. Whatever
 * can't be held is recorded as an authorised shortfall, so starting those orders
 * behaves exactly as it did before (stock taken down to zero, OVERRIDE movement).
 *
 *   pnpm --filter api backfill:reservations           dry run — prints what it would do
 *   pnpm --filter api backfill:reservations --apply   writes it (one transaction)
 *
 * Safe to run again: lines that already have a reservation are skipped.
 */

const APPLY = process.argv.includes('--apply');
const SHORT_REASON = 'backfill: stock already short when reservations were introduced';
const round3 = (n: number) => Math.round(n * 1000) / 1000;

interface OpenLine {
  branch_id: string;
  branch_name: string;
  order_id: string;
  order_number: string;
  line_id: string;
  line_number: string;
  item_id: string;
  item_name: string;
  quantity: string;
  created_by: string;
}

async function main(): Promise<void> {
  const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL });
  await ds.initialize();
  try {
    await ds.transaction(async (em) => {
      // Same rule as the order services: unstarted branch-material lines on open orders
      const lines: OpenLine[] = await em.query(`
        SELECT o.branch_id, b.name AS branch_name, o.order_id, o.order_number, l.line_id, l.line_number,
               l.item_id, i.name AS item_name, l.quantity, o.created_by
        FROM order_line l
        JOIN "order" o ON o.order_id = l.order_id
        JOIN branch b ON b.branch_id = o.branch_id
        JOIN item i ON i.item_id = l.item_id
        WHERE o.status IN ('DRAFT', 'IN_QUEUE', 'IN_PROGRESS') AND l.status IN ('PENDING', 'ASSIGNED')
          AND l.material_source = 'BRANCH' AND l.item_id IS NOT NULL AND l.quantity > 0
          AND NOT EXISTS (SELECT 1 FROM stock_reservation r WHERE r.line_id = l.line_id AND r.status = 'RESERVED')
        ORDER BY o.created_at, l.line_no`);
      if (lines.length === 0) {
        console.log('Nothing to backfill: every open branch-material line already has a reservation.');
        return;
      }

      const stock: { branch_id: string; item_id: string; quantity: string; reserved_quantity: string }[] = await em.query(
        `SELECT branch_id, item_id, quantity, reserved_quantity FROM branch_stock
         WHERE (branch_id, item_id) IN (SELECT DISTINCT o.branch_id, l.item_id FROM order_line l JOIN "order" o ON o.order_id = l.order_id
                                        WHERE l.line_id = ANY($1::uuid[]))
         ORDER BY branch_id, item_id FOR UPDATE`,
        [lines.map((l) => l.line_id)],
      );
      const key = (b: string, i: string) => `${b}:${i}`;
      const free = new Map(stock.map((s) => [key(s.branch_id, s.item_id), round3(Number(s.quantity) - Number(s.reserved_quantity))]));
      const added = new Map<string, number>();
      const summary = new Map<string, { lines: number; short: number }>();

      for (const l of lines) {
        const k = key(l.branch_id, l.item_id);
        const qty = Number(l.quantity);
        const hold = Math.min(free.get(k) ?? 0, qty);
        const shortfall = round3(qty - hold);
        free.set(k, round3((free.get(k) ?? 0) - hold));
        added.set(k, round3((added.get(k) ?? 0) + hold));
        const s = summary.get(l.branch_name) ?? { lines: 0, short: 0 };
        s.lines++;
        if (shortfall > 0) s.short++;
        summary.set(l.branch_name, s);
        console.log(
          `${l.branch_name}  ${l.order_number} ${l.line_number}  ${l.item_name}: hold ${hold}${shortfall > 0 ? `, short ${shortfall}` : ''}`,
        );
        if (APPLY) {
          await em.query(
            `INSERT INTO stock_reservation (branch_id, item_id, order_id, line_id, quantity, shortfall, override_reason, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [l.branch_id, l.item_id, l.order_id, l.line_id, hold, shortfall, shortfall > 0 ? SHORT_REASON : null, l.created_by],
          );
        }
      }
      if (APPLY) {
        for (const [k, qty] of [...added].sort(([a], [b]) => a.localeCompare(b))) {
          const [branchId, itemId] = k.split(':');
          if (qty > 0) {
            await em.query(`UPDATE branch_stock SET reserved_quantity = reserved_quantity + $3 WHERE branch_id = $1 AND item_id = $2`, [
              branchId,
              itemId,
              qty,
            ]);
          }
        }
      }

      console.log('');
      for (const [branch, s] of summary) console.log(`${branch}: ${s.lines} line(s), ${s.short} short`);
      console.log(APPLY ? '\nApplied.' : '\nDry run — nothing written. Run again with --apply to write it.');
    });
  } finally {
    await ds.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
