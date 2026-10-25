import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import {
  LengthUnit,
  MaterialSource,
  PaymentMode,
  Role,
  toBranchDate,
  typeHasRoofing,
  typeHasWorkshop,
  type RoofingLineInput,
  type WorkshopLineInput,
} from '@erp/shared';
import { AppModule } from '../../app.module';
import type { Actor } from '../../common/actor';
import { BranchContextService } from '../../core/branch-context.service';
import { RolePermissionsService } from '../../core/role-permissions.service';
import { AttachmentsService } from '../../modules/attachments/attachments.service';
import { ItemsService } from '../../modules/items/items.service';
import { GatePassesService } from '../../modules/gate-passes/gate-passes.service';
import { JobCardsService } from '../../modules/orders/job-cards.service';
import { LineActionsService } from '../../modules/orders/line-actions.service';
import { PaymentsService } from '../../modules/orders/payments.service';
import { RoofingOrdersService } from '../../modules/orders/roofing-orders.service';
import { StockTransfersService } from '../../modules/stock-transfers/stock-transfers.service';
import { UsersService } from '../../modules/users/users.service';

/**
 * Demo data written through the real services (instructions §4: seed data that
 * skips the write path hides bugs). Run after seed.ts. Skips if orders exist.
 */
async function demo() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const ds = app.get(DataSource);
  const [{ count }] = await ds.query(`SELECT count(*)::int AS count FROM "order"`);
  if (count > 0) {
    console.log('   skip  demo data (orders already exist)');
    await app.close();
    return;
  }

  const gatePasses = app.get(GatePassesService);
  const jobCards = app.get(JobCardsService);
  const payments = app.get(PaymentsService);
  const lines = app.get(LineActionsService);
  const roofing = app.get(RoofingOrdersService);
  const items = app.get(ItemsService);
  const attachments = app.get(AttachmentsService);
  const branches = app.get(BranchContextService);
  const transfers = app.get(StockTransfersService);
  const rolePermissions = app.get(RolePermissionsService);

  const actor = async (username: string): Promise<Actor> => {
    const [u] = await ds.query(
      `SELECT u.user_id, r.role, r.branch_id FROM "user" u JOIN user_role r ON r.user_id = u.user_id AND r.is_active WHERE u.username = $1`,
      [username],
    );
    return { user_id: u.user_id, role: u.role as Role, branch_id: u.branch_id, username };
  };
  /**
   * Runs `fn` while `role` holds `action`, as if a Super Admin had ticked it on Role Permissions,
   * then puts the grant back. Used for the stock override examples (override:stock is MANAGER-only by default).
   */
  const withGrant = async <T>(role: Role, action: string, fn: () => Promise<T>): Promise<T> => {
    const [row] = await ds.query(
      `SELECT rp.granted FROM role_permission rp JOIN permission p ON p.permission_id = rp.permission_id WHERE rp.role = $1 AND p.action = $2`,
      [role, action],
    );
    const setGrant = async (granted: boolean | null) => {
      if (granted === null) {
        await ds.query(`DELETE FROM role_permission WHERE role = $1 AND permission_id = (SELECT permission_id FROM permission WHERE action = $2)`, [role, action]);
      } else {
        await ds.query(
          `INSERT INTO role_permission (role, permission_id, granted) SELECT $1::role_enum, permission_id, $3 FROM permission WHERE action = $2
           ON CONFLICT (role, permission_id) DO UPDATE SET granted = EXCLUDED.granted`,
          [role, action, granted],
        );
      }
      await rolePermissions.invalidate(role);
    };
    await setGrant(true);
    try {
      return await fn();
    } finally {
      await setGrant(row ? row.granted : null);
    }
  };
  const workers = async (branchId: string): Promise<string[]> =>
    (await ds.query(`SELECT employee_id FROM employee WHERE branch_id = $1 AND is_active ORDER BY full_name LIMIT 2`, [branchId])).map(
      (r: { employee_id: string }) => r.employee_id,
    );
  const today = toBranchDate();

  const cutBend = (material: string, thickness: string, qty: number, cuts: number, bends: number): WorkshopLineInput => ({
    job_type: 'CUT_BEND',
    material_source: MaterialSource.BRANCH,
    custom: false,
    custom_charges: [],
    material_type: material,
    thickness,
    material_quantity: qty,
    cut_count: cuts,
    bend_count: bends,
  });
  const rolling = (type: string, work: string, size: string, qty: number): WorkshopLineInput => ({
    job_type: 'ROLLING',
    material_source: MaterialSource.BRANCH,
    custom: false,
    custom_charges: [],
    rolling_type: type,
    work_type: work,
    size,
    quantity: qty,
  });
  const customerCut = (desc: string, rate: number, qty: number): WorkshopLineInput => ({
    job_type: 'CUT_BEND',
    material_source: MaterialSource.CUSTOMER,
    custom: false,
    cut_count: 0,
    bend_count: 0,
    custom_charges: [{ kind: 'CUT', description: desc, rate, quantity: qty }],
  });

  const pay = async (orderId: string, amount: number, cashier: Actor, mode = PaymentMode.CASH) =>
    payments.record(orderId, { client_request_id: randomUUID(), amount, mode, reference: mode === PaymentMode.CASH ? undefined : 'TXN-DEMO' }, cashier);

  for (const branch of [
    { sup: 'supervisor_naiwala', cashier: 'cashier_naiwala', prefix: '077' },
    { sup: 'supervisor_veyangoda', cashier: 'cashier_veyangoda', prefix: '071' },
    { sup: 'supervisor_thangalla', cashier: 'cashier_thangalla', prefix: '076' },
  ]) {
    const sup = await actor(branch.sup);
    const cashier = await actor(branch.cashier);
    const team = await workers(sup.branch_id);
    const phone = (n: string) => `${branch.prefix} ${n}`;

    const branchType = (await branches.get(sup.branch_id)).branch_type;

    // Gate passes and job cards only where the branch runs a workshop
    if (typeHasWorkshop(branchType)) {
      // Gate passes: one partly used by a job card, one untouched
      const gp1 = await gatePasses.create(
        {
          client_request_id: randomUUID(),
          customer: { phone: phone('111 2233'), name: 'Nimal Perera' },
          items: [
            { material_type: 'MS Plain Sheet', thickness: '2', length: 8, length_unit: LengthUnit.FT, quantity: 10, color: 'Galvanized' },
            { material_type: 'Zinc Coated', thickness: '1.5', quantity: 4, length_unit: LengthUnit.FT, condition_note: 'Edges slightly bent' },
          ],
        },
        sup,
      );
      await gatePasses.create(
        {
          client_request_id: randomUUID(),
          customer: { phone: phone('222 3344'), name: 'Sunil Hardware' },
          items: [{ material_type: 'Aluminium Checker Sheet', thickness: '3', length: 6, length_unit: LengthUnit.FT, quantity: 6 }],
        },
        sup,
      );

      // 1. Awaiting the advance at the cashier (the customized line needs 30% up front)
      await jobCards.create(
        {
          client_request_id: randomUUID(),
          customer: { phone: phone('333 4455'), name: 'Kamal Stores' },
          job_date: today,
          worker_ids: team,
          material_source: MaterialSource.BRANCH,
          lines: [
            cutBend('MS Plain Sheet', '2mm', 2, 4, 2),
            rolling('Pipe Bending', 'GI Pipe', '1"', 3),
            customerCut('Cut customer-supplied flat bar', 4500, 6),
          ],
        },
        sup,
      );

      // 2. Paid, in the queue, with customer material from the gate pass
      const msItem = gp1.items.find((i) => i.material_type === 'MS Plain Sheet')!;
      const queued = await jobCards.create(
        {
          client_request_id: randomUUID(),
          customer: { phone: phone('111 2233'), name: 'Nimal Perera' },
          job_date: today,
          worker_ids: team,
          material_source: MaterialSource.CUSTOMER,
          gate_pass_id: gp1.gate_pass_id,
          allocations: [{ gp_item_id: msItem.gp_item_id, quantity: 4 }],
          lines: [customerCut('Cut customer sheets to 4ft', 6000, 8), cutBend('MS Checker Sheet', '3mm', 1, 2, 0)],
        },
        sup,
      );
      await pay(queued.order_id, queued.min_advance, cashier);

      // 3. In progress
      const started = await jobCards.create(
        {
          client_request_id: randomUUID(),
          customer: { phone: phone('444 5566'), name: 'Rathna Builders' },
          job_date: today,
          worker_ids: team,
          material_source: MaterialSource.BRANCH,
          lines: [cutBend('Zinc Coated', '1.5mm', 3, 6, 4), rolling('Box Bar Bending', 'Circle Bend', '1"x1"', 2)],
        },
        sup,
      );
      let detail = await pay(started.order_id, Math.max(started.min_advance, Math.ceil(started.total / 2)), cashier, PaymentMode.CARD);
      detail = await lines.start(detail.lines[0].line_id, { version: detail.lines[0].version }, sup);

      // 4. Completed, fully paid
      const done = await jobCards.create(
        {
          client_request_id: randomUUID(),
          customer: { phone: phone('555 6677'), name: 'Saman Engineering' },
          job_date: today,
          worker_ids: team,
          material_source: MaterialSource.BRANCH,
          lines: [cutBend('MS Plain Sheet', '3mm', 1, 3, 3)],
        },
        sup,
      );
      detail = await pay(done.order_id, done.total, cashier);
      detail = await lines.start(detail.lines[0].line_id, { version: detail.lines[0].version }, sup);
      await lines.complete(detail.lines[0].line_id, { version: detail.lines[0].version }, sup);

      console.log(`   seeded demo gate passes and job cards for ${branch.sup}'s branch`);
    }

    if (typeHasRoofing(branchType)) {
      await roofingDemo(sup, cashier, phone);
      console.log(`   seeded demo roofing orders for ${branch.sup}'s branch`);
    }
  }

  /** Roofing orders in every Order Queue state, placed and moved on through the real services. */
  async function roofingDemo(sup: Actor, cashier: Actor, phone: (n: string) => string) {
    const coils = (await items.coils(sup.branch_id)).filter((c) => c.stock_ft >= 1000);
    const coil = (i: number) => coils[i % coils.length].item_id;
    const sheet = (category: RoofingLineInput['category'], pattern: string | undefined, length: number, pieces: number, coilId?: string): RoofingLineInput => ({
      category,
      job_type: 'STANDARD',
      material_source: MaterialSource.BRANCH,
      coil_item_id: coilId,
      pattern,
      length_ft: length,
      pieces,
      total_cuts: 0,
      total_bends: 0,
    });
    const accessory = (type: string, qty: number, variant?: string, coilId?: string): RoofingLineInput => ({
      category: 'Gutter Accessories',
      job_type: 'STANDARD',
      material_source: MaterialSource.BRANCH,
      coil_item_id: coilId,
      accessory_type: type,
      accessory_variant: variant,
      quantity: qty,
      total_cuts: 0,
      total_bends: 0,
    });
    const place = async (name: string, n: string, orderLines: RoofingLineInput[], payPct: number, extra: Record<string, unknown> = {}) => {
      const quote = await roofing.quote({ lines: orderLines, global_coil_item_id: extra.global_coil_item_id as string | undefined, discount: 0 }, sup);
      const amount = Math.max(quote.min_to_place, Math.round((quote.total * payPct) / 100));
      return roofing.create(
        {
          client_request_id: randomUUID(),
          customer: { phone: phone(n), name },
          order_date: today,
          technician: 'Sampath',
          material_source: MaterialSource.BRANCH,
          lines: orderLines,
          discount: 0,
          payment: { amount, mode: PaymentMode.CASH },
          ...extra,
        },
        sup,
      );
    };

    // 1. Placed — advance paid, one coil for the whole order
    await place('Ajith Constructions', '600 1122', [sheet('Roofing', 'Tile Roofing', 12, 20), sheet('Ridge Cap', 'Normal', 10, 4), accessory('Nozzle', 4, 'Round')], 30, {
      global_coil_item_id: coil(0),
    });

    // 2. Placed — customized item with a design photo, plus customer-supplied flashing
    const photo = await attachments.upload(
      { originalname: 'design.png', mimetype: 'image/png', size: DEMO_PNG.length, buffer: DEMO_PNG },
      'DESIGN_PHOTO',
      sup,
    );
    await place(
      'Lakmal Perera',
      '611 2233',
      [
        { ...sheet('Flashing', undefined, 8, 6, coil(1)), job_type: 'CUSTOMIZED', design_attachment_id: photo.attachment_id, total_bends: 12, remarks: 'Follow the sketch for the parapet' },
        { ...sheet('Gutter', undefined, 15, 3), material_source: MaterialSource.CUSTOMER, total_cuts: 6 },
      ],
      100,
    );

    // 3. In progress — coil deducted on start (BR10)
    let d = await place('Green Valley Hotel', '622 3344', [sheet('Cladding', 'Cladding', 9, 30, coil(2)), sheet('Down Pipe', undefined, 10, 6, coil(2))], 50);
    await roofing.start(d.order_id, { version: d.version }, sup);

    // 4. Ready — balance still due, so it can't be released yet
    d = await place('Nuwan Silva', '633 4455', [sheet('Gutter', undefined, 20, 4, coil(3)), accessory('End Cap', 8, undefined, coil(3))], 30);
    d = await roofing.start(d.order_id, { version: d.version }, sup);
    await roofing.complete(d.order_id, { version: d.version }, sup);

    // 5. Released — paid in full and handed over
    d = await place('Mahesh Fernando', '644 5566', [sheet('Valley Gutter', undefined, 12, 2, coil(4)), accessory('Bracket (Aluminium)', 10)], 100);
    d = await roofing.start(d.order_id, { version: d.version }, sup);
    d = await roofing.complete(d.order_id, { version: d.version }, sup);
    await roofing.release(d.order_id, { version: d.version, released_to: 'Mahesh Fernando', note: 'Lorry WP-LB 4421' }, sup);

    // 6. Cancelled by the cashier before work started
    d = await place('Ruwan Jayasinghe', '655 6677', [sheet('Wadimbu', 'V-Set', 10, 8, coil(5))], 30);
    await roofing.cancel(d.order_id, 'Customer changed the colour — will place a new order', cashier);
  }

  await transfersDemo();
  console.log('   seeded demo stock requests between branches');

  /** Stock requests in every state, mostly around Thangalla so its supervisor sees both sides. */
  async function transfersDemo() {
    const tha = await actor('supervisor_thangalla');
    const vey = await actor('supervisor_veyangoda');
    const nai = await actor('supervisor_naiwala');
    const item = async (sku: string): Promise<string> => (await ds.query(`SELECT item_id FROM item WHERE sku = $1`, [sku]))[0].item_id;
    const inDays = (n: number) => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    const ask = async (from: Actor, to: Actor, lines: [string, number][], days: number, extra: { is_urgent?: boolean; notes?: string } = {}) =>
      transfers.create(
        {
          client_request_id: randomUUID(),
          supplying_branch_id: to.branch_id,
          needed_before: inDays(days),
          is_urgent: extra.is_urgent ?? false,
          notes: extra.notes,
          lines: await Promise.all(lines.map(async ([sku, quantity]) => ({ item_id: await item(sku), quantity }))),
        },
        from,
      );
    type Transfer = Awaited<ReturnType<typeof ask>>;
    type Line = Transfer['lines'][number];
    const sent = (t: Transfer, pick: (l: Line) => number) => ({ lines: t.lines.map((l) => ({ transfer_line_id: l.transfer_line_id, qty_sent: pick(l) })) });
    const received = (t: Transfer, pick: (l: Line) => number, notes?: string) => ({
      lines: t.lines.map((l) => ({ transfer_line_id: l.transfer_line_id, qty_received: pick(l) })),
      notes,
    });

    // Sent by Veyangoda, waiting for Thangalla to receive
    let t = await ask(tha, vey, [['FST-BM-1250', 100], ['SHT-MS-060', 2]], 3, { notes: 'Bolts ran out on the shed job' });
    await transfers.send(t.transfer_id, sent(t, (l) => l.qty_requested), vey);

    // Waiting for Naiwala (main) to send (urgent)
    await ask(tha, nai, [['PIP-GI-100', 20]], 2, { is_urgent: true });

    // Veyangoda asks Thangalla: Thangalla has to check and send
    await ask(vey, tha, [['PIP-GI-200', 12], ['CON-PR-001', 2]], 4, { notes: 'For Rathna Builders gate frames' });

    // Received one short, with a note
    t = await ask(tha, vey, [['BAR-AN-200', 5]], 5);
    t = await transfers.send(t.transfer_id, sent(t, () => 5), vey);
    await transfers.receive(t.transfer_id, received(t, () => 4, '1 length bent on arrival'), tha);

    // Rejected by Naiwala
    t = await ask(tha, nai, [['SHT-GI-G20', 4]], 6);
    await transfers.reject(t.transfer_id, { reason: 'Needed for our own orders this week' }, nai);

    // Cancelled by Thangalla
    t = await ask(tha, vey, [['CON-CD-100', 10]], 7);
    await transfers.cancel(t.transfer_id, tha);

    // Received in full
    t = await ask(nai, vey, [['FST-NM-012', 40]], 3);
    t = await transfers.send(t.transfer_id, sent(t, (l) => l.qty_requested), vey);
    await transfers.receive(t.transfer_id, received(t, (l) => l.qty_sent ?? 0), nai);

    // Sent less than asked (supplier was short), still to be received
    t = await ask(vey, nai, [['BAR-RD-012', 30]], 4, { notes: 'For the gate frames' });
    await transfers.send(t.transfer_id, sent(t, () => 18), nai);

    // Late: needed by yesterday and still waiting. The API refuses past dates, so the date is
    // moved back after creating it (what an overdue request looks like a day later).
    t = await ask(vey, nai, [['CON-WR-032', 6]], 1, { notes: 'Overdue example' });
    await ds.query(`UPDATE stock_transfer SET needed_before = $2 WHERE transfer_id = $1`, [t.transfer_id, inDays(-1)]);
  }

  await moreCases();

  /**
   * The remaining cases from Docs/testing/role-capabilities.md, so every state can be seen
   * by hand: gate passes fully assigned and closed, job cards part-paid / edited / voided /
   * overridden / made by the chief, roofing orders ready-and-paid / overridden / discounted /
   * customer-material / edited by the cashier, chief logins pending and expired, a
   * deactivated user and an inactive branch.
   */
  async function moreCases() {
    const tha = await actor('supervisor_thangalla');
    const thaCashier = await actor('cashier_thangalla');
    const thaChief = await actor('chief_thangalla');
    const nai = await actor('supervisor_naiwala');
    const naiCashier = await actor('cashier_naiwala');
    const team = await workers(tha.branch_id);
    const phone = (n: string) => `075 ${n}`;
    const OVERRIDE = { password: 'Override@123', reason: 'Sheets delivered this morning, not yet entered' };

    // ── Gate passes ───────────────────────────────────────────────────────
    // Fully assigned: every piece committed to a job card that is still in the queue
    const gpFull = await gatePasses.create(
      { client_request_id: randomUUID(), customer: { phone: phone('100 2001'), name: 'Full Pass Customer' }, items: [{ material_type: 'MS Plain Sheet', thickness: '2', quantity: 3, length_unit: LengthUnit.FT }] },
      tha,
    );
    const fullCard = await jobCards.create(
      {
        client_request_id: randomUUID(),
        customer: { phone: phone('100 2001'), name: 'Full Pass Customer' },
        job_date: today,
        worker_ids: team,
        material_source: MaterialSource.CUSTOMER,
        gate_pass_id: gpFull.gate_pass_id,
        allocations: [{ gp_item_id: gpFull.items[0].gp_item_id, quantity: 3 }],
        lines: [customerCut('Cut all three customer sheets', 5000, 6)],
      },
      tha,
    );
    await pay(fullCard.order_id, fullCard.min_advance, thaCashier);

    // Closed: every piece committed to a job card that is now completed
    const gpClosed = await gatePasses.create(
      { client_request_id: randomUUID(), customer: { phone: phone('100 2002'), name: 'Closed Pass Customer' }, items: [{ material_type: 'Zinc Coated', thickness: '1.5', quantity: 2, length_unit: LengthUnit.FT }] },
      tha,
    );
    let d = await jobCards.create(
      {
        client_request_id: randomUUID(),
        customer: { phone: phone('100 2002'), name: 'Closed Pass Customer' },
        job_date: today,
        worker_ids: team,
        material_source: MaterialSource.CUSTOMER,
        gate_pass_id: gpClosed.gate_pass_id,
        allocations: [{ gp_item_id: gpClosed.items[0].gp_item_id, quantity: 2 }],
        lines: [customerCut('Bend customer zinc sheets', 4000, 2)],
      },
      tha,
    );
    d = await pay(d.order_id, d.total, thaCashier);
    d = await lines.start(d.lines[0].line_id, { version: d.lines[0].version }, tha);
    await lines.complete(d.lines[0].line_id, { version: d.lines[0].version }, tha);

    // A roofing branch's gate pass, used by a roofing order (customer-supplied gutter)
    const gpRoof = await gatePasses.create(
      { client_request_id: randomUUID(), customer: { phone: `077 100 3001`, name: 'Roof Material Customer' }, items: [{ material_type: 'Zinc Coated', thickness: '0.47', length: 20, length_unit: LengthUnit.FT, quantity: 6, color: 'Blue' }] },
      nai,
    );

    // ── Job cards (Thangalla) ─────────────────────────────────────────────
    // Part-paid: some advance taken, still below the minimum, so still awaiting payment
    d = await jobCards.create(
      {
        client_request_id: randomUUID(),
        customer: { phone: phone('200 3001'), name: 'Part Paid Customer' },
        job_date: today,
        worker_ids: team,
        material_source: MaterialSource.BRANCH,
        lines: [customerCut('Custom bracket cutting', 9000, 5)],
      },
      tha,
    );
    await pay(d.order_id, Math.max(1, Math.floor(d.min_advance / 2)), thaCashier);

    // Edited before work started: a sub-job added, so more advance is due
    d = await jobCards.create(
      {
        client_request_id: randomUUID(),
        customer: { phone: phone('200 3002'), name: 'Edited Card Customer' },
        job_date: today,
        worker_ids: team,
        material_source: MaterialSource.BRANCH,
        lines: [rolling('Pipe Bending', 'GI Pipe', '1"', 2), customerCut('Cut gate posts', 3000, 4)],
      },
      tha,
    );
    await jobCards.update(
      d.order_id,
      {
        version: d.version,
        customer: { phone: phone('200 3002'), name: 'Edited Card Customer' },
        job_date: today,
        worker_ids: team,
        material_source: MaterialSource.BRANCH,
        lines: [
          { ...rolling('Pipe Bending', 'GI Pipe', '1"', 4), line_id: d.lines[0].line_id },
          { ...customerCut('Cut gate posts', 3000, 4), line_id: d.lines[1].line_id },
          { job_type: 'COIL_CUTTING', material_source: MaterialSource.BRANCH, custom: false, custom_charges: [], coil_material: 'GI Coil 0.47mm', amount_range: '10-50' },
        ],
      },
      tha,
    );

    // Voided: the customer cancelled before paying
    d = await jobCards.create(
      {
        client_request_id: randomUUID(),
        customer: { phone: phone('200 3003'), name: 'Voided Card Customer' },
        job_date: today,
        worker_ids: team,
        material_source: MaterialSource.BRANCH,
        lines: [customerCut('Cut sheet to size', 2500, 2)],
      },
      tha,
    );
    await jobCards.void(d.order_id, 'Customer cancelled before paying', tha);

    // Saved and started with a stock override (not enough sheets available), and a manually customized line.
    // The override is given when the card is saved (Docs/decisions/0003); starting takes the authorised shortfall.
    const [low] = await ds.query(
      `SELECT i.attributes->>'material_type' AS material, i.attributes->>'thickness' AS thickness, s.quantity - s.reserved_quantity AS quantity
         FROM item i JOIN branch_stock s ON s.item_id = i.item_id
        WHERE s.branch_id = $1 AND i.item_type = 'MATERIAL' AND i.attributes->>'material_type' = 'MS Plain Sheet' AND s.quantity - s.reserved_quantity > 0
        ORDER BY s.quantity - s.reserved_quantity, i.sku LIMIT 1`,
      [tha.branch_id],
    );
    d = await withGrant(Role.SUPERVISOR, 'override:stock', () => jobCards.create(
      {
        client_request_id: randomUUID(),
        customer: { phone: phone('200 3004'), name: 'Override Card Customer' },
        job_date: today,
        worker_ids: team,
        material_source: MaterialSource.BRANCH,
        lines: [
          cutBend(low.material, low.thickness, Number(low.quantity) + 3, 2, 0),
          { ...cutBend('MS Checker Sheet', '4mm', 1, 0, 0), custom: true, customized_reason_code: 'Special design', custom_charges: [{ kind: 'BEND', description: 'Diamond pattern bends', rate: 12000, quantity: 3 }] },
        ],
        override: OVERRIDE,
      },
      tha,
    ));
    d = await pay(d.order_id, d.min_advance, thaCashier);
    await lines.start(d.lines[0].line_id, { version: d.lines[0].version }, tha);

    // Made by the chief (in the queue): BR21 applies the other way round only
    d = await jobCards.create(
      {
        client_request_id: randomUUID(),
        customer: { phone: phone('200 3005'), name: 'Chief Card Customer' },
        job_date: today,
        worker_ids: team,
        material_source: MaterialSource.BRANCH,
        lines: [rolling('Box Bar Bending', 'Circle Bend', '1"x1"', 2)],
      },
      thaChief,
    );

    // ── Roofing orders ────────────────────────────────────────────────────
    const thaCoils = await items.coils(tha.branch_id);
    const rich = thaCoils.filter((c) => c.stock_ft >= 1000);
    const short = thaCoils.find((c) => c.stock_ft > 0 && c.stock_ft < 1000)!;
    const sheetLine = (category: RoofingLineInput['category'], pattern: string | undefined, length: number, pieces: number, coilId?: string): RoofingLineInput => ({
      category, job_type: 'STANDARD', material_source: MaterialSource.BRANCH, coil_item_id: coilId, pattern, length_ft: length, pieces, total_cuts: 0, total_bends: 0,
    });
    const place = async (who: Actor, name: string, n: string, orderLines: RoofingLineInput[], opts: { full?: boolean; discount?: number; mode?: PaymentMode; extra?: Record<string, unknown> } = {}) => {
      const q = await roofing.quote({ lines: orderLines, discount: opts.discount ?? 0 }, who);
      const mode = opts.mode ?? PaymentMode.CASH;
      return roofing.create(
        {
          client_request_id: randomUUID(),
          customer: { phone: n, name },
          order_date: today,
          technician: 'Sampath',
          material_source: MaterialSource.BRANCH,
          lines: orderLines,
          discount: opts.discount ?? 0,
          payment: { amount: opts.full ? q.total : q.min_to_place, mode, reference: mode === PaymentMode.CASH ? undefined : 'TXN-DEMO-2' },
          ...opts.extra,
        },
        who,
      );
    };

    // Ready and fully paid: the supervisor can release it now
    d = await place(tha, 'Ready To Release', phone('300 4001'), [sheetLine('Roofing', 'Tile Roofing', 10, 6, rich[0].item_id)], { full: true });
    d = await roofing.start(d.order_id, { version: d.version }, tha);
    await roofing.complete(d.order_id, { version: d.version }, tha);

    // Started with a coil override (more feet than the coil has)
    await withGrant(Role.SUPERVISOR, 'override:stock', async () => {
      d = await place(tha, 'Coil Override Customer', phone('300 4002'), [sheetLine('Cladding', 'Cladding', short.stock_ft + 40, 1, short.item_id)], {
        extra: { override: OVERRIDE },
      });
      await roofing.start(d.order_id, { version: d.version }, tha);
    });

    // Discount, paid by card
    d = await place(tha, 'Discount Card Customer', phone('300 4003'), [sheetLine('Roofing', 'Tile Roofing', 14, 10, rich[1 % rich.length].item_id)], { discount: 50000, mode: PaymentMode.CARD });

    // Edited by the cashier before work started (fewer pieces), so a refund is due
    d = await place(tha, 'Cashier Edited Customer', phone('300 4004'), [sheetLine('Roofing', 'Tile Roofing', 12, 10, rich[2 % rich.length].item_id)], { full: true });
    await roofing.update(
      d.order_id,
      {
        version: d.version,
        customer: { phone: phone('300 4004'), name: 'Cashier Edited Customer' },
        order_date: today,
        technician: 'Sampath',
        material_source: MaterialSource.BRANCH,
        lines: [{ ...sheetLine('Roofing', 'Tile Roofing', 12, 6, rich[2 % rich.length].item_id), line_id: d.lines[0].line_id }],
        discount: 0,
      },
      thaCashier,
    );

    // Naiwala: customer-supplied gutter from the roofing branch's gate pass
    await place(nai, 'Roof Material Customer', '077 100 3001', [{ ...sheetLine('Gutter', undefined, 20, 4), material_source: MaterialSource.CUSTOMER }], {
      extra: { material_source: MaterialSource.CUSTOMER, gate_pass_id: gpRoof.gate_pass_id, allocations: [{ gp_item_id: gpRoof.items[0].gp_item_id, quantity: 4 }] },
    });
    void naiCashier;

    // ── Accounts ──────────────────────────────────────────────────────────
    const users = app.get(UsersService);
    const sa = await actor('superadmin');
    const candidate = async (branchId: string, name: string) =>
      (await ds.query(`SELECT employee_id FROM employee WHERE branch_id = $1 AND full_name = $2`, [branchId, name]))[0].employee_id as string;

    // A chief login waiting for its first sign-in (temporary password printed below)
    const pending = await users.createChief({ employee_id: await candidate(tha.branch_id, 'Priya Kumari'), email: 'priya.kumari@example.com' }, tha);
    // A chief whose temporary password has expired
    const vey = await actor('supervisor_veyangoda');
    await users.createChief({ employee_id: await candidate(vey.branch_id, 'Dilshan Wickramasinghe'), email: 'dilshan.w@example.com' }, vey);
    await ds.query(`UPDATE "user" SET temp_password_expires_at = now() - interval '1 day' WHERE username = 'dilshan.w@example.com'`);
    console.log(`   chief login waiting for first sign-in: priya.kumari@example.com / ${pending.temporary_password}`);
    console.log('   chief login with an expired temporary password: dilshan.w@example.com');

    // A deactivated user
    const old = await users.createUser(
      { username: 'cashier_old_thangalla', password: 'Dev@1234', full_name: 'Former Cashier (Thangalla)', role: Role.CASHIER, branch_id: tha.branch_id },
      sa.user_id,
      Role.SUPER_ADMIN,
    );
    await users.updateUser(old.user_id, { is_active: false });

    // An inactive branch (closed), visible in Branch Config only
    await ds.query(
      `INSERT INTO branch (code, name, branch_type, location, phone, is_active, is_main)
       VALUES ('BR-MAT-001', 'Matara (closed)', 'WORKSHOP', 'Matara', '041 222 3344', false, false)
       ON CONFLICT (code) DO NOTHING`,
    );
  }

  await app.close();
}

/** A small 64×64 PNG (a flashing profile sketch) used as the demo design photo. */
const DEMO_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAA10lEQVR42u3YQQ6EIBBEUe/khb3paDSZlaNg6O6q8RNWrup1QGimj/mYAAAAAAAAAAAAAADIijsv23QFHOldAafp/QCue+BX+T0AF+mdAK6/0evyqwNu00sDWtLrAhrTqwNc70Lt5VcEdKXXBbhep3vLHwv4pumdKg1NQvpAwONAWgDXnjit/LEA41cJb0Dm+gkE5J191uWPAqTePgBUrp8QQPYF1rr84wEFLQSAyvUzGFDThVqX/xyQ0woCkHxWAbCPZR/63/8doDzeAWAP1AE4BwC8CrACtJPB0HvA+EAAAAAASUVORK5CYII=',
  'base64',
);

demo()
  .then(() => console.log('✅ Demo data complete'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
