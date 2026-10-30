import {
  AllocationStatus,
  CreateStockTransferSchema,
  TransferStatus,
  isOpenTransfer,
  transferDisplayStatus,
  transferNeedsAction,
  DEFAULT_BRANCH_SETTINGS,
  LineStatus,
  LineSubType,
  LineType,
  MaterialSource,
  OrderStatus,
  canTransitionOrder,
  canTransitionHardware,
  canTransitionHardwareLine,
  hardwareAdvanceRange,
  hardwareDisplayStatus,
  hardwareLineTotal,
  CreateHardwareSaleSchema,
  PriceBasis,
  WorkshopLineSchema,
  findRate,
  gatePassSummary,
  itemBalance,
  coilDetails,
  jobCardMinAdvance,
  lineDeductsCoil,
  normalizeRoofingLine,
  roofingItemTitle,
  minToPlace,
  paymentKindFor,
  paymentStateFor,
  phoneKey,
  priceRoofingLine,
  priceWorkshopLine,
  roofingDisplayStatus,
  roofingTotals,
  stockAlertInfo,
  stockLevel,
  toBranchDate,
  validateRoofingLine,
  workshopDisplayStatus,
  type RateRow,
  type RoofingLineInput,
} from '@erp/shared';

// Business rules shared by the API and the web (packages/shared). Examples come
// from the approved prototype so a change in a formula shows up here.

const rate = (r: Partial<RateRow> & Pick<RateRow, 'line_type' | 'price_basis' | 'rate'>): RateRow => ({
  sub_type: null,
  variant: null,
  work_type: null,
  thickness_or_size: null,
  material_source: MaterialSource.BRANCH,
  ...r,
});

describe('findRate', () => {
  const rates = [
    rate({ line_type: LineType.ROOFING_SHEET, variant: 'Roofing', thickness_or_size: '0.47mm', price_basis: PriceBasis.PER_FT, rate: 47000 }),
    rate({ line_type: LineType.ROOFING_SHEET, variant: 'Roofing', thickness_or_size: '0.53mm', price_basis: PriceBasis.PER_FT, rate: 52000 }),
  ];
  it('finds the rate whose key fields all match', () => {
    expect(findRate(rates, { line_type: LineType.ROOFING_SHEET, variant: 'Roofing', thickness_or_size: '0.53mm' })?.rate).toBe(52000);
  });
  it('returns null when nothing matches (unset key fields only match NULL)', () => {
    expect(findRate(rates, { line_type: LineType.ROOFING_SHEET, variant: 'Roofing' })).toBeNull();
  });
});

