import { useMemo, useRef, useState, type FormEvent } from 'react';
import type { JobCardSearch } from '@/app/search-params';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { DEFAULT_BRANCH_SETTINGS, MaterialSource, isSearchablePhone, toBranchDate, type StockOverride, type WorkshopJobType } from '@erp/shared';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { SectionHeader } from '@/shared/components/FormSection';
import { Icon } from '@/shared/components/Icon';
import { Notice } from '@/shared/components/Notice';
import { StockOverrideDialog, type StockShortageDetails } from '@/shared/components/StockOverrideDialog';
import { apiError, newRequestId } from '@/shared/api/errors';
import { useBranchContext } from '@/shared/hooks/useBranchContext';
import { readFormDraft, useFormDraft } from '@/shared/hooks/useFormDraft';
import { usePermission } from '@/shared/hooks/usePermission';
import { formatRs } from '@/shared/lib/format';
import { CustomerPhoneInput } from '@/modules/customers/components/CustomerPhoneInput';
import { useAvailableGatePasses, useGatePass, type GatePassDto } from '@/modules/gate-passes/hooks/useGatePasses';
import { CustomerMaterialPanel } from '@/modules/job-cards/components/CustomerMaterialPanel';
import { SubJobList } from '@/modules/job-cards/components/SubJobList';
import { WorkOrderModal } from '@/modules/job-cards/components/WorkOrderModal';
import { OrderHistoryModal } from '@/modules/orders/components/OrderHistoryModal';
import { SubJobTemplate } from '@/modules/job-cards/components/SubJobTemplate';
import { WorkerMultiSelect } from '@/modules/job-cards/components/WorkerMultiSelect';
import { customerMaterialOptions, materialLabel, materialSpecs, usedByCard } from '@/modules/job-cards/lib/customer-material';
import { emptySubJob, fromLineSpec, subJobIssues, toLineInput, type SubJobForm } from '@/modules/job-cards/lib/sub-job-form';
import { useCreateJobCard, useJobCardQuote, useOrderDetail, useUpdateJobCard, type OrderDetailDto } from '@/modules/orders/hooks/useOrders';

/** Everything typed on Create Job Card, kept while the user visits other pages (sessionStorage, see useFormDraft). */
interface SavedDraft {
  phone: string;
  name: string;
  jobDate: string;
  workerIds: string[];
  subJobs: SubJobForm[];
  /** The half-filled sub-job panel */
  template: SubJobForm | null;
  editingKey: string | null;
  /** Material of the last sub-job added; the next one starts with it */
  lastSource?: MaterialSource;
}

const inputCls = 'block w-full rounded-md border border-gray-300 py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm';
const labelCls = 'mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500';

interface InitialState {
  phone: string;
  name: string;
  jobDate: string;
  workerIds: string[];
  subJobs: SubJobForm[];
  template: SubJobForm | null;
  editingKey: string | null;
  lastSource: MaterialSource;
  /** The form was filled from a saved draft */
  restored: boolean;
}

/** Drafts kept before sub-jobs carried their gate pass item miss those fields. */
const withDefaults = (j: SubJobForm): SubJobForm => ({ ...emptySubJob(j.job_type, j.material_source, {}), ...j });

/** The first item on a pass that still has material. */
const firstAvailableItem = (gp: GatePassDto) => gp.summary.item_balances.find((b) => b.available > 0)?.gp_item_id ?? '';

/**
 * Loads what the form starts from (the job card being edited, or for a new card the
 * draft kept from an earlier visit, and a gate pass to take material from), then
 * mounts the form with it. Edit pages always start from the server.
 */
