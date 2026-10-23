import { MaterialSource, type PricedWorkshopLine } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { formatRs } from '@/shared/lib/format';
import { describeSubJob, isCustomMode, toLineInput, type SubJobForm } from '../lib/sub-job-form';

const CHIPS: Record<SubJobForm['job_type'], string[]> = {
  CUT_BEND: ['CUT', 'BEND'],
  COIL_CUTTING: ['COIL CUTTING'],
  ROLLING: ['ROLLING'],
};

interface Props {
  subJobs: SubJobForm[];
  priced: (PricedWorkshopLine | undefined)[];
  editingKey: string | null;
  locked: boolean;
  onEdit: (f: SubJobForm) => void;
  onRemove: (key: string) => void;
}

/** Sub-jobs preview list (prototype), with the price of each line from the live quote. */
export function SubJobList({ subJobs, priced, editingKey, locked, onEdit, onRemove }: Props) {
  const branch = subJobs.filter((j) => j.material_source === MaterialSource.BRANCH).length;
  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">Sub-Jobs</h3>
        <div className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          {subJobs.length} sub-job{subJobs.length !== 1 && 's'} · {branch} branch stock · {subJobs.length - branch} customer supplied
        </div>
      </div>

      {subJobs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-500">No jobs created yet.</div>
      ) : (
        <div className="space-y-4">
          {subJobs.map((job, i) => {
            const p = priced[i];
            const charges = toLineInput(job).custom_charges;
            const missing = p && p.missing_rates.length > 0;
            return (
              <div
                key={job.key}
                className={`overflow-hidden rounded-lg border bg-white shadow-sm transition-colors ${
                  editingKey === job.key ? 'border-blue-400 ring-1 ring-blue-300' : missing ? 'border-amber-300' : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <div className="flex items-center justify-between p-4">
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <div className="flex gap-1">
                        {CHIPS[job.job_type].map((c) => (
                          <span key={c} className="rounded bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700">
                            {c}
                          </span>
                        ))}
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          job.material_source === MaterialSource.CUSTOMER ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {job.material_source === MaterialSource.CUSTOMER ? 'Customer' : 'Branch'}
                      </span>
                      {p?.is_customized && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold uppercase text-purple-800">Customized</span>}
                    </div>
                    <div className="mt-2 text-sm font-medium text-gray-800">{describeSubJob(job)}</div>
                    {job.job_type === 'CUT_BEND' && !isCustomMode(job) && (
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                        {job.cut_count && Number(job.cut_count) > 0 ? (
                          <span>
                            <strong className="font-medium text-gray-700">Cut:</strong> {job.cut_count}
                          </span>
                        ) : null}
                        {job.bend_count && Number(job.bend_count) > 0 ? (
                          <span>
                            <strong className="font-medium text-gray-700">Bend:</strong> {job.bend_count}
                          </span>
                        ) : null}
                      </div>
                    )}
                    {charges.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1 rounded bg-purple-50 p-2 text-sm text-purple-700">
                        {charges.map((c, j) => (
                          <div key={j}>
                            <strong className="font-bold">Custom {c.kind === 'COIL_CUTTING' ? 'Coil Cutting' : c.kind.charAt(0) + c.kind.slice(1).toLowerCase()}:</strong>{' '}
                            {c.description} | <strong className="font-bold">Rate:</strong> {formatRs(c.rate)} | <strong className="font-bold">Qty:</strong> {c.quantity}
                          </div>
                        ))}
                      </div>
                    )}
                    {missing && (
                      <div className="mt-2 flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                        <Icon name="alertTriangle" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                          No standard rate ({p.missing_rates.join('; ')}). Edit this sub-job, tick <strong>Custom</strong> and enter the price.
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="ml-4 flex shrink-0 items-center space-x-2">
                    {p && !missing && <span className="text-sm font-bold text-gray-900">{formatRs(p.line_total)}</span>}
                    {!locked && (
                      <>
                        <button type="button" onClick={() => onEdit(job)} className="p-2 text-gray-400 transition-colors hover:text-blue-600" title="Edit">
                          <Icon name="edit" />
                        </button>
                        <button type="button" onClick={() => onRemove(job.key)} className="p-2 text-gray-400 transition-colors hover:text-red-500" title="Delete">
                          <Icon name="trash" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