describe('roofing pricing (prototype orderPricing)', () => {
  const rates = [
    rate({ line_type: LineType.ROOFING_SHEET, variant: 'Roofing', thickness_or_size: '0.47mm', price_basis: PriceBasis.PER_FT, rate: 47000 }),
    rate({ line_type: LineType.ROOFING_SHEET, variant: 'Roofing', material_source: MaterialSource.CUSTOMER, price_basis: PriceBasis.PER_FT, rate: 6000 }),
    rate({ line_type: LineType.ROOFING_SHEET, sub_type: LineSubType.CUT, price_basis: PriceBasis.PER_CUT, rate: 2500 }),
    rate({ line_type: LineType.ROOFING_SHEET, sub_type: LineSubType.BEND, price_basis: PriceBasis.PER_BEND, rate: 5000 }),
    rate({ line_type: LineType.ROOFING_ACCESSORY, variant: 'Nozzle', price_basis: PriceBasis.PER_PIECE, rate: 65000 }),
  ];
  const ctx = { rates, surcharge_pct: 15, coilThickness: () => '0.47mm' };
  const sheet = (over: Partial<RoofingLineInput> = {}): RoofingLineInput => ({
    category: 'Roofing',
    job_type: 'STANDARD',
    material_source: MaterialSource.BRANCH,
    coil_item_id: '22222222-2222-2222-2222-222222222222',
    pattern: 'Tile Roofing',
    length_ft: 12,
    pieces: 10,
    total_cuts: 3,
    total_bends: 2,
    ...over,
  });

  it('standard sheet: running ft × per-ft + cuts + bends', () => {
    // 120 ft × Rs 470 = 56,400 + 3 × 25 + 2 × 50 = 56,575
    const p = priceRoofingLine(sheet(), ctx);
    expect(p.missing_rate).toBeNull();
    expect(p.quantity).toBe(120);
    expect(p.line_total).toBe(5657500);
  });

  it('customized sheet: surcharge on the sheet only, not on cuts and bends', () => {
    // 56,400 × 1.15 = 64,860 + 175 = 65,035
    expect(priceRoofingLine(sheet({ job_type: 'CUSTOMIZED' }), ctx).line_total).toBe(6503500);
  });

  it('customer material uses the customer rate regardless of thickness', () => {
    // 120 ft × Rs 60 = 7,200 + 175
    expect(priceRoofingLine(sheet({ material_source: MaterialSource.CUSTOMER, coil_item_id: undefined }), ctx).line_total).toBe(737500);
  });

  it('accessory: surcharged unit price × quantity', () => {
    const p = priceRoofingLine({ category: 'Gutter Accessories', job_type: 'CUSTOMIZED', material_source: MaterialSource.BRANCH, accessory_type: 'Nozzle', accessory_variant: 'Round', quantity: 2, total_cuts: 0, total_bends: 0 }, ctx);
    expect(p.unit_price).toBe(74750);
    expect(p.line_total).toBe(149500);
  });

  it('missing rate blocks the line', () => {
    const p = priceRoofingLine(sheet({ category: 'Gutter' }), ctx);
    expect(p.line_total).toBe(0);
    expect(p.missing_rate).toContain('Gutter');
  });

  it('totals: discount clamp, max discount and minimum to place', () => {
    const policy = DEFAULT_BRANCH_SETTINGS.orders; // 5% max discount, 30% advance
    const t = roofingTotals([100000, 50000], 2000, policy);
    expect(t).toMatchObject({ subtotal: 150000, discount: 2000, max_discount: 7500, total: 148000, min_to_place: 44400 });
    expect(minToPlace(1001, { ...policy, min_advance_pct: 30 })).toBe(301); // rounds up
    expect(minToPlace(5000, { ...policy, min_payment_to_place: 'FULL' })).toBe(5000);
    expect(minToPlace(5000, { ...policy, min_payment_to_place: 'NONE' })).toBe(0);
  });

  it('item rules: coil, pattern and photo requirements', () => {
    const cfg = DEFAULT_BRANCH_SETTINGS.roofing;
    expect(validateRoofingLine(sheet({ coil_item_id: undefined }), cfg, false)).toContain('coil');
    expect(validateRoofingLine(sheet({ coil_item_id: undefined }), cfg, true)).toEqual([]);
    expect(validateRoofingLine(sheet({ pattern: undefined }), cfg, false)).toContain('design pattern');
    expect(validateRoofingLine(sheet({ job_type: 'CUSTOMIZED' }), cfg, false)).toContain('design photo');
    // Customer material never needs a coil; aluminium brackets never need a coil
    expect(validateRoofingLine(sheet({ material_source: MaterialSource.CUSTOMER, coil_item_id: undefined, pattern: undefined }), cfg, false)).toEqual([]);
    expect(
      validateRoofingLine({ category: 'Gutter Accessories', job_type: 'STANDARD', material_source: MaterialSource.BRANCH, accessory_type: 'Bracket (Aluminium)', quantity: 4, total_cuts: 0, total_bends: 0 }, cfg, false),
    ).toEqual([]);
  });
});

