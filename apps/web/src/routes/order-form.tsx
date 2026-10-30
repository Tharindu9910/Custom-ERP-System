import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import {
  DEFAULT_BRANCH_SETTINGS,
  MaterialSource,
  OrderStatus,
  ROOFING_CATEGORIES,
  isAccessoryCategory,
  lineNeedsCoil,
  lineNeedsPattern,
  normalizeRoofingLine,
  runningFt,
  toBranchDate,
  validateRoofingLine,
  type RoofingCategory,
  type RoofingJobType,
  type StockOverride,
} from '@erp/shared';
import type { OrderFormSearch } from '@/app/search-params';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { ChoiceTiles, SectionHeader, Segmented } from '@/shared/components/FormSection';
import { Icon, type IconName } from '@/shared/components/Icon';
import { Notice } from '@/shared/components/Notice';
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
import { MaterialAllocationModal, type AllocatedItem } from '@/modules/gate-passes/components/MaterialAllocationModal';
import { OrderGatePassPanel } from '@/modules/gate-passes/components/OrderGatePassPanel';
import { useGatePass, type GatePassDto } from '@/modules/gate-passes/hooks/useGatePasses';
import { useActiveWorkers, useOrderDetail, type OrderDetailDto } from '@/modules/orders/hooks/useOrders';
import { OrderHistoryModal } from '@/modules/orders/components/OrderHistoryModal';
import { DesignPhotoField } from '@/modules/roofing/components/DesignPhotoField';
import { OrderDetailModal } from '@/modules/roofing/components/OrderDetailModal';
import { OrderItemRow } from '@/modules/roofing/components/OrderItemRow';
import { useCoils, usePlaceRoofingOrder, useRoofingQuote, useUpdateRoofingOrder } from '@/modules/roofing/hooks/useRoofing';
import {
  draftItems,
  emptyAccessoryRow,
  emptyDraft,
  fromLineSpec,
  newKey,
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

const inputCls = 'block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm';
const labelCls = 'mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500';

const numberValue = (v?: number) => (v === undefined || v === null ? '' : v);
const parseNumber = (v: string) => (v === '' ? undefined : Number(v));

/** Everything typed on Create Order, kept while the user visits other pages (sessionStorage, see useFormDraft). */
interface SavedDraft {
  phone: string;
  name: string;
  date: string;
  technician: string;
  materialSource: MaterialSource;
  items: OrderItem[];
  useGlobalCoil: boolean;
  globalCoil: string;
  discount: string;
  /** The item editor, half filled */
  editor: ItemDraft | null;
  rows: AccessoryRow[] | null;
  editingKey: string | null;
  payment: PaymentDraft | null;
  /** Customer material picked from a gate pass (re-checked by the server on save) */
  gatePassId: string | null;
  allocations: { gp_item_id: string; quantity: number }[];
  allocationChanged: boolean;
}

interface InitialState extends Omit<SavedDraft, 'gatePassId' | 'allocations'> {
  assigned: GatePassDto | null;
  allocated: AllocatedItem[];
  allocationTarget: GatePassDto | null;
  /** The form was filled from a saved draft */
  restored: boolean;
}

/**
 * Loads what the form starts from (the order being edited and its gate pass, or for
 * a new order the draft kept from an earlier visit, and the pass to allocate from),
 * then mounts it. Edit pages always start from the server.
 */
export function OrderFormPage() {
  const params = useParams({ strict: false }) as { orderId?: string };
  const search = useSearch({ strict: false }) as OrderFormSearch;
  const orderId = params.orderId;
  const [saved] = useState(() => (orderId ? null : readFormDraft<SavedDraft>('order')));
  const existingQ = useOrderDetail(orderId);
  // The pass the order (edit) or the draft (new) already uses
  const committedId = saved ? (saved.gatePassId ?? undefined) : existingQ.data?.gate_pass?.gate_pass_id;
  const committedQ = useGatePass(committedId);
  const linkedQ = useGatePass(search.gatePass);

  const waiting =
    (!!orderId && existingQ.isPending) || (!!committedId && committedQ.isPending) || (!!search.gatePass && linkedQ.isPending);
  if (waiting) return <div className="py-24 text-center text-sm text-slate-400">Loading…</div>;

  const existing = existingQ.data;
  const linked = linkedQ.data ?? null;
  let initial: InitialState = {
    phone: '',
    name: '',
    date: toBranchDate(),
    technician: '',
    materialSource: MaterialSource.BRANCH,
    items: [],
    useGlobalCoil: false,
    globalCoil: '',
    discount: '',
    editor: null,
    rows: null,
    editingKey: null,
    payment: null,
    assigned: null,
    allocated: [],
    allocationChanged: false,
    allocationTarget: null,
    restored: false,
  };
  if (saved) {
    // A pass that has gone (or lost an item) since is dropped; the server re-checks quantities on save
    const pass = committedQ.data ?? null;
    initial = {
      ...initial,
      phone: saved.phone,
      name: saved.name,
      date: saved.date,
      technician: saved.technician,
      materialSource: saved.materialSource,
      items: saved.items,
      useGlobalCoil: saved.useGlobalCoil,
      globalCoil: saved.globalCoil,
      discount: saved.discount,
      editor: saved.editor,
      rows: saved.rows,
      editingKey: saved.editingKey,
      payment: saved.payment,
      assigned: pass,
      allocated: pass
        ? saved.allocations.map((a) => ({ item: pass.items.find((i) => i.gp_item_id === a.gp_item_id)!, quantity: a.quantity })).filter((x) => x.item)
        : [],
      allocationChanged: !!pass && saved.allocationChanged,
      restored: true,
    };
  } else if (existing) {
    const pass = committedQ.data ?? null;
    initial = {
      ...initial,
      phone: existing.customer?.phone ?? '',
      name: existing.customer?.name ?? '',
      date: existing.header.order_date ?? toBranchDate(existing.created_at),
      technician: existing.header.technician ?? '',
      materialSource: (existing.header.material_source as MaterialSource) ?? MaterialSource.BRANCH,
      items: existing.lines.filter((l) => l.status !== 'CANCELLED').map((l) => fromLineSpec(l.spec, l.line_id)),
      useGlobalCoil: !!existing.header.global_coil_item_id,
      globalCoil: existing.header.global_coil_item_id ?? '',
      discount: existing.discount ? centsToInput(existing.discount) : '',
      assigned: pass,
      allocated: pass
        ? existing.customer_materials
            .map((m) => ({ item: pass.items.find((i) => i.gp_item_id === m.gp_item_id)!, quantity: m.quantity }))
            .filter((x) => x.item)
        : [],
    };
  }
  if (linked) {
    initial = {
      ...initial,
      materialSource: MaterialSource.CUSTOMER,
      phone: initial.phone || linked.customer_phone,
      name: initial.name || linked.customer_name,
      allocationTarget: linked,
    };
  }
  return <OrderForm key={orderId ?? 'new'} orderId={orderId} existing={existing} initial={initial} />;
}

function OrderForm({ orderId, existing, initial }: { orderId?: string; existing?: OrderDetailDto; initial: InitialState }) {
  const navigate = useNavigate();
  const isEdit = !!orderId;
  const online = useOnlineStatus();
  const { can } = usePermission();
  const { settings, branch, featureOn } = useBranchContext();
  const roofing = settings?.roofing ?? DEFAULT_BRANCH_SETTINGS.roofing;
  const general = settings?.general ?? DEFAULT_BRANCH_SETTINGS.general;
  const policy = settings?.orders ?? DEFAULT_BRANCH_SETTINGS.orders;
  const allowCustomer = general.allow_customer_material;
  const gatePassOn = featureOn('gatePass');

  // Editing is only for the cashier, while the order hasn't started and the manager allows it
  const editLockedReason = !existing
    ? null
    : !can('edit', 'order')
      ? 'Only the cashier can edit an order.'
      : existing.status !== OrderStatus.IN_QUEUE
        ? `This order is ${existing.display_label.toLowerCase()} and can no longer be edited.`
        : !policy.allow_cashier_edit_before_start
          ? 'The branch manager has turned off editing placed orders.'
          : !existing.can_edit
            ? 'Work has started on this order, so it can no longer be edited.'
            : null;
  // Who may record a gate pass is set on Role Permissions (create:gate_pass)
  const canCreateGatePass = can('create', 'gate_pass');
  // ...and who may use one on a roofing order (allocate:gate_pass_order)
  const canAllocateGatePass = can('allocate', 'gate_pass_order');

  const place = usePlaceRoofingOrder();
  const update = useUpdateRoofingOrder(orderId ?? '');
  const requestId = useRef(newRequestId());
  const coilsQ = useCoils();
  const coils = useMemo(() => coilsQ.data ?? [], [coilsQ.data]);

  // ── Order details ─────────────────────────────────────────────────────────
  const [phone, setPhone] = useState(initial.phone);
  const [name, setName] = useState(initial.name);
  const [date, setDate] = useState(initial.date);
  const [technician, setTechnician] = useState(initial.technician);
  const workersQ = useActiveWorkers();
  // The order stores the worker's name; keep a saved name selectable even if that worker was since deactivated.
  const workerOptions = useMemo<SelectOption[]>(() => {
    const opts = (workersQ.data ?? []).map((w) => ({ value: w.full_name, label: w.full_name, hint: [w.employee_code, w.designation].filter(Boolean).join(' · ') }));
    if (technician && !opts.some((o) => o.value === technician)) opts.unshift({ value: technician, label: technician, hint: '' });
    return opts;
  }, [workersQ.data, technician]);
  const [materialSource, setMaterialSource] = useState<MaterialSource>(initial.materialSource);
  const [useGlobalCoil, setUseGlobalCoil] = useState(initial.useGlobalCoil);
  const [globalCoil, setGlobalCoil] = useState(initial.globalCoil);
  const [items, setItems] = useState<OrderItem[]>(initial.items);

  // ── Item editor ───────────────────────────────────────────────────────────
  const [draft, setDraft] = useState<ItemDraft>(() => initial.editor ?? emptyDraft(initial.materialSource));
  const [rows, setRows] = useState<AccessoryRow[]>(() => initial.rows ?? [emptyAccessoryRow()]);
  const [editingKey, setEditingKey] = useState<string | null>(initial.editingKey);

  // ── Gate pass ─────────────────────────────────────────────────────────────
  const [assigned, setAssigned] = useState<GatePassDto | null>(initial.assigned);
  const [allocated, setAllocated] = useState<AllocatedItem[]>(initial.allocated);
  // True once the material was picked in this session; it is sent and saved with the order
  const [allocationChanged, setAllocationChanged] = useState(initial.allocationChanged);
  const [allocationTarget, setAllocationTarget] = useState<GatePassDto | null>(initial.allocationTarget);

  // ── Pricing & payment ─────────────────────────────────────────────────────
  const [discountInput, setDiscountInput] = useState(initial.discount);
  const [payment, setPayment] = useState<PaymentDraft>(() => initial.payment ?? emptyPaymentDraft(general.payment_modes[0]));
  const [placed, setPlaced] = useState<{ orderNumber: string; total: number; paid: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Placing holds branch coil; not enough available asks for a stock override (Docs/decisions/0003)
  const [shortage, setShortage] = useState<StockShortageDetails | null>(null);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [restored, setRestored] = useState(initial.restored);
  const [confirmClear, setConfirmClear] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyOrderId, setHistoryOrderId] = useState<string | null>(null);

  // ── Draft: a new order is kept while the user visits other pages ──────────
  const draftValue: SavedDraft = {
    phone,
    name,
    date,
    technician,
    materialSource,
    items,
    useGlobalCoil,
    globalCoil,
    discount: discountInput,
    editor: draft,
    rows,
    editingKey,
    payment,
    gatePassId: assigned?.gate_pass_id ?? null,
    allocations: allocated.map((a) => ({ gp_item_id: a.item.gp_item_id, quantity: a.quantity })),
    allocationChanged,
  };
  const isBlank = (d: SavedDraft) =>
    !d.phone.trim() &&
    !d.name.trim() &&
    !d.technician.trim() &&
    d.date === toBranchDate() &&
    d.items.length === 0 &&
    !d.useGlobalCoil &&
    !d.globalCoil &&
    !d.discount &&
    !d.gatePassId &&
    !d.editingKey &&
    !d.payment?.amount &&
    !d.payment?.reference &&
    (!d.editor || sameJson(d.editor, emptyDraft(d.materialSource, d.editor.category, d.editor.job_type))) &&
    (!d.rows || (d.rows.length === 1 && sameJson({ ...d.rows[0], key: '' }, { ...emptyAccessoryRow(), key: '' })));
  const clearDraft = useFormDraft('order', draftValue, { enabled: !isEdit, isEmpty: isBlank });
  const formIsBlank = isBlank(draftValue);

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

  const showGlobalCoil = roofing.allow_single_coil && (materialSource === MaterialSource.BRANCH || items.some((i) => i.material_source === MaterialSource.BRANCH));
  const usesCustomer = materialSource === MaterialSource.CUSTOMER || items.some((i) => i.material_source === MaterialSource.CUSTOMER);
  // An order that already uses a pass keeps showing it, even to someone who can't allocate
  const showGatePass = gatePassOn && usesCustomer && (canAllocateGatePass || !!assigned);
  const orderCoil = useGlobalCoil && showGlobalCoil && globalCoil ? globalCoil : undefined;

  const accessory = !!draft.category && isAccessoryCategory(draft.category);
  const custom = draft.job_type === 'CUSTOMIZED';
  const editorItems = useMemo(() => draftItems(draft, rows), [draft, rows]);
  const missingFields = useMemo(
    () => [...new Set(editorItems.flatMap((i) => validateRoofingLine(i, roofing, useGlobalCoil && showGlobalCoil)))],
    [editorItems, roofing, useGlobalCoil, showGlobalCoil],
  );
  const patternOptions = useMemo<SelectOption[]>(
    () => (draft.category ? (roofing.patterns[draft.category] ?? []) : []).map((p) => ({ value: p, label: p })),
    [draft.category, roofing.patterns],
  );
  const accessoryOptions = useMemo<SelectOption[]>(
    () => roofing.accessories.map((a) => ({ value: a.name, label: a.name, hint: a.variants.length ? a.variants.join(' / ') : undefined })),
    [roofing.accessories],
  );

  const lines = useMemo(() => items.map(toLine), [items]);
  const discount = parseMoney(discountInput || '0');
  const quoteQ = useRoofingQuote({ lines, global_coil_item_id: orderCoil, discount });
  const quote = quoteQ.data;
  const priceByKey = useMemo(() => new Map(items.map((it, i) => [it.key, quote?.lines[i]])), [items, quote]);
  const missingRates = [...new Set((quote?.missing_rates ?? []).map((m) => m.missing))];
  const subtotal = quote?.subtotal ?? 0;
  const total = quote?.total ?? 0;
  const maxDiscount = quote?.max_discount ?? 0;
  const minToPlace = quote?.min_to_place ?? 0;
  const alreadyPaid = existing?.paid_amount ?? 0;

  const grouped = useMemo(
    () => ROOFING_CATEGORIES.map((c) => ({ key: c, items: items.filter((i) => i.category === c) })).filter((g) => g.items.length > 0),
    [items],
  );
  const summary = {
    branch: items.filter((i) => i.material_source === MaterialSource.BRANCH).length,
    customer: items.filter((i) => i.material_source === MaterialSource.CUSTOMER).length,
    ft: items.reduce((s, i) => s + runningFt(i), 0),
  };
  const picked = useMemo(() => Object.fromEntries(allocated.map((a) => [a.item.gp_item_id, a.quantity])), [allocated]);
  // Material the saved order already holds (edit mode)
  const [committed] = useState(() => Object.fromEntries(initial.allocated.map((a) => [a.item.gp_item_id, a.quantity])));

  // ── Actions ───────────────────────────────────────────────────────────────
  const setField = <K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const updateRow = (key: string, patch: Partial<AccessoryRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const changeSource = (s: MaterialSource) => {
    setMaterialSource(s);
    // New items follow the default source unless one is being edited
    if (!editingKey) setDraft((d) => ({ ...d, material_source: s }));
  };

  const selectCategory = (category: RoofingCategory) => {
    setDraft((d) => ({ ...d, category, pattern: undefined, accessory_type: undefined, accessory_variant: undefined }));
    setRows([emptyAccessoryRow()]);
  };

  const resetEditor = (keepCategory = true) => {
    setEditingKey(null);
    setRows([emptyAccessoryRow()]);
    setDraft((d) => (keepCategory ? emptyDraft(materialSource, d.category, d.job_type, d.coil_item_id ?? undefined) : emptyDraft(materialSource)));
  };

  const saveItem = () => {
    if (missingFields.length) return;
    const coilForAll = useGlobalCoil && showGlobalCoil ? globalCoil || null : null;
    const next = editorItems.map((line, i) => ({
      ...normalizeRoofingLine(line, roofing, coilForAll),
      key: (i === 0 && editingKey) || newKey(),
    }));
    setItems((list) => (editingKey ? list.map((i) => (i.key === editingKey ? next[0] : i)) : [...next, ...list]));
    resetEditor();
  };

  const startEditing = (item: OrderItem) => {
    setEditingKey(item.key);
    setDraft({ ...item });
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
    void navigate({ to: '/gate-pass', search: { tab: 'create', return_to: 'order', phone, name } });
  };

  const unassign = () => {
    setAssigned(null);
    setAllocated([]);
    setAllocationChanged(false);
  };

  const resetForm = () => {
    setPhone('');
    setName('');
    setDate(toBranchDate());
    setTechnician('');
    setMaterialSource(MaterialSource.BRANCH);
    setUseGlobalCoil(false);
    setGlobalCoil('');
    setItems([]);
    setEditingKey(null);
    setDraft(emptyDraft(MaterialSource.BRANCH));
    setRows([emptyAccessoryRow()]);
    setDiscountInput('');
    setPayment(emptyPaymentDraft(general.payment_modes[0]));
    setAssigned(null);
    setAllocated([]);
    setAllocationChanged(false);
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
      return setError(`Please choose the coil for the whole order (Step 3).`);
    }
    if (!(useGlobalCoil && showGlobalCoil) && items.some((i) => lineNeedsCoil(i, roofing) && !i.coil_item_id)) {
      return setError('Some items have no coil selected. Please edit them and choose a coil.');
    }
    if (general.require_gate_pass && gatePassOn && usesCustomer && !assigned) {
      return setError(
        canAllocateGatePass
          ? 'This branch requires a gate pass for customer-supplied material. Please create the gate pass first.'
          : "This branch requires a gate pass for customer-supplied material, and your role can't use gate passes on orders. Ask someone who can.",
      );
    }
    if (missingRates.length > 0) return setError(`No rate set for: ${missingRates.join(', ')}. Ask the branch manager to add it in Order Settings.`);
    if (discount > maxDiscount) return setError(`The discount can't be more than ${policy.max_discount_pct}% (${formatRs(maxDiscount)}).`);
    if (!isEdit) {
      const payError = validatePaymentDraft(payment, { min: minToPlace, max: total, requireReference: general.require_payment_reference });
      if (payError) return setError(payError);
      if (!online) return setError("Payments can't be taken offline (BR18). Reconnect to place the order.");
    }
    await save();
  };

  const save = async (override?: StockOverride) => {
    setOverrideError(null);
    const body = {
      customer: { phone: phone.trim(), name: name.trim() },
      order_date: date,
      technician: technician.trim() || undefined,
      material_source: materialSource,
      global_coil_item_id: orderCoil ?? null,
      gate_pass_id: assigned?.gate_pass_id ?? null,
      allocations: assigned && allocationChanged ? allocated.map((a) => ({ gp_item_id: a.item.gp_item_id, quantity: a.quantity })) : null,
      lines,
      discount,
      override,
    };
    try {
      if (isEdit && existing) {
        const res = await update.mutateAsync({ ...body, version: existing.version });
        void navigate({
          to: '/order-queue',
          search: {
            notice:
              res.refund_due > 0
                ? `Order ${res.order_number} updated. The customer has paid ${formatRs(res.refund_due)} more than the new total — refund it at the counter.`
                : `Order ${res.order_number} updated.`,
          },
        });
        return;
      }
      const pay = toPayment(payment);
      const res = await place.mutateAsync({ ...body, client_request_id: requestId.current, payment: pay });
      setShortage(null);
      setPlaced({ orderNumber: res.order_number, total: res.total, paid: res.paid_amount });
      resetForm();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const info = apiError(err);
      if (info.code === 'STK_001') setShortage(info.details as StockShortageDetails);
      else if (override) setOverrideError(info.message);
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
          <p className="mt-1 text-sm text-gray-500">
            {isEdit
              ? 'Change the order before work starts. Prices are recalculated; payments already taken are kept.'
              : `Roofing, cladding, gutter and flashing orders for ${branch?.name ?? 'this branch'}. Placing an order sends it to the Order Queue.`}
          </p>
        </div>
        {!isEdit && (
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setHistoryOpen(true)} className="btn-secondary inline-flex items-center gap-1.5">
              <Icon name="clock" className="h-4 w-4" />
              History
            </button>
            <button type="button" onClick={() => setConfirmClear(true)} disabled={formIsBlank} className="btn-secondary inline-flex items-center gap-1.5 disabled:opacity-50">
              <Icon name="x" className="h-4 w-4" />
              Clear all
            </button>
          </div>
        )}
      </div>

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
              <p className="text-sm font-bold text-emerald-900">Order {placed.orderNumber} placed</p>
              <p className="mt-0.5 text-xs text-emerald-800">
                Total {formatRs(placed.total)} · Paid {formatRs(placed.paid)} · Balance {formatRs(Math.max(0, placed.total - placed.paid))}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPlaced(null)} className="rounded-md px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">
              New Order
            </button>
            <button
              type="button"
              onClick={() => void navigate({ to: '/order-queue', search: { notice: undefined } })}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
            >
              Go to Order Queue <Icon name="arrowRight" className="h-3.5 w-3.5" />
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

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <form onSubmit={submit}>
          {/* 1. Customer & order details */}
          <div className="border-b border-gray-200 p-6">
            <SectionHeader step={nextStep()} title="Customer & Order Details" hint="Who the order is for and who is handling it." />
            <div className="mb-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
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
                <label className={labelCls}>Date</label>
                <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputCls} min-w-0`} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-5 border-t border-dashed border-gray-200 pt-5 sm:grid-cols-3">
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
          </div>

          {/* 2. Material source */}
          <div className="border-b border-gray-200 bg-gray-50 p-6">
            <SectionHeader
              step={nextStep()}
              title="Material Source"
              hint="Branch Stock = we use our coil. Customer Supplied = customer brings the material (needs a Gate Pass)."
            />
            {allowCustomer ? (
              <Segmented
                value={materialSource}
                onChange={changeSource}
                options={[
                  { value: MaterialSource.BRANCH, label: 'Branch Stock' },
                  { value: MaterialSource.CUSTOMER, label: 'Customer Supplied' },
                ]}
              />
            ) : (
              <p className="text-sm text-gray-700">Branch Stock only. This branch does not accept customer-supplied material.</p>
            )}
          </div>

          {showGatePass && (
            <OrderGatePassPanel
              phone={phone}
              required={general.require_gate_pass}
              documentLabel="Order"
              assigned={assigned}
              allocated={allocated}
              canCreate={canCreateGatePass}
              onCreateNew={goCreateGatePass}
              onAllocate={setAllocationTarget}
              onUnassign={unassign}
            />
          )}

          {/* 3. Coil for the whole order */}
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

          {/* 4. Add / edit item */}
          <div id="order-item-editor" className={`scroll-mt-4 border-b border-gray-200 p-6 ${editingKey ? 'bg-amber-50/50' : ''}`}>
            <SectionHeader
              step={nextStep()}
              title={editingKey ? 'Edit Item' : 'Add Item'}
              hint="Pick what is being made, then fill the details. You can add as many items as needed."
            />

            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-700">a. What is being made?</p>
            <div className="mb-6">
              <ChoiceTiles
                tiles={categories.map((c) => ({ value: c, label: c, icon: CATEGORY_ICONS[c], count: items.filter((i) => i.category === c).length }))}
                value={draft.category}
                onChange={selectCategory}
              />
            </div>

            {draft.category && (
              <>
                <div className="mb-6 flex flex-wrap gap-x-10 gap-y-4">
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-700">b. Job type</p>
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
                  {allowCustomer && (
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-700">Material for this item</p>
                      <Segmented
                        value={draft.material_source}
                        onChange={(v) => setField('material_source', v)}
                        options={[
                          { value: MaterialSource.BRANCH, label: 'Branch Stock' },
                          { value: MaterialSource.CUSTOMER, label: 'Customer Supplied' },
                        ]}
                      />
                    </div>
                  )}
                </div>

                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-700">c. {draft.category} details</p>
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
                                    onChange={(v) => updateRow(row.key, { accessory_type: v || undefined, accessory_variant: undefined })}
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
                                      onChange={(v) => updateRow(row.key, { accessory_variant: v })}
                                      options={acc.variants.map((v) => ({ value: v, label: v }))}
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
                                    onChange={(e) => updateRow(row.key, { quantity: parseNumber(e.target.value) })}
                                    className={inputCls}
                                  />
                                </div>
                                {rowNeedsCoil && coilField(row.coil_item_id, (v) => updateRow(row.key, { coil_item_id: v }))}
                                {custom && (
                                  <DesignPhotoField
                                    value={row.design_attachment_id}
                                    required={roofing.require_design_photo}
                                    onChange={(id) => updateRow(row.key, { design_attachment_id: id })}
                                  />
                                )}
                                <div className="col-span-full">
                                  <label className={labelCls}>Remarks</label>
                                  <input
                                    type="text"
                                    value={row.remarks ?? ''}
                                    onChange={(e) => updateRow(row.key, { remarks: e.target.value })}
                                    className={inputCls}
                                    placeholder="Optional notes for the workshop"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {!editingKey && (
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

                    {!accessory && editorItems[0] && lineNeedsCoil(editorItems[0], roofing) && coilField(draft.coil_item_id, (v) => setField('coil_item_id', v))}

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
                          <Icon name="plus" className="mr-2 h-4 w-4" /> {editorItems.length > 1 ? `Add ${editorItems.length} Items to Order` : 'Add to Order'}
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
              <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-500">No items added yet. Choose a category above to start.</div>
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
                          isEditing={editingKey === item.key}
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

          {/* Pricing & payment */}
          {items.length > 0 && (
            <div className="border-t border-gray-200 p-6">
              <SectionHeader
                step={nextStep()}
                title={isEdit ? 'Pricing' : 'Pricing & Payment'}
                hint={
                  isEdit
                    ? 'Prices are recalculated from the branch rates. Payments already taken are kept.'
                    : 'Prices come from the branch rate table. Take the payment to place the order.'
                }
              />
              {missingRates.length > 0 && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <Icon name="alertCircle" className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    No rate set for <strong>{missingRates.join(', ')}</strong>. Ask the branch manager to add it in Order Settings before placing this order.
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-5">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>
                      Subtotal ({items.length} item{items.length !== 1 && 's'})
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

                {!isEdit && (
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
                        ...(policy.min_payment_to_place === 'ADVANCE' && minToPlace > 0 && minToPlace < total
                          ? [{ label: `${policy.min_advance_pct}% advance`, amount: minToPlace }]
                          : []),
                        { label: 'Full', amount: total },
                      ]}
                    />
                    <p className="mt-3 text-xs text-gray-500">
                      {policy.min_payment_to_place === 'NONE'
                        ? 'No payment is needed to place this order.'
                        : `Minimum to place: ${formatRs(minToPlace)}${policy.min_payment_to_place === 'FULL' ? ' (full payment)' : ` (${policy.min_advance_pct}%)`}.`}{' '}
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
              {busy ? 'Saving…' : isEdit ? 'Update Order' : 'Place Order'}
              <Icon name="arrowRight" className="ml-2 h-4 w-4" />
            </button>
          </div>
        </form>
      </div>

      {allocationTarget && (
        <MaterialAllocationModal
          key={allocationTarget.gate_pass_id}
          gatePass={allocationTarget}
          documentType="ROOFING_ORDER"
          picked={allocationTarget.gate_pass_id === assigned?.gate_pass_id ? picked : {}}
          committed={allocationTarget.gate_pass_id === initial.assigned?.gate_pass_id ? committed : {}}
          onClose={() => setAllocationTarget(null)}
          onConfirm={(picked) => {
            setAssigned(allocationTarget);
            setAllocated(picked);
            setAllocationChanged(true);
            setMaterialSource(MaterialSource.CUSTOMER);
            setPhone((p) => p || allocationTarget.customer_phone);
            setName((n) => n || allocationTarget.customer_name);
            setAllocationTarget(null);
          }}
        />
      )}

      {historyOpen && <OrderHistoryModal type="roofing-orders" hidden={!!historyOrderId} onClose={() => setHistoryOpen(false)} onOpenOrder={setHistoryOrderId} />}
      {historyOrderId && <OrderDetailModal orderId={historyOrderId} onClose={() => setHistoryOrderId(null)} actions={() => null} />}

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
