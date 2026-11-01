import { useMemo } from 'react';
import { MaterialSource, WORKSHOP_JOB_TYPES, type CustomCharge, type PricedWorkshopLine } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { formatRs } from '@/shared/lib/format';
import { JOB_TYPE_LABEL, isCustomMode, toLineInput, type SubJobForm } from '../lib/sub-job-form';

interface Props {
  subJobs: SubJobForm[];
  /** Live quote lines, in the same order as subJobs */
  priced: (PricedWorkshopLine | undefined)[];
  editingKey: string | null;
  locked: boolean;
  /** Gate pass item names ("GP-0012 · MS Plain Sheet (2mm)"), by gp_item_id */
  materialNames: Record<string, string>;
  /** Per sub-job key: branch sheets short of free stock, or customer pieces over what is left */
  warnings: Record<string, { short?: number; over?: number }>;
  /** Each sub-job's advance, in the same order as subJobs (Docs/decisions/0010) */
  advances: SubJobAdvance[];
  onAdvance: (key: string, advance: string) => void;
  onEdit: (f: SubJobForm) => void;
  onDuplicate: (f: SubJobForm) => void;
  onRemove: (key: string) => void;
}

export interface SubJobAdvance {
  value: number;
  suggested: number;
  /** Custom work: the supervisor may set it, 0 to the sub-job total */
  editable: boolean;
  over: boolean;
}

