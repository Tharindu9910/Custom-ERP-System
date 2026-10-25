import { useMemo, useRef, useState, type FormEvent } from 'react';
import type { JobCardSearch } from '@/app/search-params';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { DEFAULT_BRANCH_SETTINGS, MaterialSource, toBranchDate, type StockOverride, type WorkshopJobType } from '@erp/shared';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { Icon } from '@/shared/components/Icon';
import { Notice } from '@/shared/components/Notice';
import { StockOverrideDialog, type StockShortageDetails } from '@/shared/components/StockOverrideDialog';
import { apiError, newRequestId } from '@/shared/api/errors';
import { useBranchContext } from '@/shared/hooks/useBranchContext';
import { readFormDraft, useFormDraft } from '@/shared/hooks/useFormDraft';
import { formatRs } from '@/shared/lib/format';
import { CustomerPhoneInput } from '@/modules/customers/components/CustomerPhoneInput';
import { MaterialAllocationModal, type AllocatedItem } from '@/modules/gate-passes/components/MaterialAllocationModal';
import { OrderGatePassPanel } from '@/modules/gate-passes/components/OrderGatePassPanel';
import { useGatePass, type GatePassDto } from '@/modules/gate-passes/hooks/useGatePasses';
import { SubJobList } from '@/modules/job-cards/components/SubJobList';
import { WorkOrderModal } from '@/modules/job-cards/components/WorkOrderModal';
import { OrderHistoryModal } from '@/modules/orders/components/OrderHistoryModal';
import { SubJobTemplate } from '@/modules/job-cards/components/SubJobTemplate';
import { WorkerMultiSelect } from '@/modules/job-cards/components/WorkerMultiSelect';
import { emptySubJob, fromLineSpec, subJobIssues, toLineInput, type SubJobForm } from '@/modules/job-cards/lib/sub-job-form';
import { useCreateJobCard, useJobCardQuote, useOrderDetail, useUpdateJobCard, type OrderDetailDto } from '@/modules/orders/hooks/useOrders';

/** Everything typed on Create Job Card, kept while the user visits other pages (sessionStorage, see useFormDraft). */
interface SavedDraft {
  phone: string;
  name: string;
  jobDate: string;
  workerIds: string[];
  materialSource: MaterialSource;
  subJobs: SubJobForm[];
  /** The half-filled sub-job panel */
  template: SubJobForm | null;
  editingKey: string | null;
  /** Customer material picked from a gate pass (re-checked by the server on save) */
  gatePassId: string | null;
  allocations: { gp_item_id: string; quantity: number }[];
  allocationChanged: boolean;
}

const inputCls = 'block w-full rounded-md border border-gray-300 py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm';
const labelCls = 'mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500';

interface InitialState {
  phone: string;
  name: string;
  jobDate: string;
  workerIds: string[];
  materialSource: MaterialSource;
  subJobs: SubJobForm[];
  template: SubJobForm | null;
  editingKey: string | null;
  assigned: GatePassDto | null;
  allocated: AllocatedItem[];
  allocationChanged: boolean;
  allocationTarget: GatePassDto | null;
  /** The form was filled from a saved draft */
  restored: boolean;
}

/**
 * Loads what the form starts from (the job card being edited and its gate pass, or
 * for a new card the draft kept from an earlier visit, and the pass to allocate
 * from), then mounts the form with it. Edit pages always start from the server.
 */