describe('workshop pricing', () => {
  const rates = [
    rate({ line_type: LineType.CUT_BEND, sub_type: LineSubType.CUT, variant: 'MS Plain Sheet', thickness_or_size: '2mm', price_basis: PriceBasis.PER_CUT, rate: 3800 }),
    rate({ line_type: LineType.CUT_BEND, sub_type: LineSubType.BEND, variant: 'MS Plain Sheet', thickness_or_size: '2mm', price_basis: PriceBasis.PER_BEND, rate: 7600 }),
    rate({ line_type: LineType.ROLLING, sub_type: LineSubType.PIPE_BEND, work_type: 'GI Pipe', thickness_or_size: '1"', price_basis: PriceBasis.PER_PIECE, rate: 23000 }),
  ];
  const ctx = { rates, materialPrice: (m: string, t: string) => (m === 'MS Plain Sheet' && t === '2mm' ? 450000 : null) };
  const parse = (v: unknown) => WorkshopLineSchema.parse(v);
  const GP_ITEM = '7b1c2a4e-5d6f-4a8b-9c0d-1e2f3a4b5c6d';

  it('standard cut/bend: cuts + bends + branch material', () => {
    const p = priceWorkshopLine(parse({ job_type: 'CUT_BEND', material_type: 'MS Plain Sheet', thickness: '2mm', material_quantity: 2, cut_count: 4, bend_count: 3 }), ctx);
    // 4 × 38 + 3 × 76 + 2 × 4,500 = 9,380
    expect(p).toMatchObject({ is_customized: false, auto_customized: false, line_total: 938000 });
  });

  it('missing rate makes the line customized and asks for a custom price (BR23)', () => {
    const line = parse({ job_type: 'CUT_BEND', material_type: 'Stainless Steel (SS)', thickness: '6mm', material_quantity: 1, cut_count: 1 });
    const p = priceWorkshopLine(line, ctx);
    expect(p.is_customized).toBe(true);
    expect(p.auto_customized).toBe(true);
    expect(p.missing_rates.length).toBeGreaterThan(0);
    const withCharge = priceWorkshopLine({ ...line, custom_charges: [{ kind: 'CUT', description: 'Thick SS cut', rate: 25000, quantity: 1 }] }, ctx);
    expect(withCharge.missing_rates).toEqual([]);
    expect(withCharge.line_total).toBe(25000);
  });

  it('customer material is always customized (prototype rule)', () => {
    const p = priceWorkshopLine(
      parse({
        job_type: 'CUT_BEND',
        material_source: 'CUSTOMER',
        customer_material: { gp_item_id: GP_ITEM, quantity: 2 },
        custom_charges: [{ kind: 'CUT', description: 'Cut', rate: 5000, quantity: 3 }, { kind: 'BEND', description: 'Bend', rate: 8000, quantity: 2 }],
      }),
      ctx,
    );
    expect(p).toMatchObject({ is_customized: true, auto_customized: false, line_total: 31000 });
  });

  it('customer material needs a gate pass item; branch lines must not have one (Docs/decisions/0007)', () => {
    const charge = [{ kind: 'CUT', description: 'Cut', rate: 5000, quantity: 1 }];
    const messages = (v: unknown) => {
      const r = WorkshopLineSchema.safeParse(v);
      return r.success ? [] : r.error.issues.map((i) => i.message);
    };
    expect(messages({ job_type: 'CUT_BEND', material_source: 'CUSTOMER', custom_charges: charge })).toContain("Pick the customer's material from a gate pass");
    expect(messages({ job_type: 'COIL_CUTTING', material_source: 'CUSTOMER', coil_material: 'GI coil', amount_range: '1-10' })).toContain(
      "Pick the customer's material from a gate pass",
    );
    expect(
      messages({ job_type: 'COIL_CUTTING', material_source: 'CUSTOMER', coil_material: 'GI coil', amount_range: '1-10', customer_material: { gp_item_id: GP_ITEM, quantity: 1 } }),
    ).toEqual([]);
    expect(
      messages({ job_type: 'ROLLING', material_source: 'BRANCH', rolling_type: 'Pipe Bending', work_type: 'GI Pipe', size: '1"', quantity: 1, customer_material: { gp_item_id: GP_ITEM, quantity: 1 } }),
    ).toContain('Branch stock lines cannot use gate pass material');
  });

  it('rolling is priced per piece by type, work type and size', () => {
    const p = priceWorkshopLine(parse({ job_type: 'ROLLING', rolling_type: 'Pipe Bending', work_type: 'GI Pipe', size: '1"', quantity: 5 }), ctx);
    expect(p).toMatchObject({ line_type: LineType.ROLLING, sub_type: LineSubType.PIPE_BEND, line_total: 115000, is_customized: false });
  });

  it('schema: standard cut/bend needs material, thickness, quantity and cuts or bends', () => {
    expect(WorkshopLineSchema.safeParse({ job_type: 'CUT_BEND', material_type: 'MS Plain Sheet', thickness: '2mm', material_quantity: 1 }).success).toBe(false);
    expect(WorkshopLineSchema.safeParse({ job_type: 'CUT_BEND', custom: true }).success).toBe(false);
  });
});

