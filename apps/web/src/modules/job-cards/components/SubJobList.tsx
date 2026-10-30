import { useMemo } from 'react';
import { MaterialSource, WORKSHOP_JOB_TYPES, type PricedWorkshopLine } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { formatRs } from '@/shared/lib/format';
import { JOB_TYPE_LABEL, describeSubJob, isCustomMode, toLineInput, type SubJobForm } from '../lib/sub-job-form';

interface Props {
  subJobs: SubJobForm[];
  /** Live quote lines, in the same order as subJobs */
  priced: (PricedWorkshopLine | undefined)[];
  editingKey: string | null;
  locked: boolean;
  /** Gate pass item names ("GP-0012 · MS Plain Sheet (2mm)"), by gp_item_id */
  materialNames: Record<string, string>;
  onEdit: (f: SubJobForm) => void;
  onDuplicate: (f: SubJobForm) => void;
  onRemove: (key: string) => void;
}

/** The card's sub-jobs grouped by job type, with the price of each line from the live quote (like Order Items). */
export function SubJobList({ subJobs, priced, editingKey, locked, materialNames, onEdit, onDuplicate, onRemove }: Props) {
  const branch = subJobs.filter((j) => j.material_source === MaterialSource.BRANCH).length;
  // Grouping changes the order, so each row keeps its quote line by key
  const priceByKey = useMemo(() => new Map(subJobs.map((j, i) => [j.key, priced[i]])), [subJobs, priced]);
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
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

/** One sub-job in the list (same layout as the order form's OrderItemRow). */
function SubJobRow({ job, price, isEditing, locked, materialName, onEdit, onDuplicate, onRemove }: RowProps) {
  const customer = job.material_source === MaterialSource.CUSTOMER;
  const customized = price?.is_customized ?? isCustomMode(job);
  const charges = toLineInput(job).custom_charges;
  const missing = !!price && price.missing_rates.length > 0;

  return (
    <div
      className={`rounded-lg border bg-white p-3 shadow-sm ${
        isEditing ? 'border-amber-400 ring-1 ring-amber-300' : missing ? 'border-amber-300' : 'border-gray-200 hover:border-blue-300'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-bold text-gray-900">{describeSubJob(job)}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${customer ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
              {customer ? 'Customer' : 'Branch'}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${customized ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-700'}`}>
              {customized ? 'Customized' : 'Standard'}
            </span>
          </div>
          {customer && job.gp_item_id && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-orange-800">
              <Icon name="packageOpen" className="h-4 w-4 shrink-0" />
              {materialName ?? 'Gate pass material'} × {job.gp_quantity}
            </p>
          )}
          {job.job_type === 'CUT_BEND' && !isCustomMode(job) && (Number(job.cut_count) > 0 || Number(job.bend_count) > 0) && (
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-gray-600">
              {Number(job.cut_count) > 0 && (
                <span>
                  <strong className="font-medium text-gray-700">Cut:</strong> {job.cut_count}
                </span>
              )}
              {Number(job.bend_count) > 0 && (
                <span>
                  <strong className="font-medium text-gray-700">Bend:</strong> {job.bend_count}
                </span>
              )}
            </div>
          )}
          {charges.length > 0 && (
            <div className="mt-1 flex flex-col gap-0.5 text-sm text-purple-700">
              {charges.map((c, i) => (
                <span key={i}>
                  <strong className="font-medium">{c.kind === 'COIL_CUTTING' ? 'Coil Cutting' : c.kind.charAt(0) + c.kind.slice(1).toLowerCase()}:</strong> {c.description} ·{' '}
                  {formatRs(c.rate)} × {c.quantity}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {price &&
            (missing ? (
              <span className="mr-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">No rate</span>
            ) : (
              <span className="mr-2 text-sm font-bold tabular-nums text-gray-900">{formatRs(price.line_total)}</span>
            ))}
          {!locked && (
            <>
              <button type="button" onClick={onEdit} className="p-2 text-gray-400 transition-colors hover:text-blue-600" title="Edit">
                <Icon name="edit" className="h-4 w-4" />
              </button>
              <button type="button" onClick={onDuplicate} className="p-2 text-gray-400 transition-colors hover:text-blue-600" title="Duplicate">
                <Icon name="copy" className="h-4 w-4" />
              </button>
              <button type="button" onClick={onRemove} className="p-2 text-gray-400 transition-colors hover:text-red-500" title="Delete">
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
      {missing && (
        <div className="mt-2 flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          <Icon name="alertTriangle" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            No standard rate ({price.missing_rates.join('; ')}). Edit this sub-job, choose <strong>Custom</strong> pricing and enter the price.
          </span>
        </div>
      )}
    </div>
  );
}
