import {
  BranchType,
  COIL_COLOR_LABELS,
  COIL_ORIGIN_LABELS,
  DEFAULT_BRANCH_SETTINGS,
  MIN_PAYMENT_TO_PLACE,
  PaymentMode,
  ROOFING_CATEGORIES,
  WORKSHOP_JOB_TYPES,
  typeHasRoofing,
  typeHasWorkshop,
  type BranchSettings,
  type FeatureKey,
  type MinPaymentToPlace,
} from '@erp/shared';
import { BRANCH_TYPE_OPTIONS, branchTypeLabel, type ConfigSection } from '../lib/branch-config';
import {
  FieldGroup,
  ListEditor,
  OptionPicker,
  PercentInput,
  SelectAllLinks,
  SettingRow,
  Toggle,
  inputClass,
  labelClass,
} from './config-controls';

// ── Labels ───────────────────────────────────────────────────────────────────

/** Optional modules, grouped by who uses them. Core modules follow the branch type. */
const FEATURE_GROUPS: { title: string; items: { key: FeatureKey; label: string; description: string }[] }[] = [
  {
    title: 'Supervisor & Chief',
    items: [
      { key: 'gatePass', label: 'Gate Pass', description: 'Record customer-supplied material coming into the branch.' },
      { key: 'inventory', label: 'Inventory', description: 'View branch stock levels.' },
      { key: 'stockAlerts', label: 'Stock Alerts', description: 'Low and out-of-stock warnings.' },
      { key: 'stockRequest', label: 'Stock Request', description: 'Request stock from other branches.' },
      { key: 'chiefProfiles', label: 'Chief Profiles', description: 'Supervisors can create chief accounts.' },
    ],
  },
  {
    title: 'Cashier',
    items: [
      { key: 'hardwareQueue', label: 'Hardware Queue', description: 'Hardware orders waiting for payment.' },
      { key: 'hardwareStore', label: 'Hardware Store', description: 'Over-the-counter hardware sales.' },
      { key: 'pickup', label: 'Pickup & Closure', description: 'Release completed jobs and close them.' },
      { key: 'pettyCash', label: 'Petty Cash', description: 'Daily petty cash book.' },
    ],
  },
];

const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  [PaymentMode.CASH]: 'Cash',
  [PaymentMode.CARD]: 'Card',
  [PaymentMode.TRANSFER]: 'Transfer',
};
const JOB_TYPE_LABELS: Record<(typeof WORKSHOP_JOB_TYPES)[number], string> = { CUT_BEND: 'Cut / Bend', COIL_CUTTING: 'Coil Cutting', ROLLING: 'Rolling' };
const MIN_PAYMENT_LABELS: Record<MinPaymentToPlace, string> = { NONE: 'No payment', ADVANCE: 'Advance', FULL: 'Full amount' };

// Option universes come from the system defaults; a branch picks a subset
const ALL_COIL_THICKNESSES = DEFAULT_BRANCH_SETTINGS.roofing.coil_thicknesses;
const ALL_COIL_COLORS = DEFAULT_BRANCH_SETTINGS.roofing.coil_colors;
const ALL_COIL_ORIGINS = DEFAULT_BRANCH_SETTINGS.roofing.coil_origins;
const ALL_ROLLING_TYPES = DEFAULT_BRANCH_SETTINGS.workshop.rolling_types;

interface SectionProps {
  config: BranchSettings;
  type: BranchType;
  update: <K extends keyof BranchSettings>(key: K, value: BranchSettings[K]) => void;
}

function FeaturesSection({ config, type, update }: SectionProps) {
  const value = config.features;
  const core = [
    typeHasRoofing(type) && 'Create Order Form',
    typeHasWorkshop(type) && 'Create Job Card',
    typeHasWorkshop(type) ? 'Workshop Queue' : 'Orders Queue',
    'Cashier Queue',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <>
      <div className="mb-5 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        <span className="font-medium text-gray-800">Always on for {branchTypeLabel(type)}:</span> {core}
      </div>
      {FEATURE_GROUPS.map((group) => (
        <FieldGroup key={group.title} title={group.title}>
          <div className="divide-y divide-gray-100">
            {group.items.map((item) => (
              <SettingRow key={item.key} title={item.label} description={item.description}>
                <Toggle label={item.label} checked={value[item.key]} onChange={(v) => update('features', { ...value, [item.key]: v })} />
              </SettingRow>
            ))}
          </div>
        </FieldGroup>
      ))}
    </>
  );
}