describe('payments and advance', () => {
  it('payment state follows the prototype rule', () => {
    expect(paymentStateFor(0, 0)).toBe('FULLY_PAID');
    expect(paymentStateFor(1000, 0)).toBe('UNPAID');
    expect(paymentStateFor(1000, 300)).toBe('ADVANCE_PAID');
    expect(paymentStateFor(1000, 1000)).toBe('FULLY_PAID');
  });
  it('payment kind', () => {
    expect(paymentKindFor(0, 300, 1000)).toBe('ADVANCE');
    expect(paymentKindFor(300, 200, 1000)).toBe('PARTIAL');
    expect(paymentKindFor(300, 700, 1000)).toBe('FINAL');
  });
  it('job card minimum advance: customized 30% + standard 0% (BR09)', () => {
    expect(jobCardMinAdvance([{ line_total: 10000, is_customized: true }, { line_total: 5000, is_customized: false }], DEFAULT_BRANCH_SETTINGS)).toBe(3000);
    expect(jobCardMinAdvance([{ line_total: 333, is_customized: true }], DEFAULT_BRANCH_SETTINGS)).toBe(100); // rounds up
  });
});

describe('gate pass balances (prototype allocationManager)', () => {
  const now = new Date('2026-10-21T10:00:00Z');
  const item = { gp_item_id: 'i1', material_type: 'MS Plain Sheet', thickness: '2', length: 8, length_unit: 'FT', color: null, quantity: 10, condition_note: null };
  const alloc = (over: object) => ({ allocation_id: Math.random().toString(), gp_item_id: 'i1', order_id: null, draft_id: null, quantity: 1, status: AllocationStatus.COMMITTED, expires_at: null, created_at: now, ...over });

  it('available = received − committed − active reservations; expired reservations free up', () => {
    const allocations = [
      alloc({ quantity: 4, order_id: 'o1' }),
      alloc({ quantity: 3, status: AllocationStatus.RESERVED, draft_id: 'd1', expires_at: new Date(now.getTime() + 60_000) }),
      alloc({ quantity: 2, status: AllocationStatus.RESERVED, draft_id: 'd2', expires_at: new Date(now.getTime() - 60_000) }),
      alloc({ quantity: 5, status: AllocationStatus.RELEASED, order_id: 'o2' }),
    ];
    expect(itemBalance(item, allocations, { now })).toEqual({ gp_item_id: 'i1', received: 10, committed: 4, reserved: 3, available: 3 });
    // Editing draft d1 counts its own reservation as available
    expect(itemBalance(item, allocations, { now, exclude_draft_id: 'd1' }).available).toBe(6);
  });

  it('status: open → reserved → partially → fully assigned → closed', () => {
    const order = (terminal: boolean) => ({ order_id: 'o1', order_number: 'JC-00001', order_type: 'JOB_CARD', status_label: 'x', terminal, closed_at: terminal ? now : null });
    expect(gatePassSummary([item], [], [], now).status).toBe('OPEN');
    expect(gatePassSummary([item], [alloc({ status: AllocationStatus.RESERVED, draft_id: 'd', expires_at: new Date(now.getTime() + 1000) })], [], now).status).toBe('RESERVED');
    expect(gatePassSummary([item], [alloc({ quantity: 4, order_id: 'o1' })], [order(false)], now).status).toBe('PARTIALLY_ASSIGNED');
    expect(gatePassSummary([item], [alloc({ quantity: 10, order_id: 'o1' })], [order(false)], now).status).toBe('FULLY_ASSIGNED');
    const closed = gatePassSummary([item], [alloc({ quantity: 10, order_id: 'o1' })], [order(true)], now);
    expect(closed.status).toBe('CLOSED');
    expect(closed.closed_at).toBe(now.toISOString());
  });
});

describe('stock status (one definition for Inventory and Alerts)', () => {
  it('levels are inclusive at the reorder level', () => {
    expect(stockLevel(0, 10)).toBe('OUT');
    expect(stockLevel(10, 10)).toBe('LOW');
    expect(stockLevel(11, 10)).toBe('HEALTHY');
  });
  it('alert deficit', () => {
    expect(stockAlertInfo(0, 10)).toEqual({ severity: 'CRITICAL', deficit: 10 });
    expect(stockAlertInfo(4, 10)).toEqual({ severity: 'LOW', deficit: 6 });
    expect(stockAlertInfo(10, 10)).toEqual({ severity: 'LOW', deficit: 0 });
    expect(stockAlertInfo(20, 10)).toEqual({ severity: 'NORMAL', deficit: 0 });
  });
});

