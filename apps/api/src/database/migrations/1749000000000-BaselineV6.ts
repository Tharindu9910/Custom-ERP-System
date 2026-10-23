import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline schema — full Docs/ER-v6.md (dev-only DB — reset required).
 *
 * Kept outside v6 (auth): user_session.
 * Additions to v6, recorded in Docs/decisions/0001-supervisor-dashboard.md:
 *   - client_request_id (idempotent creates) on order, payment, gate_pass, stock_transfer
 *   - material_allocation.order_id (customer material is reserved per order)
 *   - stock_transfer.reject_reason / receive_notes / closed_by / closed_at
 */
export class BaselineV61749000000000 implements MigrationInterface {
  name = 'BaselineV61749000000000';

  public async up(qr: QueryRunner): Promise<void> {
    // ── Enums ──────────────────────────────────────────────────────────────
    const enums: [string, string[]][] = [
      ['role_enum', ['SUPER_ADMIN', 'ADMIN', 'AUDITOR', 'SUPERVISOR', 'CHIEF', 'CASHIER', 'MANAGER']],
      ['branch_type_enum', ['ROOFING', 'WORKSHOP', 'ROOFING_WORKSHOP']],
      ['customer_type_enum', ['INDIVIDUAL', 'BUSINESS']],
      ['order_type_enum', ['JOB_CARD', 'ROOFING_ORDER', 'HARDWARE_SALE']],
      ['section_type_enum', ['WORKSHOP', 'HARDWARE', 'ROOFING']],
      ['service_type_enum', ['FABRICATION', 'BUY_MATERIALS']],
      ['order_status_enum', ['DRAFT', 'IN_QUEUE', 'IN_PROGRESS', 'CANCELLATION_PENDING', 'CLOSED', 'VOIDED']],
      ['delivery_method_enum', ['PICKUP', 'DELIVERY']],
      ['line_type_enum', ['CUT_BEND', 'ROLLING', 'COIL_CUTTING', 'ROOFING_SHEET', 'ROOFING_ACCESSORY', 'HARDWARE', 'MATERIAL']],
      ['line_sub_type_enum', ['CUT', 'BEND', 'PIPE_BEND', 'BOX_BAR_BEND', 'FLAT_IRON', 'L_ANGLE', 'SHEET_ROLL', 'COIL_CUT']],
      ['line_status_enum', ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']],
      ['material_source_enum', ['BRANCH', 'CUSTOMER']],
      ['price_basis_enum', ['PER_CUT', 'PER_BEND', 'PER_PIECE', 'PER_FT', 'PER_KG', 'PER_CUT_PER_M', 'FIXED']],
      ['history_event_type_enum', ['STATUS_CHANGE', 'NOTE', 'INSPECTION']],
      ['inspection_result_enum', ['PASS', 'FAIL']],
      ['payment_kind_enum', ['ADVANCE', 'PARTIAL', 'FINAL', 'REVERSAL']],
      ['payment_mode_enum', ['CASH', 'CARD', 'TRANSFER']],
      ['payment_status_enum', ['COMPLETED', 'REVERSED']],
      ['invoice_type_enum', ['ADVANCE', 'FINAL', 'TAX']],
      ['account_type_enum', ['ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE']],
      ['entry_type_enum', ['DEBIT', 'CREDIT']],
      ['petty_cash_status_enum', ['PENDING', 'APPROVED', 'RELEASED', 'SETTLED', 'REJECTED', 'CANCELLED']],
      ['approval_type_enum', ['PETTY_CASH', 'DISCOUNT_OVERRIDE', 'ORDER_CANCELLATION', 'LINE_CANCELLATION', 'STOCK_TRANSFER']],
      ['approval_status_enum', ['PENDING', 'APPROVED', 'REJECTED']],
      ['payroll_status_enum', ['DRAFT', 'COMPLETED']],
      ['gate_pass_status_enum', ['OPEN', 'CLOSED']],
      ['length_unit_enum', ['FT', 'INCHES']],
      ['allocation_status_enum', ['RESERVED', 'COMMITTED', 'RELEASED']],
      ['item_type_enum', ['HARDWARE', 'COIL', 'MATERIAL']],
      ['movement_type_enum', ['SALE', 'JOB_USAGE', 'JOB_REVERSAL', 'TRANSFER_OUT', 'TRANSFER_IN', 'TRANSFER_RETURN', 'ADJUSTMENT', 'OVERRIDE', 'LEGACY_OPENING']],
      ['alert_status_enum', ['OPEN', 'ACKNOWLEDGED', 'RESOLVED']],
      ['transfer_status_enum', ['PENDING', 'APPROVED', 'ISSUED', 'CONFIRMED', 'REJECTED', 'CANCELLED']],
      ['notification_channel_enum', ['SMS', 'WHATSAPP', 'EMAIL']],
      ['notification_status_enum', ['QUEUED', 'SENT', 'FAILED']],
      ['conflict_status_enum', ['PENDING', 'RESOLVED', 'DISMISSED']],
    ];
    for (const [name, values] of enums) {
      await qr.query(`CREATE TYPE ${name} AS ENUM (${values.map((v) => `'${v}'`).join(',')});`);
    }

    // ── Document number sequences ─────────────────────────────────────────
    for (const seq of SEQUENCES) {
      await qr.query(`CREATE SEQUENCE ${seq};`);
    }

    // ── Organisation & access ─────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE branch (
        branch_id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code                         VARCHAR NOT NULL UNIQUE,
        name                         VARCHAR NOT NULL,
        branch_type                  branch_type_enum NOT NULL,
        phone                        VARCHAR,
        location                     VARCHAR,
        settings                     JSONB NOT NULL DEFAULT '{}'::jsonb,
        stock_override_password_hash VARCHAR,
        is_active                    BOOLEAN NOT NULL DEFAULT true,
        updated_by                   UUID,
        updated_at                   TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE "user" (
        user_id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id              UUID UNIQUE,
        branch_id                UUID REFERENCES branch(branch_id),
        full_name                VARCHAR NOT NULL,
        username                 VARCHAR NOT NULL UNIQUE,
        email                    VARCHAR UNIQUE,
        phone                    VARCHAR,
        password_hash            VARCHAR NOT NULL,
        must_change_password     BOOLEAN NOT NULL DEFAULT false,
        password_changed_at      TIMESTAMP,
        temp_password_expires_at TIMESTAMP,
        failed_login_count       INT NOT NULL DEFAULT 0,
        locked_until             TIMESTAMP,
        is_active                BOOLEAN NOT NULL DEFAULT true,
        created_by               UUID REFERENCES "user"(user_id),
        created_at               TIMESTAMP NOT NULL DEFAULT now(),
        last_login_at            TIMESTAMP
      );
    `);

    await qr.query(`
      CREATE TABLE branch_type_default (
        branch_type branch_type_enum PRIMARY KEY,
        settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_by  UUID REFERENCES "user"(user_id),
        updated_at  TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE employee (
        employee_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id     UUID NOT NULL REFERENCES branch(branch_id) ON DELETE CASCADE,
        employee_code VARCHAR NOT NULL UNIQUE
                      DEFAULT ('EMP-' || lpad(nextval('employee_code_seq')::text, 5, '0')),
        full_name     VARCHAR NOT NULL,
        designation   VARCHAR,
        phone         VARCHAR,
        salary        JSONB,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_by    UUID REFERENCES "user"(user_id),
        created_at    TIMESTAMP NOT NULL DEFAULT now()
      );
    `);
    await qr.query(`ALTER SEQUENCE employee_code_seq OWNED BY employee.employee_code;`);

    // Circular references, added once both sides exist
    await qr.query(`
      ALTER TABLE "user"
        ADD CONSTRAINT fk_user_employee FOREIGN KEY (employee_id) REFERENCES employee(employee_id);
    `);
    await qr.query(`
      ALTER TABLE branch
        ADD CONSTRAINT fk_branch_updated_by FOREIGN KEY (updated_by) REFERENCES "user"(user_id);
    `);

    await qr.query(`
      CREATE TABLE user_role (
        user_role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      UUID NOT NULL REFERENCES "user"(user_id) ON DELETE CASCADE,
        branch_id    UUID REFERENCES branch(branch_id),
        role         role_enum NOT NULL,
        is_active    BOOLEAN NOT NULL DEFAULT true,
        assigned_by  UUID REFERENCES "user"(user_id),
        assigned_at  TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT chk_user_role_branch_scope CHECK (
          branch_id IS NOT NULL OR role IN ('SUPER_ADMIN','ADMIN','AUDITOR','MANAGER')
        )
      );
    `);
    // One active role per user — enforced at DB level
    await qr.query(`CREATE UNIQUE INDEX idx_user_role_one_active ON user_role(user_id) WHERE is_active = true;`);

    await qr.query(`
      CREATE TABLE user_session (
        session_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES "user"(user_id) ON DELETE CASCADE,
        jti         VARCHAR NOT NULL UNIQUE,
        ip_address  VARCHAR,
        user_agent  VARCHAR,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMP NOT NULL DEFAULT now(),
        expires_at  TIMESTAMP NOT NULL,
        revoked_at  TIMESTAMP
      );
    `);
    await qr.query(`CREATE INDEX idx_user_session_jti ON user_session(jti) WHERE is_active = true;`);
    await qr.query(`CREATE INDEX idx_user_session_user_active ON user_session(user_id) WHERE is_active = true;`);

    await qr.query(`
      CREATE TABLE permission (
        permission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        module        VARCHAR NOT NULL,
        action        VARCHAR NOT NULL UNIQUE,
        description   VARCHAR,
        is_system     BOOLEAN NOT NULL DEFAULT false
      );
    `);

    await qr.query(`
      CREATE TABLE role_permission (
        role          role_enum NOT NULL,
        permission_id UUID NOT NULL REFERENCES permission(permission_id) ON DELETE CASCADE,
        granted       BOOLEAN NOT NULL DEFAULT true,
        set_by        UUID REFERENCES "user"(user_id),
        set_at        TIMESTAMP NOT NULL DEFAULT now(),
        PRIMARY KEY (role, permission_id)
      );
    `);

    await qr.query(`
      CREATE TABLE customer (
        customer_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        home_branch_id UUID REFERENCES branch(branch_id),
        customer_type  customer_type_enum NOT NULL DEFAULT 'INDIVIDUAL',
        phone          VARCHAR NOT NULL UNIQUE,
        name           VARCHAR NOT NULL,
        company_name   VARCHAR,
        contact_person VARCHAR,
        email          VARCHAR,
        address        VARCHAR,
        created_by     UUID REFERENCES "user"(user_id),
        completed_by   UUID REFERENCES "user"(user_id),
        created_at     TIMESTAMP NOT NULL DEFAULT now(),
        completed_at   TIMESTAMP,
        CONSTRAINT chk_customer_business_company CHECK (
          customer_type <> 'BUSINESS' OR company_name IS NOT NULL
        )
      );
    `);

    // ── Inventory catalogue (before order_line, which references item) ────
    await qr.query(`
      CREATE TABLE item (
        item_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sku        VARCHAR NOT NULL UNIQUE,
        name       VARCHAR NOT NULL,
        item_type  item_type_enum NOT NULL,
        category   VARCHAR,
        unit       VARCHAR NOT NULL,
        attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
        unit_cost  INT NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
        price      INT NOT NULL DEFAULT 0 CHECK (price >= 0),
        is_active  BOOLEAN NOT NULL DEFAULT true
      );
    `);

    await qr.query(`
      CREATE TABLE branch_stock (
        branch_id     UUID NOT NULL REFERENCES branch(branch_id),
        item_id       UUID NOT NULL REFERENCES item(item_id),
        quantity      NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
        reorder_level NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
        PRIMARY KEY (branch_id, item_id)
      );
    `);

    // ── Orders ────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE "order" (
        order_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id              UUID NOT NULL REFERENCES branch(branch_id),
        customer_id            UUID REFERENCES customer(customer_id),
        order_type             order_type_enum NOT NULL,
        section_type           section_type_enum NOT NULL,
        service_type           service_type_enum,
        order_number           VARCHAR NOT NULL UNIQUE,
        status                 order_status_enum NOT NULL DEFAULT 'DRAFT',
        subtotal               INT NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
        discount               INT NOT NULL DEFAULT 0 CHECK (discount >= 0),
        total                  INT NOT NULL DEFAULT 0 CHECK (total >= 0),
        paid_amount            INT NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
        delivery_method        delivery_method_enum,
        released_to            VARCHAR,
        released_by            UUID REFERENCES "user"(user_id),
        released_at            TIMESTAMP,
        release_notes          TEXT,
        header                 JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_legacy              BOOLEAN NOT NULL DEFAULT false,
        created_by             UUID NOT NULL REFERENCES "user"(user_id),
        actor_role_at_creation role_enum,
        created_at             TIMESTAMP NOT NULL DEFAULT now(),
        updated_at             TIMESTAMP NOT NULL DEFAULT now(),
        version                INT NOT NULL DEFAULT 1,
        client_request_id      UUID UNIQUE,
        CONSTRAINT chk_order_customer CHECK (customer_id IS NOT NULL OR order_type = 'HARDWARE_SALE')
      );
    `);

    await qr.query(`
      CREATE TABLE order_line (
        line_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id               UUID NOT NULL REFERENCES "order"(order_id) ON DELETE CASCADE,
        line_number            VARCHAR NOT NULL UNIQUE,
        line_no                INT NOT NULL,
        line_type              line_type_enum NOT NULL,
        sub_type               line_sub_type_enum,
        status                 line_status_enum NOT NULL DEFAULT 'PENDING',
        material_source        material_source_enum NOT NULL DEFAULT 'BRANCH',
        item_id                UUID REFERENCES item(item_id),
        spec                   JSONB NOT NULL DEFAULT '{}'::jsonb,
        quantity               NUMERIC(14,3),
        weight_kg              NUMERIC(14,3),
        color                  VARCHAR,
        price_basis            price_basis_enum,
        unit_price             INT NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
        line_total             INT NOT NULL DEFAULT 0 CHECK (line_total >= 0),
        suggested_advance      INT NOT NULL DEFAULT 0 CHECK (suggested_advance >= 0),
        is_customized          BOOLEAN NOT NULL DEFAULT false,
        customized_reason_code VARCHAR,
        work_info              TEXT,
        notes                  TEXT,
        created_by             UUID NOT NULL REFERENCES "user"(user_id),
        actor_role_at_creation role_enum,
        created_at             TIMESTAMP NOT NULL DEFAULT now(),
        completed_at           TIMESTAMP,
        version                INT NOT NULL DEFAULT 1,
        UNIQUE (order_id, line_no)
      );
    `);

    await qr.query(`
      CREATE TABLE line_assignment (
        line_id     UUID NOT NULL REFERENCES order_line(line_id) ON DELETE CASCADE,
        employee_id UUID NOT NULL REFERENCES employee(employee_id),
        assigned_by UUID REFERENCES "user"(user_id),
        assigned_at TIMESTAMP NOT NULL DEFAULT now(),
        PRIMARY KEY (line_id, employee_id)
      );
    `);

    await qr.query(`
      CREATE TABLE status_history (
        history_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id    UUID NOT NULL REFERENCES "order"(order_id) ON DELETE CASCADE,
        line_id     UUID REFERENCES order_line(line_id) ON DELETE CASCADE,
        event_type  history_event_type_enum NOT NULL,
        from_status VARCHAR,
        to_status   VARCHAR,
        result      inspection_result_enum,
        note        TEXT,
        actor_id    UUID NOT NULL REFERENCES "user"(user_id),
        actor_role  role_enum,
        created_at  TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE price_rate (
        rate_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id         UUID REFERENCES branch(branch_id),
        line_type         line_type_enum NOT NULL,
        sub_type          line_sub_type_enum,
        variant           VARCHAR,
        work_type         VARCHAR,
        thickness_or_size VARCHAR,
        material_source   material_source_enum NOT NULL DEFAULT 'BRANCH',
        price_basis       price_basis_enum NOT NULL,
        rate              INT NOT NULL CHECK (rate >= 0),
        is_active         BOOLEAN NOT NULL DEFAULT true,
        created_by        UUID REFERENCES "user"(user_id),
        created_at        TIMESTAMP NOT NULL DEFAULT now(),
        updated_at        TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    // ── Money ─────────────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE payment (
        payment_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id            UUID NOT NULL REFERENCES "order"(order_id),
        kind                payment_kind_enum NOT NULL,
        mode                payment_mode_enum NOT NULL,
        status              payment_status_enum NOT NULL DEFAULT 'COMPLETED',
        amount              INT NOT NULL CHECK (amount > 0),
        reference_number    VARCHAR,
        receipt_no          VARCHAR NOT NULL UNIQUE,
        reverses_payment_id UUID REFERENCES payment(payment_id),
        received_by         UUID NOT NULL REFERENCES "user"(user_id),
        paid_at             TIMESTAMP NOT NULL DEFAULT now(),
        client_request_id   UUID UNIQUE
      );
    `);

    await qr.query(`
      CREATE TABLE invoice (
        invoice_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id       UUID NOT NULL REFERENCES "order"(order_id),
        invoice_number VARCHAR NOT NULL UNIQUE,
        invoice_type   invoice_type_enum NOT NULL,
        subtotal       INT NOT NULL,
        tax_rate       INT NOT NULL DEFAULT 0,
        tax_amount     INT NOT NULL DEFAULT 0,
        total_amount   INT NOT NULL,
        pdf_url        VARCHAR,
        issued_by      UUID NOT NULL REFERENCES "user"(user_id),
        issued_at      TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE financial_account (
        account_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code           VARCHAR NOT NULL UNIQUE,
        name           VARCHAR NOT NULL,
        account_type   account_type_enum NOT NULL,
        normal_balance entry_type_enum NOT NULL,
        is_system      BOOLEAN NOT NULL DEFAULT false,
        is_active      BOOLEAN NOT NULL DEFAULT true
      );
    `);

    await qr.query(`
      CREATE TABLE ledger_entry (
        entry_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id         UUID NOT NULL REFERENCES branch(branch_id),
        account_id        UUID NOT NULL REFERENCES financial_account(account_id),
        entry_type        entry_type_enum NOT NULL,
        amount            INT NOT NULL CHECK (amount > 0),
        source_type       VARCHAR NOT NULL CHECK (source_type IN (
                            'PAYMENT','CANCELLATION','STOCK_DEDUCTION','PETTY_CASH','PAYSLIP','LEGACY_OPENING'
                          )),
        source_id         UUID NOT NULL,
        order_id          UUID REFERENCES "order"(order_id),
        description       TEXT,
        reverses_entry_id UUID REFERENCES ledger_entry(entry_id),
        created_by        UUID NOT NULL REFERENCES "user"(user_id),
        actor_role        role_enum,
        created_at        TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE petty_cash (
        petty_cash_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id      UUID NOT NULL REFERENCES branch(branch_id),
        requested_by   UUID NOT NULL REFERENCES "user"(user_id),
        requested_for  UUID REFERENCES employee(employee_id),
        category       VARCHAR NOT NULL,
        amount         INT NOT NULL CHECK (amount > 0),
        spent          INT,
        description    TEXT,
        reference_note VARCHAR,
        status         petty_cash_status_enum NOT NULL DEFAULT 'PENDING',
        created_at     TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE approval_request (
        approval_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id          UUID NOT NULL REFERENCES branch(branch_id),
        request_type       approval_type_enum NOT NULL,
        entity_type        VARCHAR NOT NULL,
        entity_id          UUID NOT NULL,
        amount             INT,
        reason_code        VARCHAR,
        reason_detail      TEXT,
        prior_status       VARCHAR,
        materials_consumed BOOLEAN,
        attested_by        UUID REFERENCES "user"(user_id),
        attested_at        TIMESTAMP,
        status             approval_status_enum NOT NULL DEFAULT 'PENDING',
        requested_by       UUID NOT NULL REFERENCES "user"(user_id),
        decided_by         UUID REFERENCES "user"(user_id),
        decision_note      TEXT,
        created_at         TIMESTAMP NOT NULL DEFAULT now(),
        decided_at         TIMESTAMP
      );
    `);

    await qr.query(`
      CREATE TABLE payroll_run (
        run_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id  UUID NOT NULL REFERENCES branch(branch_id),
        year       INT NOT NULL,
        month      INT NOT NULL CHECK (month BETWEEN 1 AND 12),
        status     payroll_status_enum NOT NULL DEFAULT 'DRAFT',
        created_by UUID NOT NULL REFERENCES "user"(user_id),
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        UNIQUE (branch_id, year, month)
      );
    `);

    await qr.query(`
      CREATE TABLE payslip (
        payslip_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id           UUID NOT NULL REFERENCES payroll_run(run_id) ON DELETE CASCADE,
        employee_id      UUID NOT NULL REFERENCES employee(employee_id),
        earnings         JSONB NOT NULL DEFAULT '{}'::jsonb,
        deductions       JSONB NOT NULL DEFAULT '{}'::jsonb,
        inputs           JSONB NOT NULL DEFAULT '{}'::jsonb,
        gross            INT NOT NULL DEFAULT 0,
        total_deductions INT NOT NULL DEFAULT 0,
        net              INT NOT NULL DEFAULT 0
      );
    `);

    // ── Customer material ─────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE gate_pass (
        gate_pass_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id         UUID NOT NULL REFERENCES branch(branch_id),
        customer_id       UUID NOT NULL REFERENCES customer(customer_id),
        pass_number       VARCHAR NOT NULL UNIQUE,
        status            gate_pass_status_enum NOT NULL DEFAULT 'OPEN',
        notes             TEXT,
        issued_by         UUID NOT NULL REFERENCES "user"(user_id),
        created_at        TIMESTAMP NOT NULL DEFAULT now(),
        closed_at         TIMESTAMP,
        client_request_id UUID UNIQUE
      );
    `);

    await qr.query(`
      CREATE TABLE gate_pass_item (
        gp_item_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        gate_pass_id   UUID NOT NULL REFERENCES gate_pass(gate_pass_id) ON DELETE CASCADE,
        material_type  VARCHAR NOT NULL,
        thickness      VARCHAR,
        length         NUMERIC(10,2),
        length_unit    length_unit_enum,
        color          VARCHAR,
        quantity       INT NOT NULL DEFAULT 1 CHECK (quantity >= 1),
        condition_note VARCHAR
      );
    `);

    await qr.query(`
      CREATE TABLE material_allocation (
        allocation_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        gp_item_id     UUID NOT NULL REFERENCES gate_pass_item(gp_item_id),
        order_id       UUID REFERENCES "order"(order_id),
        line_id        UUID REFERENCES order_line(line_id) ON DELETE SET NULL,
        draft_id       VARCHAR,
        quantity       INT NOT NULL CHECK (quantity > 0),
        status         allocation_status_enum NOT NULL DEFAULT 'RESERVED',
        release_reason VARCHAR,
        accepted_by    UUID REFERENCES "user"(user_id),
        expires_at     TIMESTAMP,
        created_at     TIMESTAMP NOT NULL DEFAULT now(),
        released_at    TIMESTAMP,
        CONSTRAINT chk_allocation_owner CHECK (
          status = 'RELEASED' OR order_id IS NOT NULL OR draft_id IS NOT NULL
        )
      );
    `);

    // ── Inventory movements & transfers ───────────────────────────────────
    await qr.query(`
      CREATE TABLE stock_transfer (
        transfer_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transfer_number        VARCHAR NOT NULL UNIQUE,
        requesting_branch_id   UUID NOT NULL REFERENCES branch(branch_id),
        supplying_branch_id    UUID NOT NULL REFERENCES branch(branch_id),
        source_document_number VARCHAR,
        status                 transfer_status_enum NOT NULL DEFAULT 'PENDING',
        needed_before          DATE,
        is_urgent              BOOLEAN NOT NULL DEFAULT false,
        notes                  TEXT,
        reject_reason          TEXT,
        receive_notes          TEXT,
        requested_by           UUID NOT NULL REFERENCES "user"(user_id),
        approved_by            UUID REFERENCES "user"(user_id),
        sent_by                UUID REFERENCES "user"(user_id),
        received_by            UUID REFERENCES "user"(user_id),
        closed_by              UUID REFERENCES "user"(user_id),
        created_at             TIMESTAMP NOT NULL DEFAULT now(),
        approved_at            TIMESTAMP,
        sent_at                TIMESTAMP,
        received_at            TIMESTAMP,
        closed_at              TIMESTAMP,
        client_request_id      UUID UNIQUE,
        CONSTRAINT chk_transfer_branches CHECK (requesting_branch_id <> supplying_branch_id)
      );
    `);

    await qr.query(`
      CREATE TABLE stock_transfer_line (
        transfer_line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transfer_id      UUID NOT NULL REFERENCES stock_transfer(transfer_id) ON DELETE CASCADE,
        item_id          UUID NOT NULL REFERENCES item(item_id),
        qty_requested    NUMERIC(14,3) NOT NULL CHECK (qty_requested > 0),
        qty_sent         NUMERIC(14,3) CHECK (qty_sent >= 0),
        qty_received     NUMERIC(14,3) CHECK (qty_received >= 0),
        reference_number VARCHAR,
        notes            TEXT,
        UNIQUE (transfer_id, item_id)
      );
    `);

    await qr.query(`
      CREATE TABLE stock_movement (
        movement_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id        UUID NOT NULL REFERENCES branch(branch_id),
        item_id          UUID NOT NULL REFERENCES item(item_id),
        movement_type    movement_type_enum NOT NULL,
        quantity         NUMERIC(14,3) NOT NULL,
        quantity_after   NUMERIC(14,3) NOT NULL,
        line_id          UUID REFERENCES order_line(line_id),
        transfer_line_id UUID REFERENCES stock_transfer_line(transfer_line_id),
        reason           TEXT,
        created_by       UUID NOT NULL REFERENCES "user"(user_id),
        moved_at         TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE stock_alert (
        alert_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id         UUID NOT NULL REFERENCES branch(branch_id),
        item_id           UUID NOT NULL REFERENCES item(item_id),
        quantity_at_alert NUMERIC(14,3) NOT NULL,
        status            alert_status_enum NOT NULL DEFAULT 'OPEN',
        acknowledged_by   UUID REFERENCES "user"(user_id),
        created_at        TIMESTAMP NOT NULL DEFAULT now(),
        acknowledged_at   TIMESTAMP
      );
    `);

    // ── Cross-cutting ─────────────────────────────────────────────────────
    await qr.query(`
      CREATE TABLE attachment (
        attachment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_type   VARCHAR,
        entity_id     UUID,
        purpose       VARCHAR NOT NULL,
        file_name     VARCHAR NOT NULL,
        file_type     VARCHAR NOT NULL,
        file_url      VARCHAR NOT NULL,
        uploaded_by   UUID NOT NULL REFERENCES "user"(user_id),
        uploaded_at   TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE notification (
        notification_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id          UUID REFERENCES "order"(order_id),
        customer_id       UUID REFERENCES customer(customer_id),
        channel           notification_channel_enum NOT NULL,
        template_id       VARCHAR,
        recipient_contact VARCHAR NOT NULL,
        message           TEXT NOT NULL,
        status            notification_status_enum NOT NULL DEFAULT 'QUEUED',
        retry_count       INT NOT NULL DEFAULT 0,
        failure_reason    TEXT,
        sent_by           UUID REFERENCES "user"(user_id),
        sent_at           TIMESTAMP
      );
    `);

    await qr.query(`
      CREATE TABLE sync_conflict (
        conflict_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        branch_id       UUID NOT NULL REFERENCES branch(branch_id),
        entity_type     VARCHAR NOT NULL,
        entity_id       UUID NOT NULL,
        client_snapshot JSONB NOT NULL,
        server_snapshot JSONB NOT NULL,
        status          conflict_status_enum NOT NULL DEFAULT 'PENDING',
        reported_by     UUID NOT NULL REFERENCES "user"(user_id),
        resolved_by     UUID REFERENCES "user"(user_id),
        resolution_note TEXT,
        created_at      TIMESTAMP NOT NULL DEFAULT now(),
        resolved_at     TIMESTAMP
      );
    `);

    await qr.query(`
      CREATE TABLE legacy_import (
        import_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id         UUID NOT NULL UNIQUE REFERENCES "order"(order_id),
        legacy_reference VARCHAR NOT NULL UNIQUE,
        raw_import_data  JSONB NOT NULL,
        imported_by      UUID NOT NULL REFERENCES "user"(user_id),
        imported_at      TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await qr.query(`
      CREATE TABLE audit_log (
        audit_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id        UUID REFERENCES "user"(user_id),
        branch_id      UUID REFERENCES branch(branch_id),
        actor_role     role_enum,
        entity_type    VARCHAR NOT NULL,
        entity_id      UUID,
        entity_version INT,
        action         VARCHAR NOT NULL,
        old_value      JSONB,
        new_value      JSONB,
        ip_address     VARCHAR,
        logged_at      TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    // ── Indexes ────────────────────────────────────────────────────────────
    const indexes = [
      `CREATE INDEX idx_employee_branch_active    ON employee(branch_id) WHERE is_active = true`,
      `CREATE INDEX idx_order_branch_status       ON "order"(branch_id, status, created_at DESC)`,
      `CREATE INDEX idx_order_customer            ON "order"(customer_id)`,
      `CREATE INDEX idx_order_line_order          ON order_line(order_id)`,
      `CREATE INDEX idx_status_history_order      ON status_history(order_id, created_at)`,
      `CREATE INDEX idx_payment_order             ON payment(order_id)`,
      // One active rate per lookup key (NULLs count as equal — the master rate has branch_id NULL)
      `CREATE UNIQUE INDEX idx_price_rate_lookup  ON price_rate(
         branch_id, line_type, sub_type, variant, work_type, thickness_or_size, material_source)
         NULLS NOT DISTINCT WHERE is_active = true`,
      `CREATE INDEX idx_gate_pass_branch_date     ON gate_pass(branch_id, created_at DESC)`,
      `CREATE INDEX idx_gate_pass_customer        ON gate_pass(customer_id)`,
      `CREATE INDEX idx_allocation_item_status    ON material_allocation(gp_item_id, status)`,
      `CREATE INDEX idx_allocation_order          ON material_allocation(order_id) WHERE status <> 'RELEASED'`,
      `CREATE INDEX idx_allocation_draft          ON material_allocation(draft_id) WHERE status = 'RESERVED'`,
      `CREATE INDEX idx_branch_stock_branch       ON branch_stock(branch_id)`,
      `CREATE INDEX idx_stock_movement_item       ON stock_movement(branch_id, item_id, moved_at DESC)`,
      `CREATE UNIQUE INDEX idx_stock_alert_active ON stock_alert(branch_id, item_id) WHERE status <> 'RESOLVED'`,
      `CREATE INDEX idx_transfer_requesting       ON stock_transfer(requesting_branch_id, status)`,
      `CREATE INDEX idx_transfer_supplying        ON stock_transfer(supplying_branch_id, status)`,
      `CREATE INDEX idx_ledger_order              ON ledger_entry(order_id, account_id)`,
      `CREATE INDEX idx_ledger_branch_date        ON ledger_entry(branch_id, created_at DESC)`,
      `CREATE INDEX idx_ledger_source             ON ledger_entry(source_type, source_id)`,
      `CREATE INDEX idx_attachment_entity         ON attachment(entity_type, entity_id)`,
      `CREATE INDEX idx_audit_log_entity          ON audit_log(entity_type, entity_id)`,
      `CREATE INDEX idx_audit_log_user_date       ON audit_log(user_id, logged_at DESC)`,
      `CREATE INDEX idx_sync_conflict_pending     ON sync_conflict(branch_id) WHERE status = 'PENDING'`,
    ];
    for (const sql of indexes) {
      await qr.query(sql);
    }

    // ── Append-only enforcement ────────────────────────────────────────────
    // Requires a dedicated app user (erp_app_user). Skipped in dev if not present.
    const appUserExists = await qr.query(`SELECT 1 FROM pg_roles WHERE rolname = 'erp_app_user';`);
    if (appUserExists.length > 0) {
      for (const t of ['audit_log', 'status_history', 'ledger_entry', 'stock_movement']) {
        await qr.query(`REVOKE UPDATE, DELETE ON ${t} FROM erp_app_user;`);
      }
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    // Drop in reverse FK order
    const tables = [
      'audit_log', 'legacy_import', 'sync_conflict', 'notification', 'attachment',
      'stock_alert', 'stock_movement', 'stock_transfer_line', 'stock_transfer',
      'material_allocation', 'gate_pass_item', 'gate_pass',
      'payslip', 'payroll_run', 'approval_request', 'petty_cash',
      'ledger_entry', 'financial_account', 'invoice', 'payment',
      'price_rate', 'status_history', 'line_assignment', 'order_line', '"order"',
      'branch_stock', 'item', 'customer', 'role_permission', 'permission',
      'user_session', 'user_role', 'branch_type_default',
    ];
    for (const t of tables) {
      await qr.query(`DROP TABLE IF EXISTS ${t} CASCADE;`);
    }

    // Break the user ↔ employee ↔ branch cycle before dropping
    await qr.query(`ALTER TABLE IF EXISTS branch DROP CONSTRAINT IF EXISTS fk_branch_updated_by;`);
    await qr.query(`ALTER TABLE IF EXISTS "user" DROP CONSTRAINT IF EXISTS fk_user_employee;`);
    await qr.query(`DROP TABLE IF EXISTS employee CASCADE;`);
    await qr.query(`DROP TABLE IF EXISTS "user" CASCADE;`);
    await qr.query(`DROP TABLE IF EXISTS branch CASCADE;`);

    for (const seq of SEQUENCES) {
      await qr.query(`DROP SEQUENCE IF EXISTS ${seq};`);
    }

    const enums = await qr.query(`
      SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typtype = 'e'
    `);
    for (const { typname } of enums as { typname: string }[]) {
      await qr.query(`DROP TYPE IF EXISTS ${typname};`);
    }
  }
}

// Document numbers are generated from these (see NumberService).
const SEQUENCES = [
  'employee_code_seq',
  'job_card_number_seq',
  'roofing_order_number_seq',
  'hardware_sale_number_seq',
  'order_line_number_seq',
  'gate_pass_number_seq',
  'stock_transfer_number_seq',
  'receipt_number_seq',
  'invoice_number_seq',
];