function GeneralSection({ config, update }: SectionProps) {
  const value = config.general;
  const set = <K extends keyof typeof value>(k: K, v: (typeof value)[K]) => update('general', { ...value, [k]: v });
  const gatePassOff = !config.features.gatePass;
  return (
    <>
      <FieldGroup title="Payment methods" hint="Methods the cashier can accept at this branch.">
        <OptionPicker
          options={Object.values(PaymentMode).map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))}
          selected={value.payment_modes}
          onChange={(v) => set('payment_modes', v)}
        />
        <div className="mt-3 border-t border-gray-100">
          <SettingRow title="Require reference number" description="Card and bank transfer payments must include a reference.">
            <Toggle label="Require reference number" checked={value.require_payment_reference} onChange={(v) => set('require_payment_reference', v)} />
          </SettingRow>
        </div>
      </FieldGroup>

      <FieldGroup title="Customer-supplied material">
        <div className="divide-y divide-gray-100">
          <SettingRow title="Allow customer-supplied material" description="When off, every item uses branch stock.">
            <Toggle label="Allow customer-supplied material" checked={value.allow_customer_material} onChange={(v) => set('allow_customer_material', v)} />
          </SettingRow>
          <SettingRow
            title="Gate pass is mandatory"
            description={
              gatePassOff
                ? 'Turn on the Gate Pass feature to use this.'
                : 'Order forms and job cards with customer material cannot be submitted without a gate pass.'
            }
          >
            <Toggle
              label="Gate pass is mandatory"
              checked={value.require_gate_pass && value.allow_customer_material && !gatePassOff}
              disabled={!value.allow_customer_material || gatePassOff}
              onChange={(v) => set('require_gate_pass', v)}
            />
          </SettingRow>
        </div>
      </FieldGroup>
    </>
  );
}

interface OrdersSectionProps extends SectionProps {
  overridePassword: string;
  setOverridePassword: (v: string) => void;
  overrideConfigured: boolean;
}

