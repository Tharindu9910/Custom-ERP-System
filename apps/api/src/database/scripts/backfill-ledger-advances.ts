import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

dotenv.config({ path: path.resolve(__dirname, '../../../../../.env') });

/**
 * One-off, after the FINAL-payment ledger fix: final payments booked before the fix
 * recognised only their own amount as revenue and left the order's earlier advances
 * in 2100 (Advance Payments Received) for good. For each such final payment this adds
 * the missing pair — Dr 2100 / Cr revenue (4000 service, 4100 hardware) — for what the
 * order still holds in 2100, dated at the final payment.
 *
 *   pnpm --filter api backfill:ledger           dry run — prints what it would do
 *   pnpm --filter api backfill:ledger --apply   writes it (one transaction)
 *
 * Safe to run again: final payments that already have the clearing entry are skipped.
 * Other entries (cancellations, stock) are not touched.
 */

const APPLY = process.argv.includes('--apply');
const CLEARED = 'Advances cleared on final payment';
const rs = (cents: number) => `Rs ${(cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;

interface FinalPayment {
  payment_id: string;
  order_id: string;
  order_number: string;
  order_type: string;
  received_branch_id: string;
  received_by: string;
  paid_at: Date;
  held: string;
}

async function main() {
  const ds = new DataSource({ type: 'postgres', url: process.env.DATABASE_URL });
  await ds.initialize();
  try {
    await ds.transaction(async (em) => {
      const accounts: { code: string; account_id: string }[] = await em.query(
        `SELECT code, account_id FROM financial_account WHERE code IN ('2100', '4000', '4100')`,
      );
      const id = Object.fromEntries(accounts.map((a) => [a.code, a.account_id]));
      if (!id['2100'] || !id['4000'] || !id['4100']) throw new Error('Accounts 2100, 4000 and 4100 must exist — run the seed first');

      // Completed final payments with no clearing entry yet, and what their order still holds in 2100
      const rows: FinalPayment[] = await em.query(
        `SELECT p.payment_id, p.order_id, o.order_number, o.order_type, p.received_branch_id, p.received_by, p.paid_at,
                COALESCE((
                  SELECT SUM(CASE WHEN e.entry_type = 'CREDIT' THEN e.amount ELSE -e.amount END)
                  FROM ledger_entry e WHERE e.order_id = p.order_id AND e.account_id = $1
                ), 0) AS held
         FROM payment p JOIN "order" o ON o.order_id = p.order_id
         WHERE p.kind = 'FINAL' AND p.status = 'COMPLETED'
           AND NOT EXISTS (SELECT 1 FROM ledger_entry e WHERE e.source_id = p.payment_id AND e.description = $2)
         ORDER BY p.paid_at
         FOR UPDATE OF p`,
        [id['2100'], CLEARED],
      );

      let orders = 0;
      let total = 0;
      for (const r of rows) {
        const held = Number(r.held);
        if (held <= 0) continue;
        const revenue = r.order_type === 'HARDWARE_SALE' ? id['4100'] : id['4000'];
        const label = r.order_type === 'HARDWARE_SALE' ? 'Hardware sale revenue recognised' : 'Service revenue recognised';
        console.log(`${r.order_number}: clear ${rs(held)} from 2100 into ${r.order_type === 'HARDWARE_SALE' ? '4100' : '4000'}`);
        orders++;
        total += held;
        if (APPLY) {
          await em.query(
            `INSERT INTO ledger_entry (branch_id, account_id, entry_type, amount, source_type, source_id, order_id, description, created_by, created_at)
             VALUES ($1, $2, 'DEBIT', $3, 'PAYMENT', $4, $5, $6, $7, $8),
                    ($1, $9, 'CREDIT', $3, 'PAYMENT', $4, $5, $10, $7, $8)`,
            [r.received_branch_id, id['2100'], held, r.payment_id, r.order_id, CLEARED, r.received_by, r.paid_at, revenue, label],
          );
        }
      }

      // Every source must balance: debits = credits
      const unbalanced: { source_id: string }[] = await em.query(
        `SELECT source_id FROM ledger_entry WHERE source_type = 'PAYMENT'
         GROUP BY source_id HAVING SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE -amount END) <> 0`,
      );

      console.log('');
      console.log(`${orders} order(s), ${rs(total)} moved from advances to revenue.`);
      console.log(unbalanced.length ? `WARNING: ${unbalanced.length} payment(s) do not balance` : 'All payment entries balance (debits = credits).');
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
