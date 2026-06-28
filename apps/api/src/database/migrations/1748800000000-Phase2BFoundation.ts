import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase2BFoundation1748800000000 implements MigrationInterface {
  name = 'Phase2BFoundation1748800000000';

  public async up(qr: QueryRunner): Promise<void> {
    // ── Enums ──────────────────────────────────────────────────────────────
    await qr.query(`
      DO $$ BEGIN
        CREATE TYPE job_card_status_enum AS ENUM (
          'DRAFT','IN_QUEUE','IN_PROGRESS','CANCELLATION_PENDING','CLOSED','VOIDED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await qr.query(`
      DO $$ BEGIN
        CREATE TYPE work_order_status_enum AS ENUM (
          'PENDING','ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await qr.query(`
      DO $$ BEGIN
        CREATE TYPE work_order_type_enum AS ENUM (
          'CUT','BEND','PIPE_BEND','BOX_BAR_BEND','FLAT_IRON','L_ANGLE','SHEET_ROLL','COIL_CUT'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await qr.query(`
      DO $$ BEGIN
        CREATE TYPE pricing_model_enum AS ENUM ('UNIT_BASED','WEIGHT_BASED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await qr.query(`
      DO $$ BEGIN
        CREATE TYPE customer_type_enum AS ENUM ('INDIVIDUAL','BUSINESS');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await qr.query(`
      DO $$ BEGIN
        CREATE TYPE account_type_enum AS ENUM ('ASSET','LIABILITY','REVENUE','EXPENSE');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await qr.query(`
      DO $$ BEGIN
        CREATE TYPE entry_type_enum AS ENUM ('DEBIT','CREDIT');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await qr.query(`
      DO $$ BEGIN
        CREATE TYPE payment_mode_enum AS ENUM ('CASH','CARD','TRANSFER');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await qr.query(`
      DO $$ BEGIN
        CREATE TYPE payment_type_enum AS ENUM ('ADVANCE','PARTIAL','FINAL');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await qr.query(`
      DO $$ BEGIN
        CREATE TYPE goods_issue_status_enum AS ENUM ('PENDING','ISSUED','CONFIRMED','CANCELLED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await qr.query(`
      DO $$ BEGIN
        CREATE TYPE conflict_status_enum AS ENUM ('PENDING','RESOLVED','DISMISSED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // ── Branch ─────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS branch (
        branch_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR NOT NULL UNIQUE,
        address     VARCHAR,
        phone       VARCHAR,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS branch_section (
        section_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id   UUID NOT NULL REFERENCES branch(branch_id) ON DELETE CASCADE,
        name        VARCHAR NOT NULL,
        description VARCHAR
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS branch_config (
        config_id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id                     UUID NOT NULL UNIQUE REFERENCES branch(branch_id) ON DELETE CASCADE,
        min_advance_pct_customized    INT NOT NULL DEFAULT 30,
        min_advance_pct_standard      INT NOT NULL DEFAULT 0,
        stock_override_enabled        BOOLEAN NOT NULL DEFAULT false,
        stock_override_password_hash  VARCHAR,
        updated_at                    TIMESTAMP NOT NULL DEFAULT now(),
        updated_by                    UUID
      );
    `);

    // ── Permissions / RBAC ────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS permission (
        permission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        action        VARCHAR NOT NULL UNIQUE,
        description   VARCHAR,
        module        VARCHAR NOT NULL,
        is_system     BOOLEAN NOT NULL DEFAULT false
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS role_permission (
        role_permission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        role               role_enum NOT NULL,
        permission_id      UUID NOT NULL REFERENCES permission(permission_id) ON DELETE CASCADE,
        granted            BOOLEAN NOT NULL DEFAULT true,
        set_by             UUID,
        set_at             TIMESTAMP NOT NULL DEFAULT now(),
        UNIQUE (role, permission_id)
      );
    `);

    // ── Workers ───────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS worker (
        worker_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id  UUID NOT NULL REFERENCES branch(branch_id) ON DELETE CASCADE,
        full_name  VARCHAR NOT NULL,
        phone      VARCHAR,
        is_active  BOOLEAN NOT NULL DEFAULT true,
        created_by UUID,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    // ── Customers ─────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS customer (
        customer_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id      UUID REFERENCES branch(branch_id),
        full_name      VARCHAR NOT NULL,
        phone          VARCHAR NOT NULL UNIQUE,
        customer_type  customer_type_enum NOT NULL DEFAULT 'INDIVIDUAL',
        company_name   VARCHAR,
        contact_person VARCHAR,
        email          VARCHAR,
        address        VARCHAR,
        is_active      BOOLEAN NOT NULL DEFAULT true,
        created_at     TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    // ── Job Cards ─────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS job_card (
        job_card_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_card_number   VARCHAR NOT NULL UNIQUE,
        branch_id         UUID NOT NULL REFERENCES branch(branch_id),
        customer_id       UUID NOT NULL REFERENCES customer(customer_id),
        created_by        UUID NOT NULL,
        status            job_card_status_enum NOT NULL DEFAULT 'DRAFT',
        section_type      VARCHAR NOT NULL,
        service_type      VARCHAR NOT NULL,
        balance_due       INT NOT NULL DEFAULT 0,
        version           INT NOT NULL DEFAULT 1,
        is_legacy         BOOLEAN NOT NULL DEFAULT false,
        actor_role_at_creation role_enum,
        notes             VARCHAR,
        created_at        TIMESTAMP NOT NULL DEFAULT now(),
        updated_at        TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS job_status_log (
        log_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_card_id UUID NOT NULL REFERENCES job_card(job_card_id) ON DELETE CASCADE,
        from_status job_card_status_enum NOT NULL,
        to_status   job_card_status_enum NOT NULL,
        changed_by  UUID NOT NULL,
        actor_role  role_enum,
        note        VARCHAR,
        changed_at  TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    // ── Gate Passes (before work_order due to FK) ─────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS gate_pass (
        gate_pass_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pass_number  VARCHAR NOT NULL UNIQUE,
        job_card_id  UUID NOT NULL REFERENCES job_card(job_card_id),
        branch_id    UUID NOT NULL REFERENCES branch(branch_id),
        created_by   UUID NOT NULL,
        status       VARCHAR NOT NULL DEFAULT 'OPEN',
        closed_at    TIMESTAMP,
        created_at   TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS gate_pass_item (
        item_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        gate_pass_id UUID NOT NULL REFERENCES gate_pass(gate_pass_id) ON DELETE CASCADE,
        description  VARCHAR NOT NULL,
        quantity     INT,
        unit         VARCHAR
      );
    `);

    // ── Work Orders ───────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS work_order (
        work_order_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        work_order_number      VARCHAR NOT NULL UNIQUE,
        job_card_id            UUID NOT NULL REFERENCES job_card(job_card_id) ON DELETE CASCADE,
        created_by             UUID NOT NULL,
        status                 work_order_status_enum NOT NULL DEFAULT 'PENDING',
        work_order_type        work_order_type_enum NOT NULL,
        pricing_model          pricing_model_enum NOT NULL,
        spec                   JSONB,
        quantity               INT,
        weight_kg              DECIMAL(10,3),
        price                  INT NOT NULL,
        customer_supplied      BOOLEAN NOT NULL DEFAULT false,
        is_customized          BOOLEAN NOT NULL DEFAULT false,
        customized_reason_code VARCHAR,
        gate_pass_id           UUID REFERENCES gate_pass(gate_pass_id),
        version                INT NOT NULL DEFAULT 1,
        actor_role_at_creation role_enum,
        created_at             TIMESTAMP NOT NULL DEFAULT now(),
        updated_at             TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS work_order_worker (
        work_order_id UUID NOT NULL REFERENCES work_order(work_order_id) ON DELETE CASCADE,
        worker_id     UUID NOT NULL REFERENCES worker(worker_id),
        assigned_by   UUID,
        assigned_at   TIMESTAMP NOT NULL DEFAULT now(),
        PRIMARY KEY (work_order_id, worker_id)
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS work_order_status_note (
        note_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        work_order_id UUID NOT NULL REFERENCES work_order(work_order_id) ON DELETE CASCADE,
        written_by    UUID NOT NULL,
        actor_role    role_enum,
        note          TEXT NOT NULL,
        written_at    TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS work_order_inspection (
        inspection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        work_order_id UUID NOT NULL REFERENCES work_order(work_order_id) ON DELETE CASCADE,
        inspected_by  UUID NOT NULL,
        passed        BOOLEAN NOT NULL DEFAULT true,
        notes         TEXT,
        inspected_at  TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS work_order_attachment (
        attachment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        work_order_id UUID NOT NULL REFERENCES work_order(work_order_id) ON DELETE CASCADE,
        file_url      VARCHAR NOT NULL,
        file_name     VARCHAR,
        mime_type     VARCHAR,
        uploaded_by   UUID NOT NULL,
        uploaded_at   TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    // ── Price List ────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS price_list_entry (
        entry_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id          UUID REFERENCES branch(branch_id),
        work_order_type    work_order_type_enum NOT NULL,
        material_type      VARCHAR NOT NULL,
        thickness_or_size  VARCHAR,
        pricing_model      pricing_model_enum NOT NULL,
        rate               INT NOT NULL,
        is_active          BOOLEAN NOT NULL DEFAULT true,
        created_by         UUID,
        created_at         TIMESTAMP NOT NULL DEFAULT now(),
        updated_at         TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    // ── Inventory ─────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS hardware_store_item (
        item_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id           UUID NOT NULL REFERENCES branch(branch_id),
        name                VARCHAR NOT NULL,
        sku                 VARCHAR,
        unit                VARCHAR,
        stock_quantity      INT NOT NULL DEFAULT 0,
        low_stock_threshold INT NOT NULL DEFAULT 0,
        unit_cost           INT NOT NULL DEFAULT 0,
        is_active           BOOLEAN NOT NULL DEFAULT true,
        created_by          UUID,
        created_at          TIMESTAMP NOT NULL DEFAULT now(),
        updated_at          TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS stock_movement (
        movement_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        item_id        UUID NOT NULL REFERENCES hardware_store_item(item_id),
        branch_id      UUID,
        direction      VARCHAR NOT NULL CHECK (direction IN ('IN','OUT')),
        quantity       INT NOT NULL,
        reference_type VARCHAR,
        reference_id   UUID,
        notes          VARCHAR,
        created_by     UUID,
        moved_at       TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS stock_alert (
        alert_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        item_id         UUID NOT NULL REFERENCES hardware_store_item(item_id),
        branch_id       UUID NOT NULL REFERENCES branch(branch_id),
        stock_at_alert  INT NOT NULL,
        threshold       INT NOT NULL,
        acknowledged    BOOLEAN NOT NULL DEFAULT false,
        acknowledged_by UUID,
        created_at      TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS material_order (
        order_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_card_id  UUID NOT NULL REFERENCES job_card(job_card_id),
        branch_id    UUID NOT NULL REFERENCES branch(branch_id),
        requested_by UUID NOT NULL,
        status       VARCHAR NOT NULL DEFAULT 'PENDING',
        total_amount INT NOT NULL DEFAULT 0,
        notes        VARCHAR,
        created_at   TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS material_order_line (
        line_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id   UUID NOT NULL REFERENCES material_order(order_id) ON DELETE CASCADE,
        item_id    UUID NOT NULL REFERENCES hardware_store_item(item_id),
        quantity   INT NOT NULL,
        unit_price INT NOT NULL
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS goods_issue (
        goods_issue_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_branch_id UUID NOT NULL REFERENCES branch(branch_id),
        target_branch_id UUID NOT NULL REFERENCES branch(branch_id),
        requested_by    UUID NOT NULL,
        status          goods_issue_status_enum NOT NULL DEFAULT 'PENDING',
        approved_by     UUID,
        confirmed_by    UUID,
        notes           VARCHAR,
        created_at      TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS goods_issue_line (
        line_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        goods_issue_id UUID NOT NULL REFERENCES goods_issue(goods_issue_id) ON DELETE CASCADE,
        item_id        UUID NOT NULL REFERENCES hardware_store_item(item_id),
        quantity       INT NOT NULL
      );
    `);

    // ── Financials ────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS financial_account (
        account_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code           VARCHAR NOT NULL UNIQUE,
        name           VARCHAR NOT NULL,
        account_type   account_type_enum NOT NULL,
        normal_balance VARCHAR NOT NULL CHECK (normal_balance IN ('DEBIT','CREDIT')),
        is_active      BOOLEAN NOT NULL DEFAULT true
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS ledger_entry (
        entry_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id        UUID NOT NULL REFERENCES branch(branch_id),
        job_card_id      UUID REFERENCES job_card(job_card_id),
        account_id       UUID NOT NULL REFERENCES financial_account(account_id),
        entry_type       entry_type_enum NOT NULL,
        amount           INT NOT NULL,
        reference_type   VARCHAR NOT NULL,
        reference_id     UUID NOT NULL,
        description      VARCHAR,
        created_by       UUID NOT NULL,
        actor_role       role_enum,
        is_reversal      BOOLEAN NOT NULL DEFAULT false,
        reverses_entry_id UUID REFERENCES ledger_entry(entry_id),
        created_at       TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS payment (
        payment_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_card_id UUID NOT NULL REFERENCES job_card(job_card_id),
        branch_id   UUID NOT NULL REFERENCES branch(branch_id),
        received_by UUID NOT NULL,
        amount      INT NOT NULL,
        mode        payment_mode_enum NOT NULL,
        type        payment_type_enum NOT NULL,
        notes       VARCHAR,
        created_at  TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS invoice (
        invoice_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_number VARCHAR NOT NULL UNIQUE,
        job_card_id    UUID NOT NULL REFERENCES job_card(job_card_id),
        branch_id      UUID NOT NULL REFERENCES branch(branch_id),
        created_by     UUID NOT NULL,
        total_amount   INT NOT NULL,
        advance_paid   INT NOT NULL,
        balance_due    INT NOT NULL,
        pdf_url        VARCHAR,
        created_at     TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    // ── Supporting ────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE IF NOT EXISTS delivery (
        delivery_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_card_id    UUID NOT NULL REFERENCES job_card(job_card_id),
        branch_id      UUID NOT NULL REFERENCES branch(branch_id),
        method         VARCHAR NOT NULL CHECK (method IN ('PICKUP','DELIVERY')),
        recipient_name VARCHAR,
        notes          VARCHAR,
        recorded_by    UUID NOT NULL,
        delivered_at   TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS cancellation_request (
        request_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_card_id       UUID NOT NULL REFERENCES job_card(job_card_id),
        requested_by      UUID NOT NULL,
        reason_code       VARCHAR NOT NULL,
        reason_detail     TEXT,
        status            VARCHAR NOT NULL DEFAULT 'PENDING',
        approved_by       UUID,
        approval_note     TEXT,
        materials_consumed BOOLEAN,
        attested_by       UUID,
        created_at        TIMESTAMP NOT NULL DEFAULT now(),
        resolved_at       TIMESTAMP
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS conflict_queue (
        conflict_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id       UUID NOT NULL REFERENCES branch(branch_id),
        entity_type     VARCHAR NOT NULL,
        entity_id       UUID NOT NULL,
        reported_by     UUID NOT NULL,
        client_snapshot JSONB NOT NULL,
        server_snapshot JSONB NOT NULL,
        status          conflict_status_enum NOT NULL DEFAULT 'PENDING',
        resolved_by     UUID,
        resolution_note TEXT,
        created_at      TIMESTAMP NOT NULL DEFAULT now(),
        resolved_at     TIMESTAMP
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS petty_cash (
        petty_cash_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id     UUID NOT NULL REFERENCES branch(branch_id),
        recorded_by   UUID NOT NULL,
        amount        INT NOT NULL,
        description   VARCHAR NOT NULL,
        status        VARCHAR NOT NULL DEFAULT 'PENDING',
        approved_by   UUID,
        approved_at   TIMESTAMP,
        created_at    TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS notification (
        notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_card_id     UUID REFERENCES job_card(job_card_id),
        branch_id       UUID NOT NULL REFERENCES branch(branch_id),
        channel         VARCHAR NOT NULL,
        recipient       VARCHAR NOT NULL,
        subject         VARCHAR NOT NULL,
        body            TEXT NOT NULL,
        status          VARCHAR NOT NULL DEFAULT 'PENDING',
        error           TEXT,
        created_at      TIMESTAMP NOT NULL DEFAULT now(),
        sent_at         TIMESTAMP
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        log_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id      UUID,
        entity_type    VARCHAR NOT NULL,
        entity_id      UUID,
        action         VARCHAR NOT NULL,
        actor_id       UUID,
        actor_role     role_enum,
        before         JSONB,
        after          JSONB,
        entity_version INT,
        created_at     TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE IF NOT EXISTS legacy_import (
        import_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_card_id     UUID NOT NULL REFERENCES job_card(job_card_id),
        legacy_reference VARCHAR NOT NULL UNIQUE,
        raw_import_data  JSONB NOT NULL,
        imported_by      UUID NOT NULL,
        imported_at      TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    // ── Indexes ────────────────────────────────────────────────────────────
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_job_card_branch_status  ON job_card(branch_id, status) WHERE status = 'DRAFT';`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_work_order_job_card     ON work_order(job_card_id);`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_worker_branch_active    ON worker(branch_id) WHERE is_active = true;`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_price_list_lookup       ON price_list_entry(branch_id, work_order_type, material_type) WHERE is_active = true;`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ledger_job_card         ON ledger_entry(job_card_id, account_id);`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_ledger_branch_date      ON ledger_entry(branch_id, created_at DESC);`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_entity        ON audit_log(entity_type, entity_id);`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_stock_movement_item     ON stock_movement(item_id, moved_at DESC);`);
    await qr.query(`CREATE INDEX IF NOT EXISTS idx_conflict_queue_pending  ON conflict_queue(branch_id) WHERE status = 'PENDING';`);

    // ── Append-only enforcement ────────────────────────────────────────────
    // These REVOKEs protect immutable tables at the DB level.
    // They require a dedicated app user (erp_app_user). Skip in dev if not present.
    const appUserExists = await qr.query(`
      SELECT 1 FROM pg_roles WHERE rolname = 'erp_app_user';
    `);
    if (appUserExists.length > 0) {
      await qr.query(`REVOKE UPDATE, DELETE ON audit_log FROM erp_app_user;`);
      await qr.query(`REVOKE UPDATE, DELETE ON work_order_status_note FROM erp_app_user;`);
      await qr.query(`REVOKE UPDATE, DELETE ON job_status_log FROM erp_app_user;`);
      await qr.query(`REVOKE UPDATE, DELETE ON ledger_entry FROM erp_app_user;`);
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    // Drop in reverse FK order
    const tables = [
      'legacy_import', 'audit_log', 'notification', 'petty_cash',
      'conflict_queue', 'cancellation_request', 'delivery',
      'invoice', 'payment', 'ledger_entry', 'financial_account',
      'goods_issue_line', 'goods_issue', 'material_order_line', 'material_order',
      'stock_alert', 'stock_movement', 'hardware_store_item',
      'price_list_entry', 'work_order_attachment', 'work_order_inspection',
      'work_order_status_note', 'work_order_worker', 'work_order',
      'gate_pass_item', 'gate_pass', 'job_status_log', 'job_card',
      'customer', 'worker', 'role_permission', 'permission',
      'branch_config', 'branch_section', 'branch',
    ];
    for (const t of tables) {
      await qr.query(`DROP TABLE IF EXISTS ${t} CASCADE;`);
    }
    const enums = [
      'job_card_status_enum', 'work_order_status_enum', 'work_order_type_enum',
      'pricing_model_enum', 'customer_type_enum', 'account_type_enum',
      'entry_type_enum', 'payment_mode_enum', 'payment_type_enum',
      'goods_issue_status_enum', 'conflict_status_enum',
    ];
    for (const e of enums) {
      await qr.query(`DROP TYPE IF EXISTS ${e};`);
    }
  }
}