import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import {
  DEFAULT_BRANCH_SETTINGS,
  ERR_CODES,
  MaterialSource,
  OrderStatus,
  ROOFING_CATEGORIES,
  isAccessoryCategory,
  isSearchablePhone,
  lineNeedsCoil,
  lineNeedsPattern,
  normalizeRoofingLine,
  runningFt,
  validateRoofingLine,
  type RoofingCategory,
  type RoofingJobType,
  type StockOverride,
} from '@erp/shared';
import type { OrderFormSearch } from '@/app/search-params';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { ChoiceTiles, SectionHeader, Segmented, StepLabel } from '@/shared/components/FormSection';
import { Icon, type IconName } from '@/shared/components/Icon';
import { Notice } from '@/shared/components/Notice';
import { PageTabs } from '@/shared/components/PageTabs';
import { PaymentCapture } from '@/shared/components/PaymentCapture';
import { SearchableSelect, type SelectOption } from '@/shared/components/SearchableSelect';
import { StockOverrideDialog, type StockShortageDetails } from '@/shared/components/StockOverrideDialog';
import { apiError, newRequestId } from '@/shared/api/errors';
import { useBranchContext } from '@/shared/hooks/useBranchContext';
import { readFormDraft, useFormDraft } from '@/shared/hooks/useFormDraft';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import { usePermission } from '@/shared/hooks/usePermission';
import { centsToInput, formatRs, parseMoney } from '@/shared/lib/format';
import { emptyPaymentDraft, toPayment, validatePaymentDraft, type PaymentDraft } from '@/shared/lib/payment-draft';
import { CustomerPhoneInput } from '@/modules/customers/components/CustomerPhoneInput';
import { CustomerMaterialPanel } from '@/modules/gate-passes/components/CustomerMaterialPanel';
import { useAvailableGatePasses, useGatePass, type GatePassDto } from '@/modules/gate-passes/hooks/useGatePasses';
import { customerMaterialOptions, materialLabel, materialSpecs, suggestedPieces, usedByCard } from '@/modules/gate-passes/lib/customer-material';
import { useActiveWorkers, useOrderDetail, type OrderDetailDto } from '@/modules/orders/hooks/useOrders';
import { OrderHistoryPanel } from '@/modules/orders/components/OrderHistoryPanel';
import { DesignPhotoField } from '@/modules/roofing/components/DesignPhotoField';
import { OrderDetailModal } from '@/modules/roofing/components/OrderDetailModal';
import { OrderItemRow } from '@/modules/roofing/components/OrderItemRow';
import { useCoils, usePlaceRoofingOrder, useRoofingQuote, useUpdateRoofingOrder } from '@/modules/roofing/hooks/useRoofing';
import {
  draftItems,
  emptyAccessoryRow,
  emptyDraft,
  fromLineSpec,
  materialUse,
  newKey,
  toDraft,
  toLine,
  type AccessoryRow,
  type ItemDraft,
  type OrderItem,
} from '@/modules/roofing/lib/order-items';

const CATEGORY_ICONS: Record<RoofingCategory, IconName> = {
  Roofing: 'house',
  Cladding: 'layers',
  Flashing: 'cornerDownRight',
  Gutter: 'droplets',
  'Down Pipe': 'arrowDownToLine',
  Wadimbu: 'spline',
  'Valley Gutter': 'chevronsDown',
  'Ridge Cap': 'triangle',
  'Gutter Accessories': 'wrench',
};

const inputCls =
  'block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm';
const labelCls = 'mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500';

const numberValue = (v?: number) => (v === undefined || v === null ? '' : v);
const parseNumber = (v: string) => (v === '' ? undefined : Number(v));

/** Everything typed on Create Order, kept while the user visits other pages (sessionStorage, see useFormDraft). */
interface SavedDraft {
  phone: string;
  name: string;
  technician: string;
  items: OrderItem[];
  useGlobalCoil: boolean;
  globalCoil: string;
  discount: string;
  /** The item editor, half filled */
  editor: ItemDraft | null;
  rows: AccessoryRow[] | null;
  editingKey: string | null;
  payment: PaymentDraft | null;
  /** Material of the last item added; the next one starts with it */
  lastSource?: MaterialSource;
}

interface InitialState extends Omit<SavedDraft, 'lastSource'> {
  lastSource: MaterialSource;
  /** The form was filled from a saved draft */
  restored: boolean;
}

/** The first item on a pass that still has material. */
const firstAvailableItem = (gp: GatePassDto) => gp.summary.item_balances.find((b) => b.available > 0)?.gp_item_id ?? '';
const isSamePhone = (a: string, b: string) => a.replace(/\D/g, '').slice(-9) === b.replace(/\D/g, '').slice(-9);

/**
 * Loads what the form starts from (the order being edited, or for a new order the
 * draft kept from an earlier visit, and a gate pass to take material from), then
 * mounts it. Edit pages always start from the server.
 */
export function OrderFormPage() {
  const params = useParams({ strict: false }) as { orderId?: string };
  const search = useSearch({ strict: false }) as OrderFormSearch;
  const orderId = params.orderId;
  const [saved] = useState(() => (orderId ? null : readFormDraft<SavedDraft>('order')));
  const existingQ = useOrderDetail(orderId);
  const linkedQ = useGatePass(search.gatePass);

  const waiting = (!!orderId && existingQ.isPending) || (!!search.gatePass && linkedQ.isPending);
  if (waiting) return <div className="py-24 text-center text-sm text-slate-400">Loading…</div>;

  const existing = existingQ.data;
  const linked = linkedQ.data ?? null;
  let initial: InitialState = {
    phone: '',
    name: '',
    technician: '',
    items: [],
    useGlobalCoil: false,
    globalCoil: '',
    discount: '',
    editor: null,
    rows: null,
    editingKey: null,
    payment: null,
    lastSource: MaterialSource.BRANCH,
    restored: false,
  };
  if (saved) {
    initial = {
      ...initial,
      phone: saved.phone,
      name: saved.name,
      technician: saved.technician,
      items: saved.items,
      useGlobalCoil: saved.useGlobalCoil,
      globalCoil: saved.globalCoil,
      discount: saved.discount,
      editor: saved.editor,
      rows: saved.rows,
      editingKey: saved.editingKey,
      payment: saved.payment,
      lastSource: saved.lastSource ?? MaterialSource.BRANCH,
      restored: true,
    };
  } else if (existing) {
    initial = {
      ...initial,
      phone: existing.customer?.phone ?? '',
      name: existing.customer?.name ?? '',
      technician: existing.header.technician ?? '',
      items: existing.lines.filter((l) => l.status !== 'CANCELLED').map((l) => fromLineSpec(l.spec, l.line_id)),
      useGlobalCoil: !!existing.header.global_coil_item_id,
      globalCoil: existing.header.global_coil_item_id ?? '',
      discount: existing.discount ? centsToInput(existing.discount) : '',
    };
  }
  // Came from a gate pass (details, or just created): the next item takes its material
  if (linked && (!initial.phone || isSamePhone(initial.phone, linked.customer_phone))) {
    initial = {
      ...initial,
      phone: initial.phone || linked.customer_phone,
      name: initial.name || linked.customer_name,
      lastSource: MaterialSource.CUSTOMER,
      editor: initial.editingKey
        ? initial.editor
        : {
            ...(initial.editor ?? emptyDraft(MaterialSource.CUSTOMER)),
            material_source: MaterialSource.CUSTOMER,
            gp_item_id: firstAvailableItem(linked),
            gp_quantity: '',
          },
    };
  }
  return <OrderForm key={orderId ?? 'new'} orderId={orderId} existing={existing} initial={initial} />;
}