function OrdersSection({ config, type, update, overridePassword, setOverridePassword, overrideConfigured }: OrdersSectionProps) {
  const value = config.orders;
  const set = <K extends keyof typeof value>(k: K, v: (typeof value)[K]) => update('orders', { ...value, [k]: v });
  return (
    <>
      {typeHasRoofing(type) && (
        <FieldGroup title="Roofing orders" hint="What the supervisor must collect before an order is placed.">
          <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Payment to place an order</label>
              <select value={value.min_payment_to_place} onChange={(e) => set('min_payment_to_place', e.target.value as MinPaymentToPlace)} className={inputClass}>
                {MIN_PAYMENT_TO_PLACE.map((m) => (
                  <option key={m} value={m}>
                    {MIN_PAYMENT_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            {value.min_payment_to_place === 'ADVANCE' && (
              <div>
                <label className={labelClass}>Minimum advance</label>
                <div className="mt-1">
                  <PercentInput value={value.min_advance_pct} onChange={(v) => set('min_advance_pct', v)} />
                </div>
              </div>
            )}
            <div>
              <label className={labelClass}>Customized surcharge</label>
              <div className="mt-1">
                <PercentInput value={value.customized_surcharge_pct} onChange={(v) => set('customized_surcharge_pct', v)} />
              </div>
            </div>
          </div>
        </FieldGroup>
      )}

      {typeHasWorkshop(type) && (
        <FieldGroup title="Job card advance" hint="Advance the cashier collects before workshop work starts.">
          <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Customized jobs</label>
              <div className="mt-1">
                <PercentInput value={config.min_advance_pct_customized} onChange={(v) => update('min_advance_pct_customized', v)} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Standard jobs</label>
              <div className="mt-1">
                <PercentInput value={config.min_advance_pct_standard} onChange={(v) => update('min_advance_pct_standard', v)} />
              </div>
            </div>
          </div>
        </FieldGroup>
      )}

      {config.features.hardwareStore && config.features.hardwareQueue && (
        <FieldGroup title="Hardware orders from other branches" hint="Advance another branch's cashier takes; the balance is collected here.">
          <div className="max-w-xs">
            <label className={labelClass}>Minimum advance</label>
            <div className="mt-1">
              <PercentInput value={value.hardware_remote_min_advance_pct} onChange={(v) => set('hardware_remote_min_advance_pct', v)} />
            </div>
          </div>
        </FieldGroup>
      )}

      <FieldGroup title="Cashier">
        <div className="max-w-xs">
          <label className={labelClass}>Maximum discount</label>
          <div className="mt-1">
            <PercentInput value={value.max_discount_pct} onChange={(v) => set('max_discount_pct', v)} />
          </div>
        </div>
        <div className="mt-3 border-t border-gray-100">
          <SettingRow title="Cashier can edit before work starts" description="Lets the cashier change an order until production begins.">
            <Toggle
              label="Cashier can edit before work starts"
              checked={value.allow_cashier_edit_before_start}
              onChange={(v) => set('allow_cashier_edit_before_start', v)}
            />
          </SettingRow>
        </div>
      </FieldGroup>

      <FieldGroup title="Stock override" hint="Lets staff go past a stock shortage with the branch override password.">
        <SettingRow title="Allow stock override">
          <Toggle label="Allow stock override" checked={config.stock_override_enabled} onChange={(v) => update('stock_override_enabled', v)} />
        </SettingRow>
        {config.stock_override_enabled && (
          <div className="max-w-xs">
            <label className={labelClass}>{overrideConfigured ? 'New override password' : 'Override password'}</label>
            <input
              type="password"
              autoComplete="new-password"
              value={overridePassword}
              onChange={(e) => setOverridePassword(e.target.value)}
              placeholder={overrideConfigured ? 'Leave blank to keep the current one' : 'At least 4 characters'}
              className={inputClass}
            />
          </div>
        )}
      </FieldGroup>
    </>
  );
}

/** Document number prefix stored in number_prefixes; blank falls back to the system prefix. */
function PrefixField({ title, kind, fallback, config, update }: SectionProps & { title: string; kind: string; fallback: string }) {
  const value = config.number_prefixes[kind] ?? '';
  const setPrefix = (v: string) => {
    const next = { ...config.number_prefixes };
    if (v) next[kind] = v;
    else delete next[kind];
    update('number_prefixes', next);
  };
  return (
    <FieldGroup title={title}>
      <div className="grid max-w-lg grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Prefix</label>
          <input type="text" value={value} placeholder={fallback} onChange={(e) => setPrefix(e.target.value.toUpperCase().trim())} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Example</label>
          <p className="mt-1 py-2 font-mono text-sm text-gray-700">{value || fallback}-00123</p>
        </div>
      </div>
    </FieldGroup>
  );
}

function RoofingSection(props: SectionProps) {
  const { config, update } = props;
  const value = config.roofing;
  const set = <K extends keyof typeof value>(k: K, v: (typeof value)[K]) => update('roofing', { ...value, [k]: v });
  const coilCount = value.coil_thicknesses.length * value.coil_colors.length * value.coil_origins.length;
  return (
    <>
      <FieldGroup
        title="Job categories"
        hint="What supervisors can choose on the order form."
        actions={<SelectAllLinks onAll={() => set('categories', [...ROOFING_CATEGORIES])} onNone={() => set('categories', [])} />}
      >
        <OptionPicker options={ROOFING_CATEGORIES.map((c) => ({ value: c, label: c }))} selected={value.categories} onChange={(v) => set('categories', v)} />
      </FieldGroup>

      <FieldGroup title="Coils" hint={`${coilCount} coil combination${coilCount === 1 ? '' : 's'} available with the options below.`}>
        <div className="space-y-4">
          <CoilPicker label="Thickness" all={ALL_COIL_THICKNESSES} selected={value.coil_thicknesses} onChange={(v) => set('coil_thicknesses', v)} />
          <CoilPicker label="Colour" all={ALL_COIL_COLORS} labels={COIL_COLOR_LABELS} selected={value.coil_colors} onChange={(v) => set('coil_colors', v)} />
          <CoilPicker label="Origin" all={ALL_COIL_ORIGINS} labels={COIL_ORIGIN_LABELS} selected={value.coil_origins} onChange={(v) => set('coil_origins', v)} />
        </div>
      </FieldGroup>

      <FieldGroup title="Order form options">
        <div className="divide-y divide-gray-100">
          <SettingRow title="Same coil for whole order" description="Lets the supervisor pick one coil for every item.">
            <Toggle label="Same coil for whole order" checked={value.allow_single_coil} onChange={(v) => set('allow_single_coil', v)} />
          </SettingRow>
          <SettingRow title="Photo required for customized items" description="Customized designs must include a photo.">
            <Toggle label="Photo required for customized items" checked={value.require_design_photo} onChange={(v) => set('require_design_photo', v)} />
          </SettingRow>
        </div>
      </FieldGroup>

      <PrefixField {...props} title="Order number" kind="ROOFING_ORDER" fallback="WO-FORM" />
    </>
  );
}

function CoilPicker({ label, all, labels, selected, onChange }: { label: string; all: string[]; labels?: Record<string, string>; selected: string[]; onChange: (v: string[]) => void }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
        <SelectAllLinks onAll={() => onChange([...all])} onNone={() => onChange([])} />
      </div>
      <OptionPicker options={all.map((v) => ({ value: v, label: labels?.[v] ?? v }))} selected={selected} onChange={onChange} />
    </div>
  );
}

function WorkshopSection(props: SectionProps) {
  const { config, update } = props;
  const value = config.workshop;
  const set = <K extends keyof typeof value>(k: K, v: (typeof value)[K]) => update('workshop', { ...value, [k]: v });
  return (
    <>
      <FieldGroup title="Job types" hint="Tabs shown on the job card.">
        <OptionPicker options={WORKSHOP_JOB_TYPES.map((j) => ({ value: j, label: JOB_TYPE_LABELS[j] }))} selected={value.job_types} onChange={(v) => set('job_types', v)} />
      </FieldGroup>

      {value.job_types.includes('CUT_BEND') && (
        <>
          <FieldGroup title="Cut / Bend materials" hint="Material list on the Cut / Bend tab.">
            <ListEditor values={value.materials} onChange={(v) => set('materials', v)} placeholder="Add material, e.g. GI Sheet" />
          </FieldGroup>
          <FieldGroup title="Cut / Bend thicknesses">
            <ListEditor values={value.thicknesses} onChange={(v) => set('thicknesses', v)} placeholder="Add thickness, e.g. 8mm" />
          </FieldGroup>
        </>
      )}

      {value.job_types.includes('ROLLING') && (
        <FieldGroup title="Rolling types" actions={<SelectAllLinks onAll={() => set('rolling_types', [...ALL_ROLLING_TYPES])} onNone={() => set('rolling_types', [])} />}>
          <OptionPicker options={ALL_ROLLING_TYPES.map((r) => ({ value: r, label: r }))} selected={value.rolling_types} onChange={(v) => set('rolling_types', v)} />
        </FieldGroup>
      )}

      <FieldGroup title="Job card options">
        <SettingRow title="Allow custom jobs" description="Custom jobs use a description and a manual rate instead of standard specs.">
          <Toggle label="Allow custom jobs" checked={value.allow_custom_jobs} onChange={(v) => set('allow_custom_jobs', v)} />
        </SettingRow>
      </FieldGroup>

      <PrefixField {...props} title="Job card number" kind="JOB_CARD" fallback="JC" />
    </>
  );
}

export function ConfigSectionView({ section, ...props }: OrdersSectionProps & { section: ConfigSection }) {
  switch (section) {
    case 'features':
      return <FeaturesSection {...props} />;
    case 'general':
      return <GeneralSection {...props} />;
    case 'orders':
      return <OrdersSection {...props} />;
    case 'roofing':
      return <RoofingSection {...props} />;
    case 'workshop':
      return <WorkshopSection {...props} />;
  }
}

// ── Branch details ───────────────────────────────────────────────────────────

export interface BranchDetails {
  name: string;
  code: string;
  phone: string;
  location: string;
  branch_type: BranchType;
  is_active: boolean;
}

export function TypePicker({ value, onChange }: { value: BranchType; onChange: (t: BranchType) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {BRANCH_TYPE_OPTIONS.map((t) => {
        const on = value === t.id;
        return (
          <label
            key={t.id}
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${on ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-gray-300 hover:bg-gray-50'}`}
          >
            <input type="radio" name="branch-type" checked={on} onChange={() => onChange(t.id)} className="mt-0.5 h-4 w-4 border-gray-300 text-blue-600" />
            <span>
              <span className="block text-sm font-medium text-gray-900">{t.label}</span>
              <span className="mt-0.5 block text-xs text-gray-500">{t.description}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function DetailsForm({ details, setDetail }: { details: BranchDetails; setDetail: <K extends keyof BranchDetails>(k: K, v: BranchDetails[K]) => void }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Branch name</label>
          <input type="text" value={details.name} onChange={(e) => setDetail('name', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Branch code</label>
          <input type="text" value={details.code} onChange={(e) => setDetail('code', e.target.value.toUpperCase())} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Contact phone</label>
          <input type="tel" value={details.phone} onChange={(e) => setDetail('phone', e.target.value)} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Address</label>
          <textarea rows={2} value={details.location} onChange={(e) => setDetail('location', e.target.value)} className={inputClass} />
        </div>
      </div>

      <div className="border-t border-gray-100 pt-5">
        <p className={`${labelClass} mb-1`}>Branch type</p>
        <p className="mb-3 text-xs text-gray-500">
          Decides which modules the branch runs. Switching type keeps your existing settings; use &quot;Reset&quot; in a section to load the defaults.
        </p>
        <TypePicker value={details.branch_type} onChange={(t) => setDetail('branch_type', t)} />
      </div>

      <div className="border-t border-gray-100 pt-5">
        <SettingRow title="Branch is active" description="Inactive branches are hidden from branch pickers.">
          <Toggle label="Branch is active" checked={details.is_active} onChange={(v) => setDetail('is_active', v)} />
        </SettingRow>
      </div>
    </div>
  );
}