describe('job card transitions (Docs/decisions/0005)', () => {
  it('moves one column at a time', () => {
    expect(canTransitionOrder(OrderStatus.DRAFT, OrderStatus.IN_QUEUE)).toBe(true);
    expect(canTransitionOrder(OrderStatus.IN_QUEUE, OrderStatus.IN_PROGRESS)).toBe(true);
    expect(canTransitionOrder(OrderStatus.IN_PROGRESS, OrderStatus.COMPLETED)).toBe(true);
    expect(canTransitionOrder(OrderStatus.COMPLETED, OrderStatus.CLOSED)).toBe(true);
    expect(canTransitionOrder(OrderStatus.DRAFT, OrderStatus.IN_PROGRESS)).toBe(false);
    expect(canTransitionOrder(OrderStatus.IN_QUEUE, OrderStatus.COMPLETED)).toBe(false);
    expect(canTransitionOrder(OrderStatus.COMPLETED, OrderStatus.IN_PROGRESS)).toBe(false);
  });
});

describe('order display status', () => {
  it('workshop', () => {
    expect(workshopDisplayStatus(OrderStatus.DRAFT)).toBe('AWAITING_PAYMENT');
    expect(workshopDisplayStatus(OrderStatus.IN_QUEUE)).toBe('PENDING');
    // The supervisor moves the card: all sub-jobs done is still In Progress until Mark Completed
    expect(workshopDisplayStatus(OrderStatus.IN_PROGRESS)).toBe('IN_PROGRESS');
    expect(workshopDisplayStatus(OrderStatus.COMPLETED)).toBe('COMPLETED');
    expect(workshopDisplayStatus(OrderStatus.CLOSED)).toBe('CLOSED');
  });
  it('roofing', () => {
    expect(roofingDisplayStatus(OrderStatus.IN_QUEUE, [])).toBe('PLACED');
    expect(roofingDisplayStatus(OrderStatus.IN_PROGRESS, [LineStatus.COMPLETED])).toBe('READY');
    expect(roofingDisplayStatus(OrderStatus.CLOSED, [])).toBe('RELEASED');
    expect(roofingDisplayStatus(OrderStatus.VOIDED, [])).toBe('CANCELLED');
  });
});

describe('locale helpers', () => {
  it('"today" is the Colombo date, not the UTC date', () => {
    // 20:00 UTC on the 20th is 01:30 on the 21st in Colombo
    expect(toBranchDate(new Date('2026-10-20T20:00:00Z'))).toBe('2026-10-21');
  });
  it('phones match on the last 9 digits', () => {
    expect(phoneKey('077 123 4567')).toBe(phoneKey('+94771234567'));
  });
});