function OrderForm({ orderId, existing, initial }: { orderId?: string; existing?: OrderDetailDto; initial: InitialState }) {
  const navigate = useNavigate();
  const isEdit = !!orderId;
  const online = useOnlineStatus();
  const { can } = usePermission();
  const { settings, featureOn } = useBranchContext();
  const roofing = settings?.roofing ?? DEFAULT_BRANCH_SETTINGS.roofing;
  const general = settings?.general ?? DEFAULT_BRANCH_SETTINGS.general;
  const policy = settings?.orders ?? DEFAULT_BRANCH_SETTINGS.orders;

  // Only the cashier takes the payment and gives a discount; anyone else submits the order to the
  // Cashier Queue (Awaiting Payment), as a job card is
  const takesPayment = can('process', 'payment');
  // An unpaid order still at the cashier is edited by whoever creates orders. Once money is taken or
  // it is in the Order Queue, it is the cashier's edit, until work starts and while the manager allows it.
  const unpaidDraft = !!existing && existing.status === OrderStatus.DRAFT && existing.paid_amount === 0;
  const editLockedReason =
    !existing || unpaidDraft
      ? null
      : existing.status !== OrderStatus.IN_QUEUE && existing.status !== OrderStatus.DRAFT
        ? `This order is ${existing.display_label.toLowerCase()} and can no longer be edited.`
        : !can('edit', 'order')
          ? 'A payment has been taken on this order, so only the cashier can edit it.'
          : !policy.allow_cashier_edit_before_start
            ? 'The branch manager has turned off editing placed orders.'
            : !existing.can_edit
              ? 'Work has started on this order, so it can no longer be edited.'
              : null;
  // Who may record a gate pass is set on Role Permissions (create:gate_pass)
  const canCreateGatePass = can('create', 'gate_pass');
  // Customer material always comes from a gate pass item (Docs/decisions/0007). Using a pass on an
  // order is allocate:gate_pass_order; an order that already has customer items keeps showing them.
  const hasCustomerItems = initial.items.some((i) => i.material_source === MaterialSource.CUSTOMER);
  const customerOn = general.allow_customer_material && featureOn('gatePass') && (can('allocate', 'gate_pass_order') || hasCustomerItems);

  const place = usePlaceRoofingOrder();
  const update = useUpdateRoofingOrder(orderId ?? '');
  const requestId = useRef(newRequestId());
  const coilsQ = useCoils();
  const coils = useMemo(() => coilsQ.data ?? [], [coilsQ.data]);

  // ── Order details ─────────────────────────────────────────────────────────
  const [phone, setPhone] = useState(initial.phone);
  const [name, setName] = useState(initial.name);
  const [technician, setTechnician] = useState(initial.technician);
  const workersQ = useActiveWorkers();
  // The order stores the worker's name; keep a saved name selectable even if that worker was since deactivated.
  const workerOptions = useMemo<SelectOption[]>(() => {
    const opts = (workersQ.data ?? []).map((w) => ({
      value: w.full_name,
      label: w.full_name,
      hint: [w.employee_code, w.designation].filter(Boolean).join(' · '),
    }));
    if (technician && !opts.some((o) => o.value === technician)) opts.unshift({ value: technician, label: technician, hint: '' });
    return opts;
  }, [workersQ.data, technician]);
  const [useGlobalCoil, setUseGlobalCoil] = useState(initial.useGlobalCoil);
  const [globalCoil, setGlobalCoil] = useState(initial.globalCoil);
  const [items, setItems] = useState<OrderItem[]>(initial.items);

  // ── Item editor ───────────────────────────────────────────────────────────
  const [lastSource, setLastSource] = useState<MaterialSource>(customerOn ? initial.lastSource : MaterialSource.BRANCH);
  const [draft, setDraft] = useState<ItemDraft>(() => initial.editor ?? emptyDraft(customerOn ? initial.lastSource : MaterialSource.BRANCH));
  const [rows, setRows] = useState<AccessoryRow[]>(() => initial.rows ?? [emptyAccessoryRow()]);
  const [editingKey, setEditingKey] = useState<string | null>(initial.editingKey);

  // ── Pricing & payment ─────────────────────────────────────────────────────
  const [discountInput, setDiscountInput] = useState(initial.discount);
  const [payment, setPayment] = useState<PaymentDraft>(() => initial.payment ?? emptyPaymentDraft(general.payment_modes[0]));
  const [placed, setPlaced] = useState<{
    orderId: string;
    orderNumber: string;
    total: number;
    paid: number;
    unpaid: boolean;
    minToPlace: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Placing holds branch coil; not enough available asks for a stock override (Docs/decisions/0003)
  const [shortage, setShortage] = useState<StockShortageDetails | null>(null);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [restored, setRestored] = useState(initial.restored);
  const [confirmClear, setConfirmClear] = useState(false);
  const [historyOrderId, setHistoryOrderId] = useState<string | null>(null);
  // Create / History tabs on a new order (the edit page is only the form); the tab lives in the URL
  const search = useSearch({ strict: false }) as OrderFormSearch;
  const tab: 'create' | 'history' = !isEdit && search.tab === 'history' ? 'history' : 'create';
  // History mounts on first visit and then stays, so its filters survive switching back and forth
  const [historySeen, setHistorySeen] = useState(tab === 'history');
  const setTab = (t: 'create' | 'history') => {
    if (t === 'history') setHistorySeen(true);
    void navigate({
      to: '/orders/new',
      search: {
        gatePass: search.gatePass,
        tab: t === 'history' ? 'history' : undefined,
      },
      replace: true,
    });
  };

  // ── Draft: a new order is kept while the user visits other pages ──────────
  const draftValue: SavedDraft = {
    phone,
    name,
    technician,
    items,
    useGlobalCoil,
    globalCoil,
    discount: discountInput,
    editor: draft,
    rows,
    editingKey,
    payment,
    lastSource,
  };
  const isBlank = (d: SavedDraft) =>
    !d.phone.trim() &&
    !d.name.trim() &&
    !d.technician.trim() &&
    d.items.length === 0 &&
    !d.useGlobalCoil &&
    !d.globalCoil &&
    !d.discount &&
    !d.editingKey &&
    !d.payment?.amount &&
    !d.payment?.reference &&
    (!d.editor || sameJson(d.editor, emptyDraft(d.editor.material_source, d.editor.category, d.editor.job_type))) &&
    (!d.rows || (d.rows.length === 1 && sameJson({ ...d.rows[0], key: '' }, { ...emptyAccessoryRow(), key: '' })));
  const clearDraft = useFormDraft('order', draftValue, {
    enabled: !isEdit,
    isEmpty: isBlank,
  });
  const formIsBlank = isBlank(draftValue);

  // ── Customer material: the customer's gate pass items (Docs/decisions/0007) ─
  const phoneReady = isSearchablePhone(phone);
  const passesQ = useAvailableGatePasses(phone, customerOn && (phoneReady || isEdit), orderId);
  // The order's saved material counts as used on the server; it is this order's to use again
  const [committed] = useState(() => {
    const c: Record<string, number> = {};
    for (const m of existing?.customer_materials ?? []) c[m.gp_item_id] = (c[m.gp_item_id] ?? 0) + m.quantity;
    return c;
  });
  const options = useMemo(() => customerMaterialOptions(passesQ.data ?? [], committed), [passesQ.data, committed]);
  const usedOnOrder = useMemo(() => usedByCard(items.map(materialUse)), [items]);
  const usedByOthers = useMemo(() => usedByCard(items.map(materialUse), editingKey), [items, editingKey]);
  const editorMaterials = useMemo(
    () =>
      options.map((o) => ({
        ...o,
        left: o.max - (usedByOthers[o.gp_item_id] ?? 0),
      })),
    [options, usedByOthers],
  );
  const materialNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const l of existing?.lines ?? []) {
      const m = l.customer_material;
      if (m)
        names[m.gp_item_id] = materialLabel({
          pass_number: m.pass_number,
          material_type: m.material_type,
          specs: materialSpecs(m),
        });
    }
    for (const o of options) names[o.gp_item_id] = materialLabel(o);
    return names;
  }, [existing, options]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const categories = ROOFING_CATEGORIES.filter((c) => roofing.categories.includes(c));
  const coilOptions = useMemo<SelectOption[]>(
    () =>
      coils.map((c) => ({
        value: c.item_id,
        label: c.sku,
        hint: `${c.details} · ${c.stock_ft > 0 ? `${c.stock_ft.toLocaleString()} ft available` : 'none available'}`,
      })),
    [coils],
  );
  const coilLabel = (id?: string | null) => {
    const c = coils.find((x) => x.item_id === id);
    return c ? `${c.sku} · ${c.details}` : null;
  };

  // The order coil is for Branch Stock items, so the step shows while there is one (or one is being added)
  const showGlobalCoil =
    roofing.allow_single_coil && (draft.material_source === MaterialSource.BRANCH || items.some((i) => i.material_source === MaterialSource.BRANCH));
  const orderCoil = useGlobalCoil && showGlobalCoil && globalCoil ? globalCoil : undefined;

  const accessory = !!draft.category && isAccessoryCategory(draft.category);
  const custom = draft.job_type === 'CUSTOMIZED';
  const onCustomer = draft.material_source === MaterialSource.CUSTOMER;
  const pickedMaterial = editorMaterials.find((m) => m.gp_item_id === draft.gp_item_id);
  // Pieces of the customer's material a sheet item needs, from its size; used while Pieces Used is empty
  const suggestion = onCustomer && !accessory ? suggestedPieces(pickedMaterial, draft.length_ft, draft.pieces) : null;
  const piecesUsed = draft.gp_quantity || (suggestion ? String(suggestion.pieces) : '');
  const editorItems = useMemo(() => draftItems({ ...draft, gp_quantity: piecesUsed }, rows), [draft, piecesUsed, rows]);
  const piecesMissing =
    !onCustomer || !draft.gp_item_id
      ? []
      : (Number(piecesUsed) || 0) < 1
        ? ['pieces used']
        : pickedMaterial && Number(piecesUsed) > pickedMaterial.left
          ? [`only ${Math.max(0, pickedMaterial.left)} pieces left on that gate pass item`]
          : [];
  const missingFields = [...new Set([...editorItems.flatMap((i) => validateRoofingLine(i, roofing, useGlobalCoil && showGlobalCoil)), ...piecesMissing])];
  const patternOptions = useMemo<SelectOption[]>(
    () => (draft.category ? (roofing.patterns[draft.category] ?? []) : []).map((p) => ({ value: p, label: p })),
    [draft.category, roofing.patterns],
  );
  const accessoryOptions = useMemo<SelectOption[]>(
    () =>
      roofing.accessories.map((a) => ({
        value: a.name,
        label: a.name,
        hint: a.variants.length ? a.variants.join(' / ') : undefined,
      })),
    [roofing.accessories],
  );

  const lines = useMemo(() => items.map(toLine), [items]);
  // Typed advances are left out of the quote, so typing one costs no request; the advances are added up here
  const quoteLines = useMemo(() => lines.map((l) => ({ ...l, advance: undefined })), [lines]);
  // Only the cashier gives a discount; others keep what the order already has
  const discount = takesPayment ? parseMoney(discountInput || '0') : (existing?.discount ?? 0);
  const quoteQ = useRoofingQuote({
    lines: quoteLines,
    global_coil_item_id: orderCoil,
    discount,
  });
  const quote = quoteQ.data;
  const priceByKey = useMemo(() => new Map(items.map((it, i) => [it.key, quote?.lines[i]])), [items, quote]);
  const missingRates = [...new Set((quote?.missing_rates ?? []).map((m) => m.missing))];
  const subtotal = quote?.subtotal ?? 0;
  const total = quote?.total ?? 0;
  const maxDiscount = quote?.max_discount ?? 0;
  // Each item's advance, as on a job card (Docs/decisions/0011): fixed on standard items, typed on customized ones
  const advances = useMemo(
    () =>
      items.map((it, i) => {
        const p = quote?.lines[i];
        if (!p) return { value: 0, suggested: 0, editable: false, over: false };
        const value = p.advance_editable && it.advance_text?.trim() ? parseMoney(it.advance_text) : p.suggested_advance;
        return { value, suggested: p.suggested_advance, editable: p.advance_editable, over: value > p.line_total };
      }),
    [items, quote],
  );
  const advanceByKey = useMemo(() => new Map(items.map((it, i) => [it.key, advances[i]])), [items, advances]);
  const advanceOver = advances.some((a) => a.over);
  // The order's minimum to place is the sum of the item advances, never more than the total
  const minToPlace = Math.min(
    total,
    advances.reduce((sum, a) => sum + a.value, 0),
  );
  const setAdvance = (key: string, advance: string) => setItems((list) => list.map((i) => (i.key === key ? { ...i, advance_text: advance } : i)));
  const alreadyPaid = existing?.paid_amount ?? 0;
  // Older orders held customer material for the whole order, not per item
  const unlinked = items.some((i) => i.material_source === MaterialSource.CUSTOMER && !i.customer_material);

  const grouped = useMemo(
    () =>
      ROOFING_CATEGORIES.map((c) => ({
        key: c,
        items: items.filter((i) => i.category === c),
      })).filter((g) => g.items.length > 0),
    [items],
  );
  const summary = {
    branch: items.filter((i) => i.material_source === MaterialSource.BRANCH).length,
    customer: items.filter((i) => i.material_source === MaterialSource.CUSTOMER).length,
    ft: items.reduce((s, i) => s + runningFt(i), 0),
  };

  // ── Actions ───────────────────────────────────────────────────────────────
  const setField = <K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const updateRow = (key: string, patch: Partial<AccessoryRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const changeItemSource = (source: MaterialSource) =>
    setDraft((d) => {
      const next = { ...d, material_source: source };
      // Switching to the customer's material with only one item left: pick it
      if (source === MaterialSource.CUSTOMER && !next.gp_item_id) {
        const open = editorMaterials.filter((m) => m.left > 0);
        if (open.length === 1) next.gp_item_id = open[0].gp_item_id;
      }
      return next;
    });

  const selectCategory = (category: RoofingCategory) => {
    setDraft((d) => ({
      ...d,
      category,
      pattern: undefined,
      accessory_type: undefined,
      accessory_variant: undefined,
    }));
    setRows([emptyAccessoryRow()]);
  };

  const resetEditor = (keepCategory = true, source = lastSource) => {
    setEditingKey(null);
    setRows([emptyAccessoryRow()]);
    setDraft((d) => (keepCategory ? emptyDraft(source, d.category, d.job_type, d.coil_item_id ?? undefined) : emptyDraft(source)));
  };

  const saveItem = () => {
    if (missingFields.length) return;
    const coilForAll = useGlobalCoil && showGlobalCoil ? globalCoil || null : null;
    const next = editorItems.map((line, i) => ({
      ...normalizeRoofingLine(line, roofing, coilForAll),
      key: (i === 0 && editingKey) || newKey(),
    }));
    setItems((list) => (editingKey ? list.map((i) => (i.key === editingKey ? next[0] : i)) : [...next, ...list]));
    setLastSource(draft.material_source);
    resetEditor(true, draft.material_source);
  };

  const startEditing = (item: OrderItem) => {
    setEditingKey(item.key);
    setDraft(toDraft(item));
    setRows([
      {
        key: newKey(),
        accessory_type: item.accessory_type,
        accessory_variant: item.accessory_variant,
        quantity: item.quantity,
        coil_item_id: item.coil_item_id ?? undefined,
        design_attachment_id: item.design_attachment_id ?? undefined,
        remarks: item.remarks,
      },
    ]);
    document.getElementById('order-item-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const duplicateItem = (item: OrderItem) =>
    setItems((list) => {
      const at = list.findIndex((i) => i.key === item.key);
      // A copy is a new line, never the saved one
      const copy = { ...item, key: newKey(), line_id: undefined };
      return [...list.slice(0, at + 1), copy, ...list.slice(at + 1)];
    });

  const removeItem = (key: string) => {
    setItems((list) => list.filter((i) => i.key !== key));
    if (editingKey === key) resetEditor();
  };

  const goCreateGatePass = () => {
    // A new order is already kept as a draft; it is waiting when the user comes back
    void navigate({
      to: '/gate-pass',
      search: { tab: 'create', return_to: 'order', phone, name },
    });
  };

  const resetForm = () => {
    setPhone('');
    setName('');
    setTechnician('');
    setUseGlobalCoil(false);
    setGlobalCoil('');
    setItems([]);
    setEditingKey(null);
    setLastSource(MaterialSource.BRANCH);
    setDraft(emptyDraft(MaterialSource.BRANCH));
    setRows([emptyAccessoryRow()]);
    setDiscountInput('');
    setPayment(emptyPaymentDraft(general.payment_modes[0]));
    setRestored(false);
    clearDraft();
    requestId.current = newRequestId();
  };

  const clearAll = () => {
    setConfirmClear(false);
    setError(null);
    setPlaced(null);
    resetForm();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancel = () => {
    if (isEdit) {
      void navigate({ to: '/order-queue', search: { notice: undefined } });
      return;
    }
    resetForm();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (editLockedReason) return setError(editLockedReason);
    if (!phone.trim() || !name.trim()) return setError('Please enter the customer phone and name. The supervisor needs them to release the order.');
    if (items.length === 0) return setError('Please add at least one item.');
    if (useGlobalCoil && showGlobalCoil && !globalCoil && items.some((i) => lineNeedsCoil(i, roofing))) {
      return setError(`Please choose the coil for the whole order.`);
    }
    if (!(useGlobalCoil && showGlobalCoil) && items.some((i) => lineNeedsCoil(i, roofing) && !i.coil_item_id)) {
      return setError('Some items have no coil selected. Please edit them and choose a coil.');
    }
    if (unlinked) return setError("Pick the gate pass item for each item on the customer's material.");
    const over = options.find((o) => (usedOnOrder[o.gp_item_id] ?? 0) > o.max);
    if (over) return setError(`The items use more ${over.material_type} than is left on ${over.pass_number} (${over.max}).`);
    if (missingRates.length > 0) return setError(`No rate set for: ${missingRates.join(', ')}. Ask the branch manager to add it in Order Settings.`);
    if (discount > maxDiscount) return setError(`The discount can't be more than ${policy.max_discount_pct}% (${formatRs(maxDiscount)}).`);
    if (advanceOver) return setError("An item's advance is more than its total.");
    if (!isEdit && takesPayment) {
      const payError = validatePaymentDraft(payment, {
        min: minToPlace,
        max: total,
        requireReference: general.require_payment_reference,
      });
      if (payError) return setError(payError);
      if (!online) return setError("Payments can't be taken offline (BR18). Reconnect to place the order.");
    }
    await save();
  };

  const save = async (override?: StockOverride) => {
    setOverrideError(null);
    const body = {
      customer: { phone: phone.trim(), name: name.trim() },
      technician: technician.trim() || undefined,
      global_coil_item_id: orderCoil ?? null,
      lines,
      discount,
      override,
    };
    try {
      if (isEdit && existing) {
        const res = await update.mutateAsync({
          ...body,
          version: existing.version,
        });
        const notice = `Order ${res.order_number} updated.`;
        // Orders still at the cashier are not on the Order Queue; go back to History
        if (res.status === OrderStatus.DRAFT)
          void navigate({
            to: '/orders/new',
            search: { tab: 'history', notice },
          });
        else void navigate({ to: '/order-queue', search: { notice } });
        return;
      }
      const res = await place.mutateAsync({
        ...body,
        client_request_id: requestId.current,
        ...(takesPayment ? { payment: toPayment(payment) } : {}),
      });
      setShortage(null);
      setPlaced({
        orderId: res.order_id,
        orderNumber: res.order_number,
        total: res.total,
        paid: res.paid_amount,
        unpaid: res.status === OrderStatus.DRAFT,
        minToPlace: res.min_advance,
      });
      resetForm();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const info = apiError(err);
      if (info.code === 'STK_001') setShortage(info.details as StockShortageDetails);
      else if (info.code === ERR_CODES.ORDER_TOTAL_BELOW_PAID) {
        // No refunds (BR16): the edited order must still cost at least what was paid
        const d = info.details as { paid: number; new_total: number };
        setError(`The new total ${formatRs(d.new_total)} is below the ${formatRs(d.paid)} already paid. There are no refunds — keep the total at ${formatRs(d.paid)} or more.`);
      } else if (override) setOverrideError(info.message);
      else setError(info.message);
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const coilField = (value: string | null | undefined, onChange: (v: string | undefined) => void) => (
    <div className="sm:col-span-7">
      <label className={labelCls}>Coil {!useGlobalCoil && <span className="text-red-500">*</span>}</label>
      {useGlobalCoil && showGlobalCoil ? (
        <div className="flex items-center rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-700">
          <Icon name="lock" className="mr-2 h-4 w-4 shrink-0 text-gray-400" />
          <span className="truncate">{coilLabel(globalCoil) ?? 'Choose the order coil above'}</span>
        </div>
      ) : (
        <SearchableSelect
          options={coilOptions}
          value={value ?? undefined}
          onChange={(v) => onChange(v || undefined)}
          placeholder="Search coil no., thickness, colour or country…"
          invalid={!value}
        />
      )}
    </div>
  );

  let step = 0;
  const nextStep = () => ++step;
  const busy = place.isPending || update.isPending;

  return (
    <div className="mx-auto mb-10 max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{isEdit ? `Edit Order ${existing?.order_number ?? ''}` : 'Create Order'}</h1>
          {/* <p className="mt-1 text-sm text-gray-500">
            {isEdit
              ? 'Change the order before work starts. Prices are recalculated; payments already taken are kept.'
              : `Roofing, cladding, gutter and flashing orders for ${branch?.name ?? 'this branch'}. Placing an order sends it to the Order Queue.`}
          </p> */}
        </div>
        {!isEdit && tab === 'create' && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              disabled={formIsBlank}
              className="btn-secondary inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Icon name="x" className="h-4 w-4" />
              Clear all
            </button>
          </div>
        )}
      </div>

      <div className={isEdit ? '' : 'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'}>
        {!isEdit && (
          <PageTabs
            tabs={[
              { value: 'create', label: 'Create Order', icon: 'plus' },
              { value: 'history', label: 'Order History', icon: 'clock' },
            ]}
            value={tab}
            onChange={setTab}
          />
        )}
        {/* The form stays mounted on the History tab, so nothing typed is lost */}
        <div className={tab === 'history' ? 'hidden' : ''}>
          <div className={isEdit ? '' : 'px-6 pt-6 empty:hidden'}>
            {restored && !formIsBlank && (
              <Notice tone="info" className="mb-4">
                Your unfinished order was kept while you were away. Carry on, or use Clear all to start again.
              </Notice>
            )}

            {placed && (
              <div className="mb-6 flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <Icon name="checkCircle" className="h-6 w-6 shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-sm font-bold text-emerald-900">
                      {placed.unpaid ? `Order ${placed.orderNumber} created and sent to the Cashier Queue` : `Order ${placed.orderNumber} placed`}
                    </p>
                    <p className="mt-0.5 text-xs text-emerald-800">
                      {placed.unpaid
                        ? `Total ${formatRs(placed.total)} · Minimum to collect ${formatRs(placed.minToPlace)}`
                        : `Total ${formatRs(placed.total)} · Paid ${formatRs(placed.paid)} · Balance ${formatRs(Math.max(0, placed.total - placed.paid))}`}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPlaced(null)}
                    className="rounded-md px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    New Order
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryOrderId(placed.orderId)}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    Open Order <Icon name="arrowRight" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {editLockedReason && (
              <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <Icon name="lock" className="h-5 w-5 shrink-0 text-amber-600" />
                <span>{editLockedReason} Changes can't be saved.</span>
              </div>
            )}
          </div>
          <div className={isEdit ? 'rounded-lg border border-gray-200 bg-white shadow-sm' : ''}>
            <form onSubmit={submit}>
              {/* 1. Customer & order details (the order date is stamped by the server on create) */}
              <div className="border-b border-gray-200 p-6">
                <SectionHeader step={nextStep()} title="Customer & Order Details" />
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                  <div>
                    <label className={labelCls}>
                      Customer Phone <span className="text-red-500">*</span>
                    </label>
                    <CustomerPhoneInput
                      required
                      value={phone}
                      onChange={setPhone}
                      onSelect={(c) => {
                        setPhone(c.phone);
                        setName(c.name);
                      }}
                      className={inputCls}
                      placeholder="+94 77 xxxx xxx"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>
                      Customer Name <span className="text-red-500">*</span>
                    </label>
                    <input required type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Worker</label>
                    <SearchableSelect
                      options={workerOptions}
                      value={technician || undefined}
                      onChange={setTechnician}
                      placeholder={workersQ.isLoading ? 'Loading…' : 'Select worker'}
                    />
                  </div>
                </div>
                {customerOn && (
                  <CustomerMaterialPanel
                    phoneReady={phoneReady}
                    loading={passesQ.isLoading}
                    options={options}
                    used={usedOnOrder}
                    canCreate={canCreateGatePass}
                    onCreateNew={goCreateGatePass}
                  />
                )}
              </div>

              {unlinked && !editLockedReason && (
                <div className="border-b border-gray-200 px-6 py-4">
                  <Notice tone="warning">Some items on the customer's material have no gate pass item yet. Edit each one and pick the item it uses.</Notice>
                </div>
              )}

              {/* 2. Coil for the whole order (Branch Stock items) */}
              {showGlobalCoil && (
                <div className="border-b border-gray-200 p-6">
                  <SectionHeader
                    step={nextStep()}
                    title="Coil for the Whole Order"
                    hint="Turn this on when every item uses the same coil (same thickness, colour and origin)."
                  />
                  <label className="inline-flex cursor-pointer select-none items-center">
                    <input
                      type="checkbox"
                      checked={useGlobalCoil}
                      onChange={(e) => setUseGlobalCoil(e.target.checked)}
                      className="h-5 w-5 rounded border-gray-300 text-blue-600"
                    />
                    <span className="ml-2 text-sm font-medium text-gray-800">Use the same coil for all items</span>
                  </label>
                  {useGlobalCoil && (
                    <div className="mt-4 max-w-xl">
                      <label className={labelCls}>Order Coil</label>
                      <SearchableSelect
                        options={coilOptions}
                        value={globalCoil}
                        onChange={setGlobalCoil}
                        placeholder="Search coil no., thickness, colour or country…"
                        invalid={!globalCoil}
                      />
                      <p className="mt-2 text-xs text-gray-500">Applied to every Branch Stock item (not aluminium brackets).</p>
                    </div>
                  )}
                </div>
              )}

              {/* 3. Add / edit item */}
              <div id="order-item-editor" className={`scroll-mt-4 border-b border-gray-200 p-6 ${editingKey ? 'bg-amber-50/50' : ''}`}>
                <SectionHeader step={nextStep()} title={editingKey ? 'Edit Item' : 'Add Item'} />

                <StepLabel>a. What is being made?</StepLabel>
                <div className="mb-6">
                  <ChoiceTiles
                    tiles={categories.map((c) => ({
                      value: c,
                      label: c,
                      icon: CATEGORY_ICONS[c],
                      count: items.filter((i) => i.category === c).length,
                    }))}
                    value={draft.category}
                    onChange={selectCategory}
                  />
                </div>

                {draft.category && (
                  <>
                    {customerOn && (
                      <div className="mb-6">
                        <StepLabel>b. Material</StepLabel>
                        <Segmented
                          value={draft.material_source}
                          onChange={changeItemSource}
                          options={[
                            {
                              value: MaterialSource.BRANCH,
                              label: 'Branch Stock',
                            },
                            {
                              value: MaterialSource.CUSTOMER,
                              label: "Customer's Material",
                            },
                          ]}
                        />
                        {onCustomer &&
                          (editorMaterials.length === 0 ? (
                            <div className="mt-3 flex max-w-2xl flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                              <span className="inline-flex items-start gap-1.5">
                                <Icon name="alertCircle" className="mt-0.5 h-4 w-4 shrink-0" />
                                {phoneReady
                                  ? 'This customer has no gate pass material left. Record a gate pass first.'
                                  : 'Enter the customer phone first to see their gate passes.'}
                              </span>
                              {phoneReady && canCreateGatePass && (
                                <button type="button" onClick={goCreateGatePass} className="shrink-0 text-xs font-bold text-[#0033A0] hover:underline">
                                  Create New Gate Pass
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="mt-3 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-12">
                              <div className="sm:col-span-9">
                                <label className={labelCls}>
                                  Gate Pass Item <span className="text-red-500">*</span>
                                </label>
                                <SearchableSelect
                                  options={editorMaterials.map((m) => ({
                                    value: m.gp_item_id,
                                    label: materialLabel(m),
                                    hint: `${Math.max(0, m.left)} of ${m.received} left`,
                                  }))}
                                  value={draft.gp_item_id || undefined}
                                  onChange={(v) => setField('gp_item_id', v)}
                                  placeholder="Search gate pass material…"
                                  invalid={!draft.gp_item_id}
                                />
                              </div>
                              <div className="sm:col-span-3">
                                <label className={labelCls}>
                                  Pieces Used <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  max={pickedMaterial ? Math.max(0, pickedMaterial.left) : undefined}
                                  value={piecesUsed}
                                  onChange={(e) => setField('gp_quantity', e.target.value)}
                                  className={inputCls}
                                />
                              </div>
                              {suggestion && (
                                <p className="col-span-full -mt-2 text-xs text-gray-500">
                                  {draft.gp_quantity && draft.gp_quantity !== String(suggestion.pieces) ? 'Suggested' : 'Filled in'} {suggestion.pieces}:{' '}
                                  {draft.pieces} pcs × {draft.length_ft} ft = {suggestion.runningFt.toLocaleString()} ft from{' '}
                                  {suggestion.pieceFt.toLocaleString()} ft pieces.
                                </p>
                              )}
                            </div>
                          ))}
                      </div>
                    )}

                    <div className="mb-6">
                      <StepLabel>{customerOn ? 'c.' : 'b.'} Job type</StepLabel>
                      <Segmented<RoofingJobType>
                        value={draft.job_type}
                        onChange={(v) => setField('job_type', v)}
                        options={[
                          { value: 'STANDARD', label: 'Standard' },
                          { value: 'CUSTOMIZED', label: 'Customized' },
                        ]}
                      />
                      <p className="mt-1.5 text-xs text-gray-500">
                        {roofing.require_design_photo ? 'Customized = upload a photo of the design.' : 'Customized = describe the design (photo optional).'}
                      </p>
                    </div>

                    <StepLabel>
                      {customerOn ? 'd.' : 'c.'} {draft.category} details
                    </StepLabel>
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                        {accessory && (
                          <div className="col-span-full space-y-4">
                            {rows.map((row, index) => {
                              const acc = roofing.accessories.find((a) => a.name === row.accessory_type);
                              const rowNeedsCoil = editorItems[index] ? lineNeedsCoil(editorItems[index], roofing) : false;
                              return (
                                <div key={row.key} className="rounded-md border border-gray-200 bg-white p-4">
                                  <div className="mb-3 flex items-center justify-between">
                                    <p className="text-sm font-bold text-gray-900">Accessory {index + 1}</p>
                                    {rows.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                                        className="p-1 text-gray-400 transition-colors hover:text-red-500"
                                        title="Remove this accessory"
                                      >
                                        <Icon name="x" className="h-4 w-4" />
                                      </button>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                                    <div className="sm:col-span-5">
                                      <label className={labelCls}>
                                        Accessory <span className="text-red-500">*</span>
                                      </label>
                                      <SearchableSelect
                                        options={accessoryOptions}
                                        value={row.accessory_type}
                                        onChange={(v) =>
                                          updateRow(row.key, {
                                            accessory_type: v || undefined,
                                            accessory_variant: undefined,
                                          })
                                        }
                                        placeholder="Search accessory…"
                                        invalid={!row.accessory_type}
                                      />
                                    </div>
                                    {acc && acc.variants.length > 0 && (
                                      <div className="sm:col-span-4">
                                        <label className={labelCls}>
                                          Shape <span className="text-red-500">*</span>
                                        </label>
                                        <Segmented
                                          value={row.accessory_variant ?? ''}
                                          onChange={(v) =>
                                            updateRow(row.key, {
                                              accessory_variant: v,
                                            })
                                          }
                                          options={acc.variants.map((v) => ({
                                            value: v,
                                            label: v,
                                          }))}
                                        />
                                      </div>
                                    )}
                                    <div className="sm:col-span-3">
                                      <label className={labelCls}>
                                        Quantity <span className="text-red-500">*</span>
                                      </label>
                                      <input
                                        type="number"
                                        min="1"
                                        value={numberValue(row.quantity)}
                                        onChange={(e) =>
                                          updateRow(row.key, {
                                            quantity: parseNumber(e.target.value),
                                          })
                                        }
                                        className={inputCls}
                                      />
                                    </div>
                                    {rowNeedsCoil && coilField(row.coil_item_id, (v) => updateRow(row.key, { coil_item_id: v }))}
                                    {custom && (
                                      <DesignPhotoField
                                        value={row.design_attachment_id}
                                        required={roofing.require_design_photo}
                                        onChange={(id) =>
                                          updateRow(row.key, {
                                            design_attachment_id: id,
                                          })
                                        }
                                      />
                                    )}
                                    <div className="col-span-full">
                                      <label className={labelCls}>Remarks</label>
                                      <input
                                        type="text"
                                        value={row.remarks ?? ''}
                                        onChange={(e) =>
                                          updateRow(row.key, {
                                            remarks: e.target.value,
                                          })
                                        }
                                        className={inputCls}
                                        placeholder="Optional notes for the workshop"
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            {/* One gate pass item per item, so customer accessories are added one at a time */}
                            {!editingKey && !onCustomer && (
                              <button
                                type="button"
                                onClick={() => setRows((rs) => [...rs, emptyAccessoryRow(rs[rs.length - 1]?.coil_item_id)])}
                                className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"
                              >
                                <Icon name="plus" className="mr-1 h-4 w-4" /> Add another accessory
                              </button>
                            )}
                          </div>
                        )}

                        {!accessory &&
                          editorItems[0] &&
                          lineNeedsCoil(editorItems[0], roofing) &&
                          coilField(draft.coil_item_id, (v) => setField('coil_item_id', v))}

                        {!accessory && editorItems[0] && lineNeedsPattern(editorItems[0], roofing) && (
                          <div className="sm:col-span-5">
                            <label className={labelCls}>
                              Design Pattern <span className="text-red-500">*</span>
                            </label>
                            <SearchableSelect
                              options={patternOptions}
                              value={draft.pattern}
                              onChange={(v) => setField('pattern', v || undefined)}
                              placeholder="Search pattern…"
                              invalid={!draft.pattern}
                            />
                          </div>
                        )}

                        {!accessory && (
                          <>
                            <div className="sm:col-span-3">
                              <label className={labelCls}>
                                Length (ft) <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                value={numberValue(draft.length_ft)}
                                onChange={(e) => setField('length_ft', parseNumber(e.target.value))}
                                className={inputCls}
                                placeholder="e.g. 12"
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <label className={labelCls}>
                                No. of Pieces <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="number"
                                min="1"
                                value={numberValue(draft.pieces)}
                                onChange={(e) => setField('pieces', parseNumber(e.target.value))}
                                className={inputCls}
                                placeholder="e.g. 8"
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <label className={labelCls}>Total Cuts</label>
                              <input
                                type="number"
                                min="0"
                                value={numberValue(draft.total_cuts)}
                                onChange={(e) => setField('total_cuts', parseNumber(e.target.value) ?? 0)}
                                className={inputCls}
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <label className={labelCls}>Total Bends</label>
                              <input
                                type="number"
                                min="0"
                                value={numberValue(draft.total_bends)}
                                onChange={(e) => setField('total_bends', parseNumber(e.target.value) ?? 0)}
                                className={inputCls}
                              />
                            </div>
                            {runningFt(draft) > 0 && (
                              <div className="col-span-full -mt-1 text-sm font-medium text-blue-700">
                                Total: {draft.length_ft} ft × {draft.pieces} pcs = {runningFt(draft).toLocaleString()} running ft
                              </div>
                            )}
                            {custom && (
                              <DesignPhotoField
                                value={draft.design_attachment_id ?? undefined}
                                required={roofing.require_design_photo}
                                onChange={(id) => setField('design_attachment_id', id)}
                              />
                            )}
                            <div className="col-span-full">
                              <label className={labelCls}>Remarks</label>
                              <input
                                type="text"
                                value={draft.remarks ?? ''}
                                onChange={(e) => setField('remarks', e.target.value)}
                                className={inputCls}
                                placeholder="Optional notes for the workshop"
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-h-4 text-xs text-amber-700">
                        {missingFields.length > 0 && (
                          <span className="inline-flex items-center">
                            <Icon name="alertCircle" className="mr-1 h-4 w-4" /> Still needed: {missingFields.join(', ')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {editingKey && (
                          <button type="button" onClick={() => resetEditor()} className="text-sm font-medium text-gray-700 hover:text-gray-900">
                            Cancel edit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={saveItem}
                          disabled={missingFields.length > 0}
                          className="inline-flex items-center rounded-md border border-transparent bg-gray-900 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {editingKey ? (
                            <>
                              <Icon name="check" className="mr-2 h-4 w-4" /> Update Item
                            </>
                          ) : (
                            <>
                              <Icon name="plus" className="mr-2 h-4 w-4" />{' '}
                              {editorItems.length > 1 ? `Add ${editorItems.length} Items to Order` : 'Add to Order'}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Order items */}
              <div className="p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-gray-900">Order Items</h3>
                  <div className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                    {items.length} item{items.length !== 1 && 's'} · {summary.branch} branch stock · {summary.customer} customer supplied
                    {summary.ft > 0 && <> · {summary.ft.toLocaleString()} running ft</>}
                  </div>
                </div>
                {items.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-500">
                    No items added yet. Choose a category above to start.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {grouped.map((group) => (
                      <div key={group.key}>
                        <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                          {group.key} ({group.items.length})
                        </h4>
                        <div className="space-y-2">
                          {group.items.map((item) => (
                            <OrderItemRow
                              key={item.key}
                              item={item}
                              coilLabel={lineNeedsCoil(item, roofing) ? coilLabel(orderCoil ?? item.coil_item_id) : null}
                              price={priceByKey.get(item.key)}
                              materialName={item.customer_material ? (materialNames[item.customer_material.gp_item_id] ?? null) : null}
                              isEditing={editingKey === item.key}
                              locked={!!editLockedReason}
                              advance={advanceByKey.get(item.key)}
                              onAdvance={(v) => setAdvance(item.key, v)}
                              onEdit={() => startEditing(item)}
                              onDuplicate={() => duplicateItem(item)}
                              onRemove={() => removeItem(item.key)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pricing: the cashier also takes the payment; anyone else sends the order to the Cashier Queue */}
              {items.length > 0 && (
                <div className="border-t border-gray-200 p-6">
                  <SectionHeader
                    step={nextStep()}
                    title={takesPayment && !isEdit ? 'Pricing & Payment' : 'Pricing'}
                    hint={
                      isEdit
                        ? 'Prices are recalculated from the branch rates. Payments already taken are kept.'
                        : `Prices come from the branch rate table. Standard items take ${policy.min_advance_pct}% as the advance; set the advance of customized items on each item.${takesPayment ? ' Take at least the advance to place the order.' : ''}`
                    }
                  />
                  {missingRates.length > 0 && (
                    <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      <Icon name="alertCircle" className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        No rate set for <strong>{missingRates.join(', ')}</strong>. Ask the branch manager to add it in Order Settings before placing this
                        order.
                      </span>
                    </div>
                  )}
                  <div className={takesPayment && !isEdit ? 'grid grid-cols-1 gap-6 lg:grid-cols-2' : ''}>
                    <div className={cnPricing(takesPayment)}>
                      {takesPayment ? (
                        <>
                          <div className="flex justify-between text-sm text-gray-600">
                            <span>
                              Subtotal ({items.length} item
                              {items.length !== 1 && 's'})
                            </span>
                            <span className="font-semibold tabular-nums text-gray-900">{formatRs(subtotal)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 text-sm text-gray-600">
                            <div>
                              <span>Discount</span>
                              <p className="text-[11px] text-gray-400">
                                Up to {policy.max_discount_pct}% ({formatRs(maxDiscount)})
                              </p>
                            </div>
                            <div className="relative w-36">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">Rs</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={discountInput}
                                onChange={(e) => setDiscountInput(e.target.value)}
                                className={`w-full rounded-md border py-1.5 pl-9 pr-2 text-right text-sm tabular-nums ${discount > maxDiscount ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'}`}
                                placeholder="0"
                              />
                            </div>
                          </div>
                          <div className="flex justify-between border-t border-gray-200 pt-3">
                            <span className="text-base font-bold text-gray-900">Total</span>
                            <span className="text-xl font-bold tabular-nums text-[#0033A0]">{formatRs(total)}</span>
                          </div>
                          <div className="flex justify-between text-sm text-gray-600">
                            <span>Advance (sum of the items)</span>
                            <span className="font-semibold tabular-nums text-gray-900">{formatRs(minToPlace)}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-baseline justify-between">
                            <span className="text-base font-bold text-gray-900">
                              Total ({items.length} item
                              {items.length !== 1 && 's'})
                            </span>
                            <span className="text-xl font-bold tabular-nums text-[#0033A0]">{formatRs(total)}</span>
                          </div>
                          {discount > 0 && (
                            <div className="flex justify-between text-sm text-gray-600">
                              <span>Discount (given by the cashier)</span>
                              <span className="tabular-nums">{formatRs(discount)}</span>
                            </div>
                          )}
                          {(!existing || existing.status === OrderStatus.DRAFT) && (
                            <div className="flex justify-between border-t border-gray-200 pt-3 text-sm text-gray-600">
                              <span>Advance to collect at the cashier</span>
                              <span className="font-semibold tabular-nums text-gray-900">{formatRs(minToPlace)}</span>
                            </div>
                          )}
                        </>
                      )}
                      {existing && (
                        <>
                          <div className="flex justify-between text-sm text-gray-600">
                            <span>Already paid</span>
                            <span className="font-semibold tabular-nums text-emerald-700">{formatRs(alreadyPaid)}</span>
                          </div>
                          {alreadyPaid > total ? (
                            <p className="text-xs font-semibold text-amber-700">Refund due: {formatRs(alreadyPaid - total)}</p>
                          ) : (
                            <div className="flex justify-between text-sm text-gray-600">
                              <span>Balance</span>
                              <span className="font-semibold tabular-nums text-amber-700">{formatRs(total - alreadyPaid)}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {!isEdit && takesPayment && (
                      <div>
                        {!online && (
                          <Notice tone="warning" className="mb-3">
                            Payments can't be taken offline (BR18). Reconnect to place the order.
                          </Notice>
                        )}
                        <PaymentCapture
                          value={payment}
                          onChange={setPayment}
                          general={general}
                          quickAmounts={[
                            ...(minToPlace > 0 && minToPlace < total ? [{ label: 'Advance', amount: minToPlace }] : []),
                            { label: 'Full', amount: total },
                          ]}
                        />
                        <p className="mt-3 text-xs text-gray-500">
                          {minToPlace === 0 ? 'No payment is needed to place this order.' : `Minimum to place: ${formatRs(minToPlace)} (the item advances).`}{' '}
                          Full payment is needed before the supervisor releases the order.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <div className="px-6 pb-4">
                  <Notice tone="error">{error}</Notice>
                </div>
              )}

              <div className="flex items-center justify-end space-x-4 rounded-b-lg border-t border-gray-200 bg-gray-50 p-6">
                <button type="button" onClick={cancel} className="text-sm font-medium text-gray-700 hover:text-gray-900 focus:outline-none">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!!editLockedReason || missingRates.length > 0 || busy}
                  className="inline-flex items-center justify-center rounded-md border border-transparent bg-[#0033A0] px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                >
                  {busy ? 'Saving…' : isEdit ? 'Update Order' : takesPayment ? 'Place Order' : 'Submit Order'}
                  <Icon name="arrowRight" className="ml-2 h-4 w-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
        {historySeen && (
          <div className={tab === 'history' ? 'p-6' : 'hidden'}>
            {search.notice && (
              <Notice tone="success" className="mb-4">
                {search.notice}
              </Notice>
            )}
            <OrderHistoryPanel type="roofing-orders" onOpenOrder={setHistoryOrderId} />
          </div>
        )}
      </div>

      {historyOrderId && (
        <OrderDetailModal
          orderId={historyOrderId}
          onClose={() => setHistoryOrderId(null)}
          // Unpaid orders waiting at the cashier are not on the Order Queue; they are edited from here
          actions={(o) =>
            o.can_edit && (o.status === OrderStatus.DRAFT || can('edit', 'order')) ? (
              <button
                type="button"
                onClick={() => {
                  setHistoryOrderId(null);
                  void navigate({
                    to: '/orders/$orderId/edit',
                    params: { orderId: o.order_id },
                  });
                }}
                className="btn-secondary inline-flex items-center gap-1.5"
              >
                <Icon name="edit" className="h-4 w-4" /> Edit
              </button>
            ) : null
          }
        />
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Clear everything on this form?"
        message="The customer, items, coil, discount and payment will be removed."
        confirmLabel="Clear all"
        isDestructive
        onConfirm={clearAll}
        onCancel={() => setConfirmClear(false)}
      />

      {shortage && (
        <StockOverrideDialog
          mode="save"
          details={shortage}
          pending={busy}
          error={overrideError}
          onConfirm={(ov) => void save(ov)}
          onClose={() => setShortage(null)}
        />
      )}
    </div>
  );
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The cashier's totals box sits beside the payment; anyone else gets the job card's narrow box. */
const cnPricing = (takesPayment: boolean) => `space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-5 ${takesPayment ? '' : 'max-w-lg'}`;
