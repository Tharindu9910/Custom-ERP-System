import { useState } from 'react';
import { BranchType, DEFAULT_BRANCH_SETTINGS, Role, isGlobalRole, type BranchSettings } from '@erp/shared';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { Icon } from '@/shared/components/Icon';
import { MainBadge } from '@/shared/components/MainBadge';
import { Modal } from '@/shared/components/Modal';
import { apiError } from '@/shared/api/errors';
import { useAuthStore } from '@/shared/stores/auth.store';
import {
  useBranchConfig,
  useBranches,
  useCreateBranch,
  useUpdateBranch,
  useUpdateBranchConfig,
  type BranchConfigDto,
  type BranchDto,
  type UpdateBranchConfigPayload,
} from '../hooks/useBranches';
import { ConfigSectionView, DetailsForm, TypePicker, type BranchDetails } from './BranchConfigSections';
import {
  BRANCH_TYPE_OPTIONS,
  SECTION_HINTS,
  SECTION_KEYS,
  SECTION_LABELS,
  branchTypeLabel,
  modulesFor,
  sectionsForType,
  validateConfig,
  type ConfigSection,
} from '../lib/branch-config';
import { ActiveBadge, TypeBadge, inputClass, labelClass, primaryBtn, secondaryBtn } from './config-controls';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const toSettings = (dto: BranchConfigDto): BranchSettings => {
  const settings: Partial<BranchConfigDto> = { ...dto };
  delete settings.branch_id;
  delete settings.updated_by;
  delete settings.updated_at;
  delete settings.stock_override_configured;
  return settings as BranchSettings;
};

const toDetails = (b: BranchDto): BranchDetails => ({
  name: b.name,
  code: b.code,
  phone: b.phone ?? '',
  location: b.location ?? '',
  branch_type: b.branch_type,
  is_active: b.is_active,
});

/**
 * Branch Configuration (prototype: admin/BranchSettings). A global page: head office
 * (Super Admin, Admin) picks any branch from the list. Only Super Admin adds branches,
 * changes details or moves the main branch; Admin edits settings.
 */
export function BranchConfigPanel() {
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = user?.role === Role.SUPER_ADMIN;
  const isGlobal = !!user && isGlobalRole(user.role);
  const { data: branches = [], isLoading } = useBranches();
  const [editingId, setEditingId] = useState<string | null>(null);

  // Branch-scoped roles only ever see their own branch
  const ownId = user?.branch_id ?? null;
  const openId = isGlobal ? editingId : ownId;
  const branch = branches.find((b) => b.branch_id === openId);

  if (isLoading) return <p className="text-sm text-gray-400">Loading branches…</p>;

  if (branch) {
    return (
      <BranchEditor
        key={branch.branch_id}
        branch={branch}
        canEditDetails={isSuperAdmin}
        onBack={isGlobal ? () => setEditingId(null) : undefined}
      />
    );
  }
  if (!isGlobal) return <p className="text-sm text-gray-500">Your account is not linked to a branch.</p>;
  return <BranchTable branches={branches} canCreate={isSuperAdmin} onOpen={setEditingId} />;
}

// ── Branch list (Super Admin) ────────────────────────────────────────────────