describe('roofing items (normalize / title / coil use)', () => {
  const roofing = DEFAULT_BRANCH_SETTINGS.roofing;
  const coil = '11111111-1111-4111-8111-111111111111';
  const orderCoil = '22222222-2222-4222-8222-222222222222';

  it('drops fields that do not belong to the item and applies the order coil', () => {
    const line = normalizeRoofingLine(
      {
        category: 'Gutter Accessories',
        job_type: 'STANDARD',
        material_source: MaterialSource.BRANCH,
        coil_item_id: coil,
        accessory_type: 'End Cap',
        accessory_variant: 'Round',
        quantity: 3,
        length_ft: 10,
        pieces: 2,
        total_cuts: 4,
        total_bends: 1,
        design_attachment_id: coil,
        pattern: 'Normal',
      },
      roofing,
      orderCoil,
    );
    expect(line).toMatchObject({ coil_item_id: orderCoil, quantity: 3, total_cuts: 0, total_bends: 0 });
    expect(line.length_ft).toBeUndefined();
    expect(line.accessory_variant).toBeUndefined(); // End Cap has no shapes
    expect(line.design_attachment_id).toBeUndefined(); // standard item: no photo
    expect(line.pattern).toBeUndefined();
  });

  it('aluminium brackets and customer material take no coil', () => {
    const bracket = normalizeRoofingLine(
      { category: 'Gutter Accessories', job_type: 'STANDARD', material_source: MaterialSource.BRANCH, accessory_type: 'Bracket (Aluminium)', quantity: 5, total_cuts: 0, total_bends: 0 },
      roofing,
      orderCoil,
    );
    expect(bracket.coil_item_id).toBeUndefined();
    expect(validateRoofingLine(bracket, roofing, false)).toEqual([]);
    const customer = normalizeRoofingLine(
      { category: 'Roofing', job_type: 'STANDARD', material_source: MaterialSource.CUSTOMER, pattern: 'Roofing', length_ft: 10, pieces: 2, total_cuts: 0, total_bends: 0 },
      roofing,
      orderCoil,
    );
    expect(customer.coil_item_id).toBeUndefined();
    expect(customer.pattern).toBeUndefined(); // patterns are for standard branch sheets only
  });

  it('a customized item needs a design photo when the branch requires one', () => {
    const line: RoofingLineInput = { category: 'Flashing', job_type: 'CUSTOMIZED', material_source: MaterialSource.BRANCH, coil_item_id: coil, length_ft: 8, pieces: 2, total_cuts: 0, total_bends: 0 };
    expect(validateRoofingLine(line, roofing, false)).toEqual(['design photo']);
    expect(validateRoofingLine(line, { ...roofing, require_design_photo: false }, false)).toEqual([]);
  });

  it('titles and coil use follow the prototype', () => {
    expect(roofingItemTitle({ category: 'Gutter Accessories', job_type: 'STANDARD', accessory_type: 'Nozzle', accessory_variant: 'Box' })).toBe('Nozzle – Box');
    expect(roofingItemTitle({ category: 'Flashing', job_type: 'CUSTOMIZED' })).toBe('Customized design');
    expect(roofingItemTitle({ category: 'Roofing', job_type: 'STANDARD', pattern: 'Tile Roofing' })).toBe('Tile Roofing');
    // BR10: only branch-material sheets deduct coil ft
    expect(lineDeductsCoil({ category: 'Roofing', material_source: MaterialSource.BRANCH })).toBe(true);
    expect(lineDeductsCoil({ category: 'Gutter Accessories', material_source: MaterialSource.BRANCH })).toBe(false);
    expect(lineDeductsCoil({ category: 'Roofing', material_source: MaterialSource.CUSTOMER })).toBe(false);
  });

  it('describes a coil with readable colour and origin', () => {
    expect(coilDetails({ thickness: '0.47mm', color: 'RED', origin: 'KR-AJN' })).toBe('0.47mm · Red · Korea – AJN Steel');
  });
});

describe('stock requests (status / who acts / request rules)', () => {
  const line = (item_id: string, quantity: number) => ({ item_id, quantity });
  const base = {
    client_request_id: '7c2f3c63-55f4-4a8e-9a43-3d7d7f9d1b11',
    supplying_branch_id: '00000000-0000-0000-0000-000000000002',
    needed_before: '2026-11-01',
  };
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';

  it('shows the prototype names for the stored statuses', () => {
    expect(transferDisplayStatus(TransferStatus.PENDING)).toBe('WAITING');
    expect(transferDisplayStatus(TransferStatus.ISSUED)).toBe('SENT');
    expect(transferDisplayStatus(TransferStatus.CONFIRMED)).toBe('RECEIVED');
    expect(isOpenTransfer(TransferStatus.ISSUED)).toBe(true);
    expect(isOpenTransfer(TransferStatus.REJECTED)).toBe(false);
  });

  it('the asked branch acts on a waiting request, the asking branch on a sent one', () => {
    expect(transferNeedsAction(TransferStatus.PENDING, 'INCOMING')).toBe(true);
    expect(transferNeedsAction(TransferStatus.PENDING, 'OUTGOING')).toBe(false);
    expect(transferNeedsAction(TransferStatus.ISSUED, 'OUTGOING')).toBe(true);
    expect(transferNeedsAction(TransferStatus.CONFIRMED, 'OUTGOING')).toBe(false);
  });

  it('lists each item once, with a positive amount of at most 3 decimals', () => {
    expect(CreateStockTransferSchema.safeParse({ ...base, lines: [line(A, 2), line(B, 0.5)] }).success).toBe(true);
    expect(CreateStockTransferSchema.safeParse({ ...base, lines: [line(A, 2), line(A, 1)] }).success).toBe(false);
    expect(CreateStockTransferSchema.safeParse({ ...base, lines: [line(A, 0)] }).success).toBe(false);
    expect(CreateStockTransferSchema.safeParse({ ...base, lines: [line(A, 1.2345)] }).success).toBe(false);
    expect(CreateStockTransferSchema.safeParse({ ...base, lines: [] }).success).toBe(false);
  });
});