export function JobCardFormPage() {
  const params = useParams({ strict: false }) as { orderId?: string };
  const search = useSearch({ strict: false }) as JobCardSearch;
  const orderId = params.orderId;
  const [saved] = useState(() => (orderId ? null : readFormDraft<SavedDraft>('jobCard')));
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
    jobDate: toBranchDate(),
    workerIds: [],
    materialSource: MaterialSource.BRANCH,
    subJobs: [],
    template: null,
    editingKey: null,
    assigned: null,
    allocated: [],
    allocationChanged: false,
    allocationTarget: null,
    restored: false,
  };
  if (saved) {
    // A pass that has gone (or lost an item) since is dropped; the server re-checks quantities on save
    const pass = committedQ.data ?? null;
    const allocated = pass
      ? saved.allocations.map((a) => ({ item: pass.items.find((i) => i.gp_item_id === a.gp_item_id)!, quantity: a.quantity })).filter((x) => x.item)
      : [];
    initial = {
      ...initial,
      phone: saved.phone,
      name: saved.name,
      jobDate: saved.jobDate,
      workerIds: saved.workerIds,
      materialSource: saved.materialSource,
      subJobs: saved.subJobs,
      template: saved.template,
      editingKey: saved.editingKey,
      assigned: pass,
      allocated,
      allocationChanged: !!pass && saved.allocationChanged,
      restored: true,
    };
  } else if (existing) {
    const pass = committedQ.data ?? null;
    initial = {
      ...initial,
      phone: existing.customer?.phone ?? '',
      name: existing.customer?.name ?? '',
      jobDate: existing.header.job_date ?? toBranchDate(existing.created_at),
      workerIds: existing.workers.map((w) => w.employee_id),
      materialSource: (existing.header.material_source as MaterialSource) ?? MaterialSource.BRANCH,
      subJobs: existing.lines.filter((l) => l.status !== 'CANCELLED').map((l) => fromLineSpec(l.spec, l.line_id)),
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
  return <JobCardForm key={orderId ?? 'new'} orderId={orderId} existing={existing} initial={initial} />;
}

function JobCardForm({ orderId, existing, initial }: { orderId?: string; existing?: OrderDetailDto; initial: InitialState }) {
  const navigate = useNavigate();
  const isEdit = !!orderId;

  const { settings, featureOn } = useBranchContext();
  const workshop = settings?.workshop ?? DEFAULT_BRANCH_SETTINGS.workshop;
  const general = settings?.general ?? DEFAULT_BRANCH_SETTINGS.general;
  const allowCustomer = general.allow_customer_material;

  const create = useCreateJobCard();
  const update = useUpdateJobCard(orderId ?? '');
  const requestId = useRef(newRequestId());

  const [phone, setPhone] = useState(initial.phone);
  const [name, setName] = useState(initial.name);
  const [jobDate, setJobDate] = useState(initial.jobDate);
  const [workerIds, setWorkerIds] = useState<string[]>(initial.workerIds);
  const [materialSource, setMaterialSource] = useState<MaterialSource>(initial.materialSource);
  const [subJobs, setSubJobs] = useState<SubJobForm[]>(initial.subJobs);
  const defaults = useMemo(
    () => ({ material: workshop.materials[0], rollingType: workshop.rolling_types[0], workType: workshop.rolling_work_types[0] }),
    [workshop],
  );
  const blankTemplate = (source: MaterialSource) => emptySubJob(workshop.job_types[0] ?? 'CUT_BEND', source, defaults);
  const [template, setTemplate] = useState<SubJobForm>(() => initial.template ?? blankTemplate(initial.materialSource));
  const [editingKey, setEditingKey] = useState<string | null>(initial.editingKey);

  const [assigned, setAssigned] = useState<GatePassDto | null>(initial.assigned);
  const [allocated, setAllocated] = useState<AllocatedItem[]>(initial.allocated);
  // True once the material was picked in this session; it is sent and saved with the order
  const [allocationChanged, setAllocationChanged] = useState(initial.allocationChanged);
  const [allocationTarget, setAllocationTarget] = useState<GatePassDto | null>(initial.allocationTarget);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Saving holds branch material; not enough available asks for a stock override (Docs/decisions/0003)
  const [shortage, setShortage] = useState<StockShortageDetails | null>(null);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [restored, setRestored] = useState(initial.restored);
  const [confirmClear, setConfirmClear] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyOrderId, setHistoryOrderId] = useState<string | null>(null);

  // ── Draft: a new card is kept while the user visits other pages ────────────
  const draftValue: SavedDraft = {
    phone,
    name,
    jobDate,
    workerIds,
    materialSource,
    subJobs,
    template,
    editingKey,
    gatePassId: assigned?.gate_pass_id ?? null,
    allocations: allocated.map((a) => ({ gp_item_id: a.item.gp_item_id, quantity: a.quantity })),
    allocationChanged,
  };
  const isBlank = (d: SavedDraft) =>
    !d.phone.trim() &&
    !d.name.trim() &&
    d.jobDate === toBranchDate() &&
    d.workerIds.length === 0 &&
    d.subJobs.length === 0 &&
    !d.gatePassId &&
    !d.editingKey &&
    (!d.template || sameAsBlank(d.template, emptySubJob(d.template.job_type, d.materialSource, defaults)));
  const clearDraft = useFormDraft('jobCard', draftValue, { enabled: !isEdit, isEmpty: isBlank });
  const formIsBlank = isBlank(draftValue);

  // ── Derived ────────────────────────────────────────────────────────────────
  const lines = useMemo(() => subJobs.map(toLineInput), [subJobs]);
  const quote = useJobCardQuote(lines);
  const usesCustomerMaterial = materialSource === MaterialSource.CUSTOMER || subJobs.some((j) => j.material_source === MaterialSource.CUSTOMER);
  const showGatePass = featureOn('gatePass') && usesCustomerMaterial;
  const templateIssues = subJobIssues(template);
  const locked = isEdit && existing ? !existing.can_edit : false;
  const missingRates = quote.data?.missing_rates ?? [];

  const picked = useMemo(() => Object.fromEntries(allocated.map((a) => [a.item.gp_item_id, a.quantity])), [allocated]);
  // Material the saved order already holds (edit mode)
  const [committed] = useState(() => Object.fromEntries(initial.allocated.map((a) => [a.item.gp_item_id, a.quantity])));

  // ── Actions ────────────────────────────────────────────────────────────────

  const changeSource = (s: MaterialSource) => {
    setMaterialSource(s);
    // The template follows the default material source unless a sub-job is being edited
    if (!editingKey) setTemplate((t) => ({ ...t, material_source: s }));
    // Back to branch stock with no customer sub-jobs: give the material back
    if (s === MaterialSource.BRANCH && !subJobs.some((j) => j.material_source === MaterialSource.CUSTOMER)) {
      setAssigned(null);
      setAllocated([]);
      setAllocationChanged(false);
    }
  };

  const submitTemplate = () => {
    if (templateIssues.length) return;
    if (editingKey) {
      setSubJobs((prev) => prev.map((j) => (j.key === editingKey ? { ...template, key: editingKey } : j)));
      setEditingKey(null);
    } else {
      setSubJobs((prev) => [...prev, { ...template, key: crypto.randomUUID() }]);
    }
    setTemplate(emptySubJob(template.job_type, materialSource, defaults));
  };

  const goCreateGatePass = () => {
    // A new card is already kept as a draft; it is waiting when the user comes back
    void navigate({ to: '/gate-pass', search: { tab: 'create', return_to: 'job-card', phone, name } });
  };

  const unassign = () => {
    setAssigned(null);
    setAllocated([]);
    setAllocationChanged(false);
  };

  const resetForm = () => {
    setPhone('');
    setName('');
    setJobDate(toBranchDate());
    setWorkerIds([]);
    setMaterialSource(MaterialSource.BRANCH);
    setSubJobs([]);
    setAssigned(null);
    setAllocated([]);
    setAllocationChanged(false);
    setEditingKey(null);
    setTemplate(blankTemplate(MaterialSource.BRANCH));
    setRestored(false);
    clearDraft();
    requestId.current = newRequestId();
  };

  const clearAll = () => {
    setConfirmClear(false);
    setError(null);
    setSuccess(null);
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
    setSuccess(null);
    if (subJobs.length === 0) return setError('Please add at least one sub-job before submitting.');
    if (workerIds.length === 0) return setError('Assign at least one worker.');
    if (missingRates.length > 0) return setError('Some sub-jobs have no standard rate. Mark them Custom and enter a price.');
    if (general.require_gate_pass && featureOn('gatePass') && usesCustomerMaterial && !assigned) {
      return setError('This branch requires a gate pass for customer-supplied material. Assign or create one first.');
    }
    await save();
  };

  const save = async (override?: StockOverride) => {
    setOverrideError(null);
    const body = {
      customer: { phone: phone.trim(), name: name.trim() },
      job_date: jobDate,
      worker_ids: workerIds,
      material_source: materialSource,
      gate_pass_id: assigned?.gate_pass_id ?? null,
      allocations: assigned && allocationChanged ? allocated.map((a) => ({ gp_item_id: a.item.gp_item_id, quantity: a.quantity })) : null,
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
      setSuccess(`Job card ${res.order_number} created and sent to the Cashier Queue. Minimum advance: ${formatRs(res.min_advance)}.`);
      resetForm();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const info = apiError(err);
      if (info.code === 'STK_001') setShortage(info.details as StockShortageDetails);
      else if (override) setOverrideError(info.message);
      else setError(info.message);
    }
  };

  return (
    <div className="mx-auto mb-10 max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{isEdit ? `Edit Job Card ${existing?.order_number}` : 'Create Job Card'}</h1>
        {isEdit && existing && <span className="text-sm font-medium text-gray-500">{existing.display_label}</span>}
        {!isEdit && (
          <div className="flex items-center gap-2">
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

      {success && (
        <Notice tone="success" className="mb-4">
          {success}
        </Notice>
      )}
      {locked && (
        <Notice tone="warning" className="mb-4">
          Work has started on this job card, so it can no longer be edited.
        </Notice>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <form onSubmit={submit}>
          <fieldset disabled={locked} className="contents">
            {/* Customer, date and workers */}
            <div className="border-b border-gray-200 p-6">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-4">
                <div>
                  <label className={labelCls}>Phone Number</label>
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
                  <label className={labelCls}>Customer Name</label>
                  <input required type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Date</label>
                  <input required type="date" value={jobDate} onChange={(e) => setJobDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Worker(s)</label>
                  <WorkerMultiSelect value={workerIds} onChange={setWorkerIds} />
                </div>
              </div>
            </div>

            {allowCustomer && (
              <div className="border-b border-gray-200 bg-gray-50 p-6">
                <label className="mb-3 block text-xs font-bold uppercase tracking-wider text-gray-500">Default Material Source</label>
                <div className="inline-flex rounded-lg bg-gray-200 p-1">
                  {[MaterialSource.BRANCH, MaterialSource.CUSTOMER].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => changeSource(s)}
                      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                        materialSource === s ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {s === MaterialSource.BRANCH ? 'Branch Stock' : 'Customer Supplied'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showGatePass && (
              <OrderGatePassPanel
                phone={phone}
                required={general.require_gate_pass}
                documentLabel="Job Card"
                assigned={assigned}
                allocated={allocated}
                onCreateNew={goCreateGatePass}
                onAllocate={setAllocationTarget}
                onUnassign={unassign}
              />
            )}

            {!locked && (
              <SubJobTemplate
                form={template}
                onChange={(patch) => setTemplate((t) => ({ ...t, ...patch }))}
                workshop={workshop}
                allowCustomer={allowCustomer}
                editing={!!editingKey}
                issues={templateIssues}
                onSubmit={submitTemplate}
                onCancelEdit={() => {
                  setEditingKey(null);
                  setTemplate(emptySubJob(template.job_type as WorkshopJobType, materialSource, defaults));
                }}
              />
            )}

            <SubJobList
              subJobs={subJobs}
              priced={quote.data?.lines ?? []}
              editingKey={editingKey}
              locked={locked}
              onEdit={(j) => {
                setEditingKey(j.key);
                setTemplate({ ...j });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onRemove={(key) => setSubJobs((prev) => prev.filter((j) => j.key !== key))}
            />
          </fieldset>

          {error && (
            <div className="px-6 pb-4">
              <Notice tone="error">{error}</Notice>
            </div>
          )}

          <div className="flex flex-col gap-4 border-t border-gray-200 bg-gray-50 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-gray-600">
              {quote.data && subJobs.length > 0 && (
                <>
                  Total <strong className="text-gray-900">{formatRs(quote.data.subtotal)}</strong>
                  <span className="mx-2 text-gray-300">·</span>
                  Advance to collect at the cashier <strong className="text-gray-900">{formatRs(quote.data.min_advance)}</strong>
                </>
              )}
            </div>
            <div className="flex items-center justify-end space-x-4">
              <button type="button" onClick={cancel} className="text-sm font-medium text-gray-700 hover:text-gray-900">
                Cancel
              </button>
              <button
                type="submit"
                disabled={locked || create.isPending || update.isPending}
                className="inline-flex items-center justify-center rounded-md bg-[#0033A0] px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-800 disabled:opacity-50"
              >
                {create.isPending || update.isPending ? 'Saving…' : isEdit ? 'Update Job Card' : 'Submit Job Card'}
                <Icon name="chevronRight" className="ml-2 h-4 w-4" />
              </button>
            </div>
          </div>
        </form>
      </div>

      {allocationTarget && (
        <MaterialAllocationModal
          key={allocationTarget.gate_pass_id}
          gatePass={allocationTarget}
          documentType="JOB_CARD"
          picked={allocationTarget.gate_pass_id === assigned?.gate_pass_id ? picked : {}}
          committed={allocationTarget.gate_pass_id === initial.assigned?.gate_pass_id ? committed : {}}
          onConfirm={(items) => {
            setAssigned(allocationTarget);
            setAllocated(items);
            setAllocationChanged(true);
            changeSource(MaterialSource.CUSTOMER);
            if (!phone) setPhone(allocationTarget.customer_phone);
            if (!name) setName(allocationTarget.customer_name);
          }}
          onClose={() => setAllocationTarget(null)}
        />
      )}

      {historyOpen && <OrderHistoryModal type="job-cards" hidden={!!historyOrderId} onClose={() => setHistoryOpen(false)} onOpenOrder={setHistoryOrderId} />}
      {historyOrderId && <WorkOrderModal readOnly orderId={historyOrderId} onClose={() => setHistoryOrderId(null)} />}

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
