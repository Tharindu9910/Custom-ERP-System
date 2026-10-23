import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Branch stock reservation (Docs/decisions/0003-stock-reservation.md).
 *
 *   - branch_stock.reserved_quantity: total held for open orders. Written only by StockService,
 *     under the same row lock as quantity. available = quantity - reserved_quantity, and the
 *     CHECK makes "held stock can't be taken" a database rule.
 *   - stock_reservation: one row per order line that holds branch material, from job creation
 *     until work starts (CONSUMED) or the order is edited / voided (RELEASED).
 *
 * Existing open orders get their reservations from scripts/backfill-stock-reservations.ts
 * (dry run by default) — run it once after deploying.
 */
export class StockReservation1761200000000 implements MigrationInterface {
  name = 'StockReservation1761200000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`CREATE TYPE reservation_status_enum AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED')`);
    await qr.query(`
      ALTER TABLE branch_stock
        ADD COLUMN reserved_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
        ADD CONSTRAINT chk_branch_stock_reserved CHECK (reserved_quantity >= 0 AND reserved_quantity <= quantity)
    `);
    await qr.query(`
      CREATE TABLE stock_reservation (
        reservation_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id       UUID NOT NULL REFERENCES branch(branch_id),
        item_id         UUID NOT NULL REFERENCES item(item_id),
        order_id        UUID NOT NULL REFERENCES "order"(order_id),
        line_id         UUID NOT NULL REFERENCES order_line(line_id),
        quantity        NUMERIC(14,3) NOT NULL CHECK (quantity >= 0),
        shortfall       NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (shortfall >= 0),
        status          reservation_status_enum NOT NULL DEFAULT 'RESERVED',
        override_reason VARCHAR,
        release_reason  VARCHAR,
        created_by      UUID NOT NULL REFERENCES "user"(user_id),
        created_at      TIMESTAMP NOT NULL DEFAULT now(),
        closed_at       TIMESTAMP,
        CONSTRAINT chk_reservation_amount CHECK (quantity + shortfall > 0),
        CONSTRAINT chk_reservation_override CHECK (shortfall = 0 OR override_reason IS NOT NULL)
      )
    `);
    await qr.query(`CREATE UNIQUE INDEX uq_reservation_open_line ON stock_reservation(line_id) WHERE status = 'RESERVED'`);
    await qr.query(`CREATE INDEX idx_reservation_order ON stock_reservation(order_id) WHERE status = 'RESERVED'`);
    await qr.query(`CREATE INDEX idx_reservation_branch_item ON stock_reservation(branch_id, item_id) WHERE status = 'RESERVED'`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE stock_reservation`);
    await qr.query(`ALTER TABLE branch_stock DROP CONSTRAINT chk_branch_stock_reserved, DROP COLUMN reserved_quantity`);
    await qr.query(`DROP TYPE reservation_status_enum`);
  }
}