export function JobCardFormPage() {
  const params = useParams({ strict: false }) as { orderId?: string };
  const search = useSearch({ strict: false }) as JobCardSearch;
  const orderId = params.orderId;
  const [saved] = useState(() => (orderId ? null : readFormDraft<SavedDraft>('jobCard')));
  const existingQ = useOrderDetail(orderId);
  const linkedQ = useGatePass(search.gatePass);

  const waiting = (!!orderId && existingQ.isPending) || (!!search.gatePass && linkedQ.isPending);
  if (waiting) return <div className="py-24 text-center text-sm text-slate-400">Loading…</div>;

  const existing = existingQ.data;
  const linked = linkedQ.data ?? null;
  let initial: InitialState = {
    phone: '',
    name: '',
    jobDate: toBranchDate(),
    workerIds: [],
    subJobs: [],
    template: null,
    editingKey: null,
    lastSource: MaterialSource.BRANCH,
    restored: false,
  };
  if (saved) {
    initial = {
      ...initial,
      phone: saved.phone,
      name: saved.name,
      jobDate: saved.jobDate,
      workerIds: saved.workerIds,
      subJobs: saved.subJobs.map(withDefaults),
      template: saved.template ? withDefaults(saved.template) : null,
      editingKey: saved.editingKey,
      lastSource: saved.lastSource ?? MaterialSource.BRANCH,
      restored: true,
    };
  } else if (existing) {
    const active = existing.lines.filter((l) => l.status !== 'CANCELLED');
    initial = {
      ...initial,
      phone: existing.customer?.phone ?? '',
      name: existing.customer?.name ?? '',
      jobDate: existing.header.job_date ?? toBranchDate(existing.created_at),
      workerIds: existing.workers.map((w) => w.employee_id),
      subJobs: active.map((l) => fromLineSpec(l.spec, l.line_id)),
    };
  }
  // Came from a gate pass (details, or just created): the next sub-job takes its material
  if (linked && (!initial.phone || isSamePhone(initial.phone, linked.customer_phone))) {
    const base = initial.editingKey ? null : (initial.template ?? null);
    initial = {
      ...initial,
      phone: initial.phone || linked.customer_phone,
      name: initial.name || linked.customer_name,
      lastSource: MaterialSource.CUSTOMER,
      template: initial.editingKey
        ? initial.template
        : {
            ...(base ?? emptySubJob('CUT_BEND', MaterialSource.CUSTOMER, {})),
            material_source: MaterialSource.CUSTOMER,
            gp_item_id: firstAvailableItem(linked),
            gp_quantity: '',
          },
    };
  }
  return <JobCardForm key={orderId ?? 'new'} orderId={orderId} existing={existing} initial={initial} />;
}

const isSamePhone = (a: string, b: string) => a.replace(/\D/g, '').slice(-9) === b.replace(/\D/g, '').slice(-9);