/** The card's sub-jobs grouped by job type, with the price of each line from the live quote (like Order Items). */
export function SubJobList({ subJobs, priced, editingKey, locked, materialNames, warnings, advances, onAdvance, onEdit, onDuplicate, onRemove }: Props) {
  const branch = subJobs.filter((j) => j.material_source === MaterialSource.BRANCH).length;
  // Grouping changes the order, so each row keeps its quote line by key
  const priceByKey = useMemo(() => new Map(subJobs.map((j, i) => [j.key, priced[i]])), [subJobs, priced]);
  const advanceByKey = useMemo(() => new Map(subJobs.map((j, i) => [j.key, advances[i]])), [subJobs, advances]);
  const grouped = useMemo(
    () => WORKSHOP_JOB_TYPES.map((t) => ({ type: t, jobs: subJobs.filter((j) => j.job_type === t) })).filter((g) => g.jobs.length > 0),
    [subJobs],
  );

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-gray-900">Sub-Jobs</h3>
        <div className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          {subJobs.length} sub-job{subJobs.length !== 1 && 's'} · {branch} branch stock · {subJobs.length - branch} customer supplied
        </div>
      </div>

      {subJobs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-500">No sub-jobs yet. Pick the work above to start.</div>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <div key={group.type}>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                {JOB_TYPE_LABEL[group.type]} ({group.jobs.length})
              </h4>
              <div className="space-y-2">
                {group.jobs.map((job) => (
                  <SubJobRow
                    key={job.key}
                    job={job}
                    price={priceByKey.get(job.key)}
                    isEditing={editingKey === job.key}
                    locked={locked}
                    materialName={materialNames[job.gp_item_id] ?? null}
                    warning={warnings[job.key]}
                    advance={advanceByKey.get(job.key)}
                    onAdvance={(v) => onAdvance(job.key, v)}
                    onEdit={() => onEdit(job)}
                    onDuplicate={() => onDuplicate(job)}
                    onRemove={() => onRemove(job.key)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface RowProps {
  job: SubJobForm;
  price?: PricedWorkshopLine;
  isEditing: boolean;
  locked: boolean;
  materialName: string | null;
  warning?: { short?: number; over?: number };
  advance?: SubJobAdvance;
  onAdvance: (advance: string) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

/** One line of work on a sub-job: Cut / Bend / Rolling / Coil cutting, with its count or hand price. */
interface WorkRow {
  label: string;
  /** Count, or what is being done */
  value: string;
  /** Muted extra (size, description) */
  note?: string;
  /** Hand-priced work: "2 × Rs 123.00" and its total */
  priced?: { qty: number; rate: number; total: number };
}

const CHARGE_LABEL: Record<CustomCharge['kind'], string> = { CUT: 'Cut', BEND: 'Bend', ROLLING: 'Rolling', COIL_CUTTING: 'Coil cutting', OTHER: 'Other' };

const chargeRow = (c: CustomCharge): WorkRow => ({
  label: CHARGE_LABEL[c.kind],
  value: String(c.quantity),
  note: c.description,
  priced: { qty: c.quantity, rate: c.rate, total: Math.round(c.rate * c.quantity) },
});

/** Heading: what is being worked on (the work itself goes in the rows). */
function subJobTitle(job: SubJobForm): { title: string; meta: string[] } {
  const customer = job.material_source === MaterialSource.CUSTOMER;
  if (job.job_type === 'CUT_BEND') {
    if (customer) return { title: "Customer's material", meta: [] };
    return {
      title: `${job.material_type} ${job.thickness}`.trim(),
      meta: [job.inches.trim() && `${job.inches.trim()} inches`, job.material_quantity && `${job.material_quantity} sheet${job.material_quantity === '1' ? '' : 's'}`].filter(Boolean) as string[],
    };
  }
  if (job.job_type === 'COIL_CUTTING') return { title: job.coil_material || 'Coil', meta: [] };
  if (customer) return { title: "Customer's material", meta: [] };
  return { title: job.rolling_type || 'Rolling', meta: job.work_type ? [job.work_type] : [] };
}

/** The same row layout for every job type: one line per kind of work. */
function workRows(job: SubJobForm): WorkRow[] {
  const custom = isCustomMode(job);
  const charges = toLineInput(job).custom_charges;
  if (job.job_type === 'CUT_BEND') {
    const rows: WorkRow[] = custom
      ? charges.filter((c) => c.kind !== 'ROLLING').map(chargeRow)
      : [
          ...(Number(job.cut_count) > 0 ? [{ label: 'Cut', value: job.cut_count }] : []),
          ...(Number(job.bend_count) > 0 ? [{ label: 'Bend', value: job.bend_count }] : []),
        ];
    // Optional sheet rolling, always hand-priced
    return [...rows, ...charges.filter((c) => c.kind === 'ROLLING').map(chargeRow)];
  }
  if (job.job_type === 'COIL_CUTTING') {
    const row: WorkRow = { label: 'Coil cutting', value: job.amount_range ? `${job.amount_range} Ton` : '—' };
    const c = charges[0];
    return [c ? { ...row, note: c.description, priced: { qty: 1, rate: c.rate, total: c.rate } } : row];
  }
  if (custom) return charges.map(chargeRow);
  return [{ label: 'Rolling', value: job.quantity || '—', note: job.size ? `Size ${job.size}` : undefined }];
}

const TAG = 'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide';

/** One sub-job: what is worked on, then one uniform row per kind of work (same layout for every job type). */
function SubJobRow({ job, price, isEditing, locked, materialName, warning, advance, onAdvance, onEdit, onDuplicate, onRemove }: RowProps) {
  const customer = job.material_source === MaterialSource.CUSTOMER;
  const customized = price?.is_customized ?? isCustomMode(job);
  const missing = !!price && price.missing_rates.length > 0;
  const { title, meta } = subJobTitle(job);
  const rows = workRows(job);

  return (
    <div
      className={`rounded-lg border bg-white shadow-sm transition-colors ${
        isEditing ? 'border-amber-400 ring-1 ring-amber-300' : missing ? 'border-amber-300' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      {/* Header: what, tags, price, actions */}
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-slate-900">{title}</span>
            <span className={`${TAG} ${customer ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700'}`}>{customer ? 'Customer' : 'Branch'}</span>
            <span className={`${TAG} ${customized ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>{customized ? 'Custom price' : 'Standard'}</span>
            {!!warning?.short && (
              <span title="More sheets than are free at this branch" className={`${TAG} bg-amber-100 text-amber-800`}>
                Short {warning.short}
              </span>
            )}
            {!!warning?.over && (
              <span title="More pieces than are left on the gate pass item" className={`${TAG} bg-red-100 text-red-700`}>
                Over by {warning.over}
              </span>
            )}
          </div>
          {meta.length > 0 && <p className="mt-0.5 text-xs text-slate-500">{meta.join(' · ')}</p>}
          {customer && job.gp_item_id && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-600">
              <Icon name="packageOpen" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              {materialName ?? 'Gate pass material'} × {job.gp_quantity}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {price &&
            (missing ? (
              <span className={`${TAG} mr-2 bg-red-100 text-red-700`}>No rate</span>
            ) : (
              <span className="mr-2 text-sm font-bold tabular-nums text-slate-900">{formatRs(price.line_total)}</span>
            ))}
          {!locked && (
            <>
              <button type="button" onClick={onEdit} className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" title="Edit">
                <Icon name="edit" className="h-4 w-4" />
              </button>
              <button type="button" onClick={onDuplicate} className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" title="Duplicate">
                <Icon name="copy" className="h-4 w-4" />
              </button>
              <button type="button" onClick={onRemove} className="rounded p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600" title="Delete">
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Work: one line each, same columns on every card */}
      {rows.length > 0 && (
        <dl className="mx-4 mb-3 mt-2.5 divide-y divide-slate-100 rounded-md border border-slate-100 bg-slate-50/70 text-sm">
          {rows.map((r, i) => (
            <div key={i} className="flex items-baseline gap-3 px-3 py-1.5">
              <dt className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">{r.label}</dt>
              <dd className="min-w-0 flex-1 truncate">
                <span className="font-semibold tabular-nums text-slate-900">{r.value}</span>
                {r.note && <span className="ml-2 text-slate-500">{r.note}</span>}
              </dd>
              {r.priced && (
                <dd className="shrink-0 whitespace-nowrap text-right tabular-nums">
                  <span className="text-xs text-slate-400">
                    {r.priced.qty} × {formatRs(r.priced.rate)}
                  </span>
                  <span className="ml-3 font-medium text-slate-700">{formatRs(r.priced.total)}</span>
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}
      {rows.length === 0 && <div className="pb-3" />}

      {price && !missing && advance && (
        <AdvanceStrip
          typed={job.advance}
          advance={advance}
          locked={locked}
          onChange={onAdvance}
          // Branch-sheet Cut/Bend: the advance is the sheets' cost
          suggestedNote={job.job_type === 'CUT_BEND' && job.material_source === MaterialSource.BRANCH ? 'material' : undefined}
          fixedNote={job.job_type === 'CUT_BEND' && job.material_source === MaterialSource.BRANCH ? 'Material cost' : undefined}
          what="sub-job"
        />
      )}

      {missing && (
        <div className="mx-4 mb-3 flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          <Icon name="alertTriangle" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            No standard rate ({price.missing_rates.join('; ')}). Edit this sub-job, choose <strong>Custom</strong> pricing and enter the price.
          </span>
        </div>
      )}
    </div>
  );
}

const rupees = (cents: number) => (cents / 100).toFixed(2).replace(/\.00$/, '');

/**
 * A line's advance: fixed on standard work, typed by the supervisor on custom work (Docs/decisions/0010).
 * Shared by job card sub-jobs and roofing order items (0011).
 */
export function AdvanceStrip({
  typed: value,
  advance,
  locked,
  onChange,
  suggestedNote,
  fixedNote,
  what,
}: {
  /** The typed amount (Rs); empty = the suggestion */
  typed: string;
  advance: SubJobAdvance;
  locked: boolean;
  onChange: (v: string) => void;
  /** Where the suggestion comes from ("material"), shown after it */
  suggestedNote?: string;
  /** Shown next to a fixed advance */
  fixedNote?: string;
  /** "sub-job" / "item" */
  what: string;
}) {
  const typed = value.trim() !== '';
  return (
    <div className="mx-4 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2.5 text-sm">
      <span className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">Advance</span>
      {advance.editable && !locked ? (
        <>
          <label className="relative">
            <span className="sr-only">Advance for this {what}</span>
            <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs text-slate-400">Rs</span>
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={value}
              placeholder={rupees(advance.suggested)}
              onChange={(e) => onChange(e.target.value)}
              className={`w-36 rounded-md border py-1 pl-8 pr-2 text-right text-sm tabular-nums focus:outline-none focus:ring-1 ${
                advance.over ? 'border-red-300 focus:border-red-400 focus:ring-red-300' : 'border-slate-300 focus:border-[#0033A0] focus:ring-[#0033A0]'
              }`}
            />
          </label>
          <span className="text-xs text-slate-500">
            Suggested {formatRs(advance.suggested)}
            {suggestedNote ? ` (${suggestedNote})` : ''}
          </span>
          {typed && (
            <button type="button" onClick={() => onChange('')} className="text-xs font-medium text-[#0033A0] hover:underline">
              Use suggested
            </button>
          )}
          {advance.over && <span className="w-full pl-27 text-xs font-medium text-red-600">More than this {what}'s total.</span>}
        </>
      ) : (
        <>
          <span className="font-semibold tabular-nums text-slate-900">{formatRs(advance.value)}</span>
          {!advance.editable && fixedNote && <span className="text-xs text-slate-500">{fixedNote}</span>}
        </>
      )}
    </div>
  );
}