describe('hardware sales (Docs/decisions/0006)', () => {
  it('awaiting payment either closes when paid or is cancelled — nothing else', () => {
    expect(canTransitionHardware(OrderStatus.IN_QUEUE, OrderStatus.CLOSED)).toBe(true);
    expect(canTransitionHardware(OrderStatus.IN_QUEUE, OrderStatus.VOIDED)).toBe(true);
    expect(canTransitionHardware(OrderStatus.IN_QUEUE, OrderStatus.IN_PROGRESS)).toBe(false);
    expect(canTransitionHardware(OrderStatus.CLOSED, OrderStatus.VOIDED)).toBe(false);
    expect(canTransitionHardware(OrderStatus.VOIDED, OrderStatus.CLOSED)).toBe(false);
    expect(canTransitionHardware(OrderStatus.DRAFT, OrderStatus.CLOSED)).toBe(false);
    // The job card table is untouched: IN_QUEUE → CLOSED stays closed to job cards
    expect(canTransitionOrder(OrderStatus.IN_QUEUE, OrderStatus.CLOSED)).toBe(false);
  });

  it('lines are handed over or dropped with the order', () => {
    expect(canTransitionHardwareLine(LineStatus.PENDING, LineStatus.COMPLETED)).toBe(true);
    expect(canTransitionHardwareLine(LineStatus.PENDING, LineStatus.CANCELLED)).toBe(true);
    expect(canTransitionHardwareLine(LineStatus.COMPLETED, LineStatus.CANCELLED)).toBe(false);
  });

  it('display status', () => {
    expect(hardwareDisplayStatus(OrderStatus.IN_QUEUE)).toBe('AWAITING_PAYMENT');
    expect(hardwareDisplayStatus(OrderStatus.CLOSED)).toBe('PAID');
    expect(hardwareDisplayStatus(OrderStatus.VOIDED)).toBe('CANCELLED');
  });

  it('line total in cents, decimal quantities without float drift', () => {
    expect(hardwareLineTotal(125_000, 3)).toBe(375_000);
    expect(hardwareLineTotal(145_000, 0.3)).toBe(43_500); // 0.3 kg welding rod
    expect(hardwareLineTotal(333, 1.5)).toBe(500); // 499.5 rounds half up
    expect(hardwareLineTotal(1, 0.001)).toBe(0);
    expect(hardwareLineTotal(10_000, 0.1 + 0.2)).toBe(3_000);
  });

  it('cross-branch advance: at least the minimum, always less than the total', () => {
    expect(hardwareAdvanceRange(10_000, 30)).toEqual({ min: 3_000, max: 9_999 });
    expect(hardwareAdvanceRange(10_001, 30)).toEqual({ min: 3_001, max: 10_000 });
    expect(hardwareAdvanceRange(10_000, 0)).toEqual({ min: 1, max: 9_999 });
  });

  it('create: unique items, up to 3 decimals, no price from the client', () => {
    const base = { client_request_id: '3f1c1d2e-1111-4222-8333-444455556666' };
    const A = '0b1c1d2e-1111-4222-8333-444455556666';
    const B = '1b1c1d2e-1111-4222-8333-444455556666';
    expect(CreateHardwareSaleSchema.safeParse({ ...base, lines: [{ item_id: A, quantity: 2.5 }] }).success).toBe(true);
    expect(CreateHardwareSaleSchema.safeParse({ ...base, lines: [{ item_id: A, quantity: 1.2345 }] }).success).toBe(false);
    expect(CreateHardwareSaleSchema.safeParse({ ...base, lines: [{ item_id: A, quantity: 0 }] }).success).toBe(false);
    expect(CreateHardwareSaleSchema.safeParse({ ...base, lines: [] }).success).toBe(false);
    expect(CreateHardwareSaleSchema.safeParse({ ...base, lines: [{ item_id: A, quantity: 1 }, { item_id: A, quantity: 2 }] }).success).toBe(false);
    const parsed = CreateHardwareSaleSchema.parse({ ...base, lines: [{ item_id: B, quantity: 1, unit_price: 1 }] });
    expect('unit_price' in parsed.lines[0]).toBe(false);
  });
});