function BranchTable({ branches, canCreate, onOpen }: { branches: BranchDto[]; canCreate: boolean; onOpen: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<BranchType | 'ALL'>('ALL');
  const [adding, setAdding] = useState(false);

  const q = search.toLowerCase();
  const filtered = branches.filter(
    (b) => (typeFilter === 'ALL' || b.branch_type === typeFilter) && (b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q)),
  );
  const stats = [
    { label: 'Total branches', value: branches.length },
    ...BRANCH_TYPE_OPTIONS.map((t) => ({ label: t.label, value: branches.filter((b) => b.branch_type === t.id).length })),
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Branch Configuration</h2>
          <p className="mt-1 text-sm text-gray-500">Choose what each branch runs and how its forms behave.</p>
        </div>
        {canCreate && (
          <button type="button" onClick={() => setAdding(true)} className={primaryBtn}>
            <Icon name="plus" className="mr-2 h-4 w-4" /> Add branch
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
          <span className="text-sm font-medium text-gray-700">Branches</span>
          <div className="flex gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as BranchType | 'ALL')}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
            >
              <option value="ALL">All types</option>
              {BRANCH_TYPE_OPTIONS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or code..."
              className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Branch', 'Type', 'Modules', 'Phone', 'Status'].map((h) => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    {h}
                  </th>
                ))}
                <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">
                    No branches match your filters.
                  </td>
                </tr>
              )}
              {filtered.map((b) => (
                <tr key={b.branch_id} className="cursor-pointer hover:bg-gray-50" onClick={() => onOpen(b.branch_id)}>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                      {b.name}
                      {b.is_main && <MainBadge />}
                    </div>
                    <div className="text-xs text-gray-500">{b.code || '—'}</div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <TypeBadge label={branchTypeLabel(b.branch_type)} />
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{modulesFor(b.branch_type)}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{b.phone || '—'}</td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <ActiveBadge active={b.is_active} />
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <button type="button" className="text-blue-600 hover:text-blue-900">
                      Configure
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AddBranchDialog
        open={adding}
        existing={branches}
        onClose={() => setAdding(false)}
        onCreated={(id) => {
          setAdding(false);
          onOpen(id);
        }}
      />
    </div>
  );
}

function AddBranchDialog({ open, existing, onClose, onCreated }: { open: boolean; existing: BranchDto[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState<BranchType>(BranchType.ROOFING);
  const [error, setError] = useState('');
  const create = useCreateBranch();

  const trimmed = name.trim();
  const duplicate = existing.some((b) => b.name.toLowerCase() === trimmed.toLowerCase());
  const canSubmit = !!trimmed && !!code.trim() && !duplicate && !create.isPending;

  const submit = async () => {
    setError('');
    try {
      const created = await create.mutateAsync({
        name: trimmed,
        code: code.trim(),
        branch_type: type,
        phone: phone.trim() || undefined,
        location: location.trim() || undefined,
      });
      setName('');
      setCode('');
      setPhone('');
      setLocation('');
      onCreated(created.branch_id);
    } catch (err) {
      setError(apiError(err).message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add branch"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryBtn}>
            Cancel
          </button>
          <button type="button" disabled={!canSubmit} onClick={() => void submit()} className={primaryBtn}>
            {create.isPending ? 'Creating…' : 'Create & configure'}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Branch name</label>
            <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Matara" />
            {duplicate && <p className="mt-1 text-xs text-red-600">A branch with this name already exists.</p>}
          </div>
          <div>
            <label className={labelClass}>Branch code</label>
            <input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={inputClass} placeholder="e.g. BR-MAT-001" />
          </div>
          <div>
            <label className={labelClass}>Contact phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} placeholder="e.g. 041 22 123 45" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Address</label>
            <textarea rows={2} value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div>
          <p className={`${labelClass} mb-2`}>Branch type</p>
          <TypePicker value={type} onChange={setType} />
          <p className="mt-2 text-xs text-gray-500">The branch starts with the default settings. You can change anything after creating it.</p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

// ── Editor ───────────────────────────────────────────────────────────────────

type NavKey = 'details' | ConfigSection;

function BranchEditor({ branch, canEditDetails, onBack }: { branch: BranchDto; canEditDetails: boolean; onBack?: () => void }) {
  const { data: loaded, isLoading, error: loadError } = useBranchConfig(branch.branch_id);

  if (isLoading) return <p className="text-sm text-gray-400">Loading config…</p>;
  if (!loaded) return <p className="text-sm text-red-600">{loadError ? apiError(loadError).message : 'Could not load the branch config.'}</p>;
  return <EditorForm branch={branch} loaded={loaded} canEditDetails={canEditDetails} onBack={onBack} />;
}

function EditorForm({ branch, loaded, canEditDetails, onBack }: { branch: BranchDto; loaded: BranchConfigDto; canEditDetails: boolean; onBack?: () => void }) {
  const updateConfig = useUpdateBranchConfig(branch.branch_id);
  const updateBranch = useUpdateBranch(branch.branch_id);

  // Baselines move forward after each successful save, so "dirty" compares against what is stored
  const [initialConfig, setInitialConfig] = useState<BranchSettings>(() => toSettings(loaded));
  const [initialDetails, setInitialDetails] = useState<BranchDetails>(() => toDetails(branch));
  const [config, setConfig] = useState<BranchSettings>(initialConfig);
  const [details, setDetails] = useState<BranchDetails>(initialDetails);
  const [overridePassword, setOverridePassword] = useState('');
  const [overrideConfigured, setOverrideConfigured] = useState(loaded.stock_override_configured);
  const [active, setActive] = useState<NavKey>('details');
  const [showErrors, setShowErrors] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmMain, setConfirmMain] = useState(false);

  const type = details.branch_type;
  const sections = sectionsForType(type);
  const navKeys: NavKey[] = ['details', ...sections];
  const current: NavKey = navKeys.includes(active) ? active : navKeys[0];

  const errors = validateConfig(config, type);
  const detailErrors = [!details.name.trim() && 'Branch name is required.', !details.code.trim() && 'Branch code is required.'].filter(Boolean) as string[];
  const errorsFor = (k: NavKey) => (k === 'details' ? detailErrors : (errors[k] ?? []));
  const hasErrors = navKeys.some((k) => errorsFor(k).length > 0);

  const configDirty = !same(config, initialConfig);
  const detailsDirty = !same(details, initialDetails);
  const dirty = configDirty || detailsDirty || overridePassword !== '';
  const saving = updateConfig.isPending || updateBranch.isPending;

  const isCustomized = (s: ConfigSection) => SECTION_KEYS[s].some((k) => !same(config[k], DEFAULT_BRANCH_SETTINGS[k]));

  const update = <K extends keyof BranchSettings>(key: K, value: BranchSettings[K]) => {
    setConfig((c) => ({ ...c, [key]: value }));
    setSaved(false);
  };
  const setDetail = <K extends keyof BranchDetails>(key: K, value: BranchDetails[K]) => {
    setDetails((d) => ({ ...d, [key]: value }));
    setSaved(false);
  };
  const resetSection = (s: ConfigSection) => {
    for (const k of SECTION_KEYS[s]) update(k, structuredClone(DEFAULT_BRANCH_SETTINGS[k]));
  };

  const discard = () => {
    setConfig(initialConfig);
    setDetails(initialDetails);
    setOverridePassword('');
    setShowErrors(false);
    setSaveError('');
  };

  const handleBack = () => {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return;
    onBack?.();
  };

  const deactivating = canEditDetails && initialDetails.is_active && !details.is_active;

  const makeMain = async () => {
    setSaveError('');
    try {
      await updateBranch.mutateAsync({ is_main: true });
    } catch (err) {
      setSaveError(apiError(err).message);
    }
    setConfirmMain(false);
  };

  const handleSave = async (confirmed = false) => {
    setSaveError('');
    if (hasErrors) {
      setShowErrors(true);
      const firstBad = navKeys.find((k) => errorsFor(k).length > 0);
      if (firstBad) setActive(firstBad);
      return;
    }
    if (deactivating && !confirmed) {
      setConfirmDeactivate(true);
      return;
    }
    setConfirmDeactivate(false);
    try {
      if (detailsDirty && canEditDetails) {
        const b = await updateBranch.mutateAsync({ ...details, name: details.name.trim(), code: details.code.trim() });
        setInitialDetails(toDetails(b));
        setDetails(toDetails(b));
      }
      if (configDirty || overridePassword) {
        // Send only the settings that changed; the API merges them into the stored config
        const payload: UpdateBranchConfigPayload = {};
        for (const k of Object.keys(config) as (keyof BranchSettings)[]) {
          if (!same(config[k], initialConfig[k])) (payload as Record<string, unknown>)[k] = config[k];
        }
        if (overridePassword) payload.stock_override_password = overridePassword;
        const next = await updateConfig.mutateAsync(payload);
        setInitialConfig(toSettings(next));
        setConfig(toSettings(next));
        setOverrideConfigured(next.stock_override_configured);
        setOverridePassword('');
      }
      setShowErrors(false);
      setSaved(true);
    } catch (err) {
      setSaveError(apiError(err).message);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        {onBack && (
          <button type="button" onClick={handleBack} className="mb-3 inline-flex items-center text-sm text-gray-500 hover:text-gray-800">
            <Icon name="chevronRight" className="mr-1 h-4 w-4 rotate-180" /> All branches
          </button>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">{details.name || branch.name}</h2>
          {branch.is_main && <MainBadge />}
          <TypeBadge label={branchTypeLabel(type)} />
          <ActiveBadge active={details.is_active} />
          {canEditDetails && !branch.is_main && initialDetails.is_active && (
            <button type="button" onClick={() => setConfirmMain(true)} className={`${secondaryBtn} ml-auto`}>
              Make main branch
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {details.code || 'No code'} · Modules: {modulesFor(type)}
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[14rem_1fr]">
        <nav className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {navKeys.map((k) => {
            const isActive = k === current;
            const bad = showErrors && errorsFor(k).length > 0;
            const custom = k !== 'details' && isCustomized(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => setActive(k)}
                className={`flex w-full items-center justify-between border-b border-l-2 border-b-gray-100 px-4 py-3 text-left text-sm last:border-b-0 ${isActive ? 'border-l-blue-600 bg-blue-50 font-medium text-blue-800' : 'border-l-transparent text-gray-700 hover:bg-gray-50'}`}
              >
                <span>{k === 'details' ? 'Branch Details' : SECTION_LABELS[k]}</span>
                {bad ? <span className="text-xs font-medium text-red-600">Fix</span> : custom ? <span className="text-[11px] text-amber-700">Customized</span> : null}
              </button>
            );
          })}
        </nav>

        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-4 rounded-t-lg border-b border-gray-200 bg-gray-50 px-6 py-4">
            <div>
              <h3 className="text-base font-semibold text-gray-900">{current === 'details' ? 'Branch Details' : SECTION_LABELS[current]}</h3>
              <p className="mt-0.5 text-xs text-gray-500">{current === 'details' ? 'Name, contact details and what this branch runs.' : SECTION_HINTS[current]}</p>
            </div>
            {current !== 'details' && isCustomized(current) && (
              <button
                type="button"
                onClick={() => resetSection(current)}
                className="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:text-gray-900"
              >
                Reset to defaults
              </button>
            )}
          </div>

          {current === 'details' && !canEditDetails && (
            <div className="mx-6 mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              View only. Only a Super Admin can change branch details and type.
            </div>
          )}

          {showErrors && errorsFor(current).length > 0 && (
            <div className="mx-6 mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <ul className="ml-4 list-disc space-y-0.5">
                {errorsFor(current).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {current === 'details' ? (
            <fieldset disabled={!canEditDetails} className="min-w-0 p-6">
              <DetailsForm details={details} setDetail={setDetail} />
            </fieldset>
          ) : (
            <div className="min-w-0 p-6">
              <ConfigSectionView
                section={current}
                config={config}
                type={type}
                update={update}
                overridePassword={overridePassword}
                setOverridePassword={setOverridePassword}
                overrideConfigured={overrideConfigured}
              />
            </div>
          )}

          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-b-lg border-t border-gray-200 bg-white px-6 py-3">
            <p className="text-sm text-gray-500">
              {saveError ? (
                <span className="text-red-600">{saveError}</span>
              ) : dirty ? (
                'You have unsaved changes.'
              ) : saved ? (
                <span className="text-green-700">Saved.</span>
              ) : (
                'No changes.'
              )}
            </p>
            <div className="flex gap-2">
              <button type="button" disabled={!dirty || saving} onClick={discard} className={secondaryBtn}>
                Discard
              </button>
              <button type="button" disabled={!dirty || saving} onClick={() => void handleSave()} className={primaryBtn}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmMain}
        title="Make main branch"
        message={`Make "${branch.name}" the main branch? Stock requests will suggest it as the supplier, and it is listed first everywhere. The current main branch becomes a normal branch.`}
        confirmLabel="Make main"
        isLoading={updateBranch.isPending}
        onConfirm={() => void makeMain()}
        onCancel={() => setConfirmMain(false)}
      />
      <ConfirmDialog
        open={confirmDeactivate}
        title="Deactivate Branch"
        message={`Deactivate "${details.name || branch.name}"? Users assigned to this branch will not be able to operate.`}
        confirmLabel="Deactivate & save"
        isDestructive
        isLoading={saving}
        onConfirm={() => void handleSave(true)}
        onCancel={() => setConfirmDeactivate(false)}
      />
    </div>
  );
}