function JobCardForm({ orderId, existing, initial }: { orderId?: string; existing?: OrderDetailDto; initial: InitialState }) {
  const navigate = useNavigate();
  const isEdit = !!orderId;
  const { can } = usePermission();

  const { settings, branch, featureOn } = useBranchContext();
  const workshop = settings?.workshop ?? DEFAULT_BRANCH_SETTINGS.workshop;
  const general = settings?.general ?? DEFAULT_BRANCH_SETTINGS.general;
  // Customer material always comes from a gate pass item (Docs/decisions/0007)
  const customerOn = general.allow_customer_material && featureOn('gatePass');

  const create = useCreateJobCard();
  const update = useUpdateJobCard(orderId ?? '');
  const requestId = useRef(newRequestId());

  const [phone, setPhone] = useState(initial.phone);
  const [name, setName] = useState(initial.name);
  const [jobDate, setJobDate] = useState(initial.jobDate);
  const [workerIds, setWorkerIds] = useState<string[]>(initial.workerIds);
  const [subJobs, setSubJobs] = useState<SubJobForm[]>(initial.subJobs);
  const defaults = useMemo(
    () => ({ material: workshop.materials[0], rollingType: workshop.rolling_types[0], workType: workshop.rolling_work_types[0] }),
    [workshop],
  );
  const [lastSource, setLastSource] = useState<MaterialSource>(initial.lastSource);
  const blankTemplate = (source: MaterialSource, jobType: WorkshopJobType = workshop.job_types[0] ?? 'CUT_BEND') =>
    emptySubJob(jobType, customerOn ? source : MaterialSource.BRANCH, defaults);
  const [template, setTemplate] = useState<SubJobForm>(() => initial.template ?? blankTemplate(initial.lastSource));
  const [editingKey, setEditingKey] = useState<string | null>(initial.editingKey);

  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ orderId: string; orderNumber: string; total: number; minAdvance: number } | null>(null);
  // Saving holds branch material; not enough available asks for a stock override (Docs/decisions/0003)
  const [shortage, setShortage] = useState<StockShortageDetails | null>(null);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [restored, setRestored] = useState(initial.restored);
  const [confirmClear, setConfirmClear] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyOrderId, setHistoryOrderId] = useState<string | null>(null);

  // ── Draft: a new card is kept while the user visits other pages ────────────
  const draftValue: SavedDraft = { phone, name, jobDate, workerIds, subJobs, template, editingKey, lastSource };
  const isBlank = (d: SavedDraft) =>
    !d.phone.trim() &&
    !d.name.trim() &&
    d.jobDate === toBranchDate() &&
    d.workerIds.length === 0 &&
    d.subJobs.length === 0 &&
    !d.editingKey &&
    (!d.template || sameAsBlank(d.template, emptySubJob(d.template.job_type, d.template.material_source, defaults)));
  const clearDraft = useFormDraft('jobCard', draftValue, { enabled: !isEdit, isEmpty: isBlank });
  const formIsBlank = isBlank(draftValue);

  // ── Customer material: the customer's gate pass items (Docs/decisions/0007) ─
  const phoneReady = isSearchablePhone(phone);
  const passesQ = useAvailableGatePasses(phone, null, customerOn && (phoneReady || isEdit), orderId);
  // The card's saved material counts as used on the server; it is this card's to use again
  const [committed] = useState(() => {
    const c: Record<string, number> = {};
    for (const m of existing?.customer_materials ?? []) c[m.gp_item_id] = (c[m.gp_item_id] ?? 0) + m.quantity;
    return c;
  });
  const options = useMemo(() => customerMaterialOptions(passesQ.data ?? [], committed), [passesQ.data, committed]);
  const usedOnCard = useMemo(() => usedByCard(subJobs), [subJobs]);
  const usedByOthers = useMemo(() => usedByCard(subJobs, editingKey), [subJobs, editingKey]);
  const editorMaterials = useMemo(() => options.map((o) => ({ ...o, left: o.max - (usedByOthers[o.gp_item_id] ?? 0) })), [options, usedByOthers]);
  const materialNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const l of existing?.lines ?? []) {
      const m = l.customer_material;
      if (m) names[m.gp_item_id] = materialLabel({ pass_number: m.pass_number, material_type: m.material_type, specs: materialSpecs(m) });
    }
    for (const o of options) names[o.gp_item_id] = materialLabel(o);
    return names;
  }, [existing, options]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const lines = useMemo(() => subJobs.map(toLineInput), [subJobs]);
  const quote = useJobCardQuote(lines);
  const pickedMaterial = editorMaterials.find((m) => m.gp_item_id === template.gp_item_id);
  const templateIssues = [
    ...subJobIssues(template),
    ...(template.material_source === MaterialSource.CUSTOMER && pickedMaterial && Number(template.gp_quantity) > pickedMaterial.left
      ? [`Only ${Math.max(0, pickedMaterial.left)} left of that gate pass item`]
      : []),
  ];
  const locked = isEdit && existing ? !existing.can_edit : false;
  const missingRates = quote.data?.missing_rates ?? [];
  const subtotal = quote.data?.subtotal ?? 0;
  const minAdvance = quote.data?.min_advance ?? 0;
  const alreadyPaid = existing?.paid_amount ?? 0;
  // Older cards held customer material for the whole card, not per sub-job
  const unlinked = subJobs.some((j) => j.material_source === MaterialSource.CUSTOMER && !j.gp_item_id);
  const counts = useMemo(() => {
    const c: Partial<Record<WorkshopJobType, number>> = {};
    for (const j of subJobs) c[j.job_type] = (c[j.job_type] ?? 0) + 1;
    return c;
  }, [subJobs]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const changeTemplate = (patch: Partial<SubJobForm>) =>
    setTemplate((t) => {
      const next = { ...t, ...patch };
      // Switching to the customer's material with only one item left: pick it
      if (patch.material_source === MaterialSource.CUSTOMER && !next.gp_item_id) {
        const open = editorMaterials.filter((m) => m.left > 0);
        if (open.length === 1) next.gp_item_id = open[0].gp_item_id;
      }
      return next;
    });

  const submitTemplate = () => {
    if (templateIssues.length) return;
    if (editingKey) {
      setSubJobs((prev) => prev.map((j) => (j.key === editingKey ? { ...template, key: editingKey } : j)));
      setEditingKey(null);
    } else {
      setSubJobs((prev) => [...prev, { ...template, key: crypto.randomUUID() }]);
    }
    setLastSource(template.material_source);
    setTemplate(blankTemplate(template.material_source, template.job_type));
  };

  const startEditing = (job: SubJobForm) => {
    setEditingKey(job.key);
    setTemplate({ ...job });
    document.getElementById('job-card-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const duplicateSubJob = (job: SubJobForm) =>
    setSubJobs((list) => {
      const at = list.findIndex((j) => j.key === job.key);
      // A copy is a new line, never the saved one
      const copy = { ...job, key: crypto.randomUUID(), line_id: undefined };
      return [...list.slice(0, at + 1), copy, ...list.slice(at + 1)];
    });

  const removeSubJob = (key: string) => {
    setSubJobs((prev) => prev.filter((j) => j.key !== key));
    if (editingKey === key) {
      setEditingKey(null);
      setTemplate(blankTemplate(lastSource, template.job_type));
    }
  };

  const goCreateGatePass = () => {
    // A new card is already kept as a draft; it is waiting when the user comes back
    void navigate({ to: '/gate-pass', search: { tab: 'create', return_to: 'job-card', phone, name } });
  };

  const resetForm = () => {
    setPhone('');
    setName('');
    setJobDate(toBranchDate());
    setWorkerIds([]);
    setSubJobs([]);
    setEditingKey(null);
    setLastSource(MaterialSource.BRANCH);
    setTemplate(blankTemplate(MaterialSource.BRANCH));
    setRestored(false);
    clearDraft();
    requestId.current = newRequestId();
  };

  const clearAll = () => {
    setConfirmClear(false);
    setError(null);
    setCreated(null);
    resetForm();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancel = () => {
    if (isEdit) {
      void navigate({ to: '/workshop-queue', search: { notice: undefined } });
      return;
    }
    resetForm();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreated(null);
    if (subJobs.length === 0) return setError('Please add at least one sub-job before submitting.');
    if (workerIds.length === 0) return setError('Assign at least one worker.');
    if (missingRates.length > 0) return setError('Some sub-jobs have no standard rate. Mark them Custom and enter a price.');
    if (unlinked) return setError("Pick the gate pass item for each sub-job on the customer's material.");
    const over = options.find((o) => (usedOnCard[o.gp_item_id] ?? 0) > o.max);
    if (over) return setError(`The sub-jobs use more ${over.material_type} than is left on ${over.pass_number} (${over.max}).`);
    await save();
  };

  const save = async (override?: StockOverride) => {
    setOverrideError(null);
    const body = {
      customer: { phone: phone.trim(), name: name.trim() },
      job_date: jobDate,
      worker_ids: workerIds,
      lines,
      override,
    };
    try {
      if (isEdit && existing) {
        const res = await update.mutateAsync({ ...body, version: existing.version });
        void navigate({
          to: '/workshop-queue',
          search: { notice: res.advance_shortfall > 0 ? `${res.order_number} updated — ${formatRs(res.advance_shortfall)} more advance is due at the cashier.` : `${res.order_number} updated.` },
        });
        return;
      }
      const res = await create.mutateAsync({ ...body, client_request_id: requestId.current });
      setShortage(null);
      setCreated({ orderId: res.order_id, orderNumber: res.order_number, total: res.total, minAdvance: res.min_advance });
      resetForm();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const info = apiError(err);
      if (info.code === 'STK_001') setShortage(info.details as StockShortageDetails);
      else if (override) setOverrideError(info.message);
      else setError(info.message);
    }
  };

  let step = 0;
  const nextStep = () => ++step;
  const busy = create.isPending || update.isPending;

  return (
    <div className="mx-auto mb-10 max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{isEdit ? `Edit Job Card ${existing?.order_number ?? ''}` : 'Create Job Card'}</h1>
          {/* <p className="mt-1 text-sm text-gray-500">
            {isEdit
              ? `${existing?.display_label ?? ''}. Change the card before work starts. Prices are recalculated; payments already taken are kept.`
              : `Cut / bend, coil cutting and rolling work for ${branch?.name ?? 'this branch'}. Submitting sends it to the Cashier Queue for the advance.`}
          </p> */}
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
          Your unfinished job card was kept while you were away. Carry on, or use Clear all to start again.
        </Notice>
      )}

      {created && (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Icon name="checkCircle" className="h-6 w-6 shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-bold text-emerald-900">Job card {created.orderNumber} created and sent to the Cashier Queue</p>
              <p className="mt-0.5 text-xs text-emerald-800">
                Total {formatRs(created.total)} · Minimum advance {formatRs(created.minAdvance)}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setCreated(null)} className="rounded-md px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">
              New Job Card
            </button>
            <button
              type="button"
              onClick={() => setHistoryOrderId(created.orderId)}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
            >
              Open Job Card <Icon name="arrowRight" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {locked && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Icon name="lock" className="h-5 w-5 shrink-0 text-amber-600" />
          <span>Work has started on this job card, so it can no longer be edited.</span>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <form onSubmit={submit}>
          <fieldset disabled={locked} className="contents">
            {/* 1. Customer, date and workers */}
            <div className="border-b border-gray-200 p-6">
              <SectionHeader step={nextStep()} title="Customer & Job Details"/>
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
                  <input required type="date" value={jobDate} onChange={(e) => setJobDate(e.target.value)} className={`${inputCls} min-w-0`} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-5 border-t border-dashed border-gray-200 pt-5 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className={labelCls}>
                    Worker(s) <span className="text-red-500">*</span>
                  </label>
                  <WorkerMultiSelect value={workerIds} onChange={setWorkerIds} />
                </div>
              </div>
              {customerOn && (
                <CustomerMaterialPanel
                  phoneReady={phoneReady}
                  loading={passesQ.isLoading}
                  options={options}
                  used={usedOnCard}
                  canCreate={can('create', 'gate_pass')}
                  onCreateNew={goCreateGatePass}
                />
              )}
            </div>

            {unlinked && !locked && (
              <div className="border-b border-gray-200 px-6 py-4">
                <Notice tone="warning">
                  Some sub-jobs on the customer's material have no gate pass item yet. Edit each one and pick the item it uses.
                </Notice>
              </div>
            )}

            {/* 2. Add / edit sub-job */}
            {!locked && (
              <SubJobTemplate
                id="job-card-editor"
                step={nextStep()}
                form={template}
                onChange={changeTemplate}
                workshop={workshop}
                customerOn={customerOn}
                materials={editorMaterials}
                phoneReady={phoneReady}
                canCreateGatePass={can('create', 'gate_pass')}
                onCreateGatePass={goCreateGatePass}
                counts={counts}
                editing={!!editingKey}
                issues={templateIssues}
                onSubmit={submitTemplate}
                onCancelEdit={() => {
                  setEditingKey(null);
                  setTemplate(blankTemplate(lastSource, template.job_type));
                }}
              />
            )}

            <SubJobList
              subJobs={subJobs}
              priced={quote.data?.lines ?? []}
              editingKey={editingKey}
              locked={locked}
              materialNames={materialNames}
              onEdit={startEditing}
              onDuplicate={duplicateSubJob}
              onRemove={removeSubJob}
            />

            {/* Pricing */}
            {subJobs.length > 0 && (
              <div className="border-t border-gray-200 p-6">
                <SectionHeader
                  step={nextStep()}
                  title="Pricing"
                  hint={
                    isEdit
                      ? 'Prices are recalculated from the branch rates. Payments already taken are kept.'
                      : 'Prices come from the branch rate table. The advance is collected at the Cashier Queue.'
                  }
                />
                {missingRates.length > 0 && (
                  <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <Icon name="alertCircle" className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      {missingRates.length === 1 ? 'One sub-job has' : `${missingRates.length} sub-jobs have`} no standard rate. Edit {missingRates.length === 1 ? 'it' : 'them'},
                      choose <strong>Custom</strong> pricing and enter the price.
                    </span>
                  </div>
                )}
                <div className="max-w-lg space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-bold text-gray-900">
                      Total ({subJobs.length} sub-job{subJobs.length !== 1 && 's'})
                    </span>
                    <span className="text-xl font-bold tabular-nums text-[#0033A0]">{formatRs(subtotal)}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 pt-3 text-sm text-gray-600">
                    <span>Advance to collect at the cashier</span>
                    <span className="font-semibold tabular-nums text-gray-900">{formatRs(minAdvance)}</span>
                  </div>
                  {existing && (
                    <>
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>Already paid</span>
                        <span className="font-semibold tabular-nums text-emerald-700">{formatRs(alreadyPaid)}</span>
                      </div>
                      {alreadyPaid > subtotal ? (
                        <p className="text-xs font-semibold text-amber-700">Refund due: {formatRs(alreadyPaid - subtotal)}</p>
                      ) : (
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>Balance</span>
                          <span className="font-semibold tabular-nums text-amber-700">{formatRs(subtotal - alreadyPaid)}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </fieldset>

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
              disabled={locked || busy}
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-[#0033A0] px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {busy ? 'Saving…' : isEdit ? 'Update Job Card' : 'Submit Job Card'}
              <Icon name="arrowRight" className="ml-2 h-4 w-4" />
            </button>
          </div>
        </form>
      </div>

      {historyOpen && <OrderHistoryModal type="job-cards" hidden={!!historyOrderId} onClose={() => setHistoryOpen(false)} onOpenOrder={setHistoryOrderId} />}
      {historyOrderId && (
        <WorkOrderModal
          readOnly
          orderId={historyOrderId}
          onClose={() => setHistoryOrderId(null)}
          // Unpaid drafts are edited from here: they are not on the Workshop Queue board (Docs/decisions/0005)
          onEdit={() => {
            setHistoryOrderId(null);
            setHistoryOpen(false);
            void navigate({ to: '/job-cards/$orderId/edit', params: { orderId: historyOrderId } });
          }}
        />
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Clear everything on this form?"
        message="The customer, date, workers and all sub-jobs will be removed."
        confirmLabel="Clear all"
        isDestructive
        onConfirm={clearAll}
        onCancel={() => setConfirmClear(false)}
      />

      {shortage && (
        <StockOverrideDialog
          mode="save"
          details={shortage}
          pending={create.isPending || update.isPending}
          error={overrideError}
          onConfirm={(ov) => void save(ov)}
          onClose={() => setShortage(null)}
        />
      )}
    </div>
  );
}

/** A sub-job panel nobody has typed into yet (its random key aside). */
function sameAsBlank(a: SubJobForm, blank: SubJobForm): boolean {
  return JSON.stringify({ ...a, key: '' }) === JSON.stringify({ ...blank, key: '' });
}
