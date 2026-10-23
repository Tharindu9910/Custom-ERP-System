import { MaterialSource, rollingSizesFor, type WorkshopConfig, type WorkshopJobType } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { CUSTOMIZED_REASONS, isCustomMode, type SubJobForm } from '../lib/sub-job-form';

const TAB_LABEL: Record<WorkshopJobType, string> = { CUT_BEND: 'Cut / Bend', COIL_CUTTING: 'Coil Cutting', ROLLING: 'Rolling' };

const cls =
  'block w-full rounded-md border border-gray-300 py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-400';
const label = 'mb-2 block text-xs font-bold uppercase text-gray-500';

interface Props {
  form: SubJobForm;
  onChange: (patch: Partial<SubJobForm>) => void;
  workshop: WorkshopConfig;
  allowCustomer: boolean;
  editing: boolean;
  issues: string[];
  onSubmit: () => void;
  onCancelEdit: () => void;
}

/** "Add Sub-Job Template" panel (prototype CreateJobCard), driven by branch workshop settings. */
export function SubJobTemplate({ form, onChange, workshop, allowCustomer, editing, issues, onSubmit, onCancelEdit }: Props) {
  const custom = isCustomMode(form);
  const isCustomer = form.material_source === MaterialSource.CUSTOMER;
  const lengthMaterial = workshop.length_materials.includes(form.material_type);
  const set = (k: keyof SubJobForm) => (e: { target: { value: string } }) => onChange({ [k]: e.target.value });

  const customToggle = workshop.allow_custom_jobs && !isCustomer && (
    <label className="flex cursor-pointer items-center space-x-1">
      <input type="checkbox" checked={form.custom} onChange={(e) => onChange({ custom: e.target.checked })} className="h-4 w-4 rounded text-blue-600" />
      <span className="text-[10px] font-bold uppercase text-gray-800">Custom</span>
    </label>
  );

  const reasonPicker = form.custom && !isCustomer && (
    <div className="sm:col-span-6">
      <label className={label}>Reason for custom pricing</label>
      <select value={form.customized_reason_code} onChange={set('customized_reason_code')} className={cls}>
        <option value="">Select reason</option>
        {CUSTOMIZED_REASONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </div>
  );

  const chargeRow = (title: string, d: keyof SubJobForm, r: keyof SubJobForm, q: keyof SubJobForm | null, prefix: string) => (
    <>
      <h4 className="col-span-full mb-1 text-xs font-bold uppercase text-purple-800">{title}</h4>
      <div className={q ? 'sm:col-span-6' : 'sm:col-span-8'}>
        <label className={label}>{prefix} Description</label>
        <input type="text" value={form[d] as string} onChange={set(d)} className={cls} />
      </div>
      <div className={q ? 'sm:col-span-3' : 'sm:col-span-4'}>
        <label className={label}>{prefix} Rate (Rs.)</label>
        <input type="number" min="0" step="0.01" value={form[r] as string} onChange={set(r)} className={cls} />
      </div>
      {q && (
        <div className="sm:col-span-3">
          <label className={label}>{prefix} Quantity</label>
          <input type="number" min="1" value={form[q] as string} onChange={set(q)} className={cls} />
        </div>
      )}
    </>
  );

  return (
    <div className="border-b border-gray-200 p-6">
      <h3 className="mb-4 text-lg font-bold text-gray-900">{editing ? 'Edit Sub-Job' : 'Add Sub-Job Template'}</h3>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="p-5">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-gray-200">
            <div className="flex">
              {workshop.job_types.map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={editing && form.job_type !== t}
                  onClick={() => onChange({ job_type: t })}
                  className={`px-6 py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-40 ${
                    form.job_type === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {TAB_LABEL[t]}
                </button>
              ))}
            </div>
            {allowCustomer && form.job_type !== 'COIL_CUTTING' && (
              <div className="mb-2 flex rounded bg-blue-100 p-0.5">
                {[MaterialSource.BRANCH, MaterialSource.CUSTOMER].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onChange({ material_source: s })}
                    className={`rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
                      form.material_source === s ? 'bg-blue-700 text-white shadow-sm' : 'text-blue-600 hover:bg-blue-50 hover:text-blue-800'
                    }`}
                  >
                    {s === MaterialSource.BRANCH ? 'Branch Stock' : 'Customer Supplied'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {form.job_type === 'CUT_BEND' && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h4 className="mb-3 text-sm font-bold uppercase text-gray-700">Cut / Bend Details</h4>
              <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-12">
                {!isCustomer && (
                  <>
                    <div className="sm:col-span-4">
                      <label className={label}>Material Type</label>
                      <select value={form.material_type} onChange={(e) => onChange({ material_type: e.target.value, thickness: '' })} disabled={form.custom} className={cls}>
                        <option value="">Select Material</option>
                        {withCurrent(workshop.materials, form.material_type).map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-3">
                      <label className={label}>{lengthMaterial ? 'Length' : 'Thickness'}</label>
                      {lengthMaterial ? (
                        <input type="text" value={form.thickness} onChange={set('thickness')} disabled={form.custom} className={cls} />
                      ) : (
                        <select value={form.thickness} onChange={set('thickness')} disabled={form.custom} className={cls}>
                          <option value="">Select Thickness</option>
                          {withCurrent(workshop.thicknesses, form.thickness).map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="sm:col-span-3">
                      <label className={label}>Inches</label>
                      <input type="text" value={form.inches} onChange={set('inches')} className={cls} placeholder="e.g. 5" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={label}>Material Qty</label>
                      <input type="number" min="1" value={form.material_quantity} onChange={set('material_quantity')} disabled={form.custom} className={cls} />
                    </div>
                    <div className="sm:col-span-4">
                      <label className={label}>Total Cut Count</label>
                      <input type="number" min="0" value={form.cut_count} onChange={set('cut_count')} disabled={form.custom} className={cls} />
                    </div>
                    <div className="sm:col-span-4">
                      <label className={label}>Total Bend Count</label>
                      <input type="number" min="0" value={form.bend_count} onChange={set('bend_count')} disabled={form.custom} className={cls} />
                    </div>
                    <div className="flex items-center justify-start pb-2 sm:col-span-4">{customToggle}</div>
                    {reasonPicker}
                  </>
                )}
                {custom && (
                  <div className="col-span-full mt-2 grid grid-cols-1 gap-4 rounded-md border border-purple-200 bg-purple-50 p-4 sm:grid-cols-12">
                    {chargeRow('Custom Cut Details', 'cut_desc', 'cut_rate', 'cut_qty', 'Cut')}
                    {chargeRow('Custom Bend Details', 'bend_desc', 'bend_rate', 'bend_qty', 'Bend')}
                    <h4 className="col-span-full mb-1 mt-2 text-xs font-bold uppercase text-purple-800">Sheet Rolling</h4>
                    <div className="sm:col-span-3">
                      <label className={label}>Rolling Rate (Rs.)</label>
                      <input type="number" min="0" step="0.01" value={form.sheet_roll_rate} onChange={set('sheet_roll_rate')} className={cls} />
                    </div>
                    <div className="sm:col-span-3">
                      <label className={label}>Rolling Quantity</label>
                      <input type="number" min="1" value={form.sheet_roll_qty} onChange={set('sheet_roll_qty')} className={cls} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {form.job_type === 'COIL_CUTTING' && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h4 className="mb-3 text-sm font-bold uppercase text-gray-700">Coil Cutting Details</h4>
              <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-12">
                <div className="sm:col-span-6">
                  <label className={label}>Material</label>
                  <input type="text" value={form.coil_material} onChange={set('coil_material')} className={cls} />
                </div>
                <div className="sm:col-span-6">
                  <label className={label}>Amount (In Ton)</label>
                  <select value={form.amount_range} onChange={set('amount_range')} className={cls}>
                    <option value="">Select Amount</option>
                    {workshop.coil_cutting_ranges.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                {form.custom && (
                  <div className="col-span-full grid grid-cols-1 gap-4 rounded-md border border-purple-200 bg-purple-50 p-4 sm:grid-cols-12">
                    {chargeRow('Custom Coil Cutting Price', 'coil_desc', 'coil_rate', null, 'Price')}
                  </div>
                )}
              </div>
            </div>
          )}

          {form.job_type === 'ROLLING' && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h4 className="mb-3 text-sm font-bold uppercase text-gray-700">Rolling Details</h4>
              <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-12">
                {!isCustomer && (
                  <>
                    <div className="sm:col-span-3">
                      <label className={label}>Rolling Type</label>
                      <select value={form.rolling_type} onChange={(e) => onChange({ rolling_type: e.target.value, size: '' })} disabled={form.custom} className={cls}>
                        <option value="">Select</option>
                        {withCurrent(workshop.rolling_types, form.rolling_type).map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-4">
                      <label className={label}>Sub Type</label>
                      <select value={form.work_type} onChange={set('work_type')} disabled={form.custom} className={cls}>
                        <option value="">Select</option>
                        {withCurrent(workshop.rolling_work_types, form.work_type).map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={label}>Size</label>
                      <select value={form.size} onChange={set('size')} disabled={form.custom} className={cls}>
                        <option value="">Select</option>
                        {withCurrent(rollingSizesFor(workshop, form.rolling_type), form.size).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={label}>Material Quantity</label>
                      <input type="number" min="1" value={form.quantity} onChange={set('quantity')} disabled={form.custom} className={cls} />
                    </div>
                    <div className="flex items-center justify-end pb-2 sm:col-span-1">{customToggle}</div>
                    {reasonPicker}
                  </>
                )}
              </div>
              {custom && (
                <div className="mt-4 grid grid-cols-1 gap-4 rounded-md border border-blue-200 bg-blue-50 p-4 sm:grid-cols-12">
                  {chargeRow('Custom Rolling Details', 'roll_desc', 'roll_rate', 'roll_qty', '')}
                </div>
              )}
            </div>
          )}

          {form.job_type === 'COIL_CUTTING' && workshop.allow_custom_jobs && (
            <div className="mt-3 flex justify-end">{customToggle}</div>
          )}
          {form.job_type === 'COIL_CUTTING' && form.custom && <div className="mt-3 grid sm:grid-cols-12">{reasonPicker}</div>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-5 py-3">
          <p className="text-xs text-amber-700">{issues.length > 0 ? `Still needed: ${issues.join(' · ')}` : ''}</p>
          <div className="flex shrink-0 items-center gap-2">
            {editing && (
              <button type="button" onClick={onCancelEdit} className="text-sm font-medium text-gray-600 hover:text-gray-900">
                Cancel edit
              </button>
            )}
            <button
              type="button"
              onClick={onSubmit}
              disabled={issues.length > 0}
              className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name={editing ? 'check' : 'plus'} className="mr-2 h-4 w-4" />
              {editing ? 'Update Sub-Job' : 'Add Sub-Job'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Keeps a value that is no longer in the branch list selectable while editing (prototype withCurrent). */
function withCurrent(list: string[], current: string): string[] {
  return current && !list.includes(current) ? [...list, current] : list;
}
