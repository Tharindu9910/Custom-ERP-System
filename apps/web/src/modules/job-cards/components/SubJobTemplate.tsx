import { useMemo } from 'react';
import { MaterialSource, rollingSizesFor, type WorkshopConfig, type WorkshopJobType } from '@erp/shared';
import { ChoiceTiles, SectionHeader, Segmented, StepLabel } from '@/shared/components/FormSection';
import { Icon, type IconName } from '@/shared/components/Icon';
import { SearchableSelect } from '@/shared/components/SearchableSelect';
import { formatRs, parseMoney } from '@/shared/lib/format';
import { materialLabel, type CustomerMaterialOption } from '@/modules/gate-passes/lib/customer-material';
import type { WorkshopCoilOption } from '../hooks/useWorkshopCatalog';
import { CUSTOMIZED_REASONS, JOB_TYPE_LABEL, describeSubJob, isCustomMode, toLineInput, type SheetNeed, type SubJobForm } from '../lib/sub-job-form';

const JOB_TYPE_ICON: Record<WorkshopJobType, IconName> = { CUT_BEND: 'ruler', COIL_CUTTING: 'layers', ROLLING: 'refresh' };

const cls =
  'block w-full rounded-md border border-gray-300 py-2 px-3 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-400';
const label = 'mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500';
const req = <span className="text-red-500">*</span>;

type Field = keyof SubJobForm;

interface Props {
  id: string;
  step: number;
  form: SubJobForm;
  onChange: (patch: Partial<SubJobForm>) => void;
  workshop: WorkshopConfig;
  /** Customer-supplied material is possible (branch allows it and uses gate passes) */
  customerOn: boolean;
  /** The customer's gate pass items, with what is left for this sub-job */
  materials: (CustomerMaterialOption & { left: number })[];
  phoneReady: boolean;
  canCreateGatePass: boolean;
  onCreateGatePass: () => void;
  /** Sub-jobs already on the card, per job type (tile badges) */
  counts: Partial<Record<WorkshopJobType, number>>;
  editing: boolean;
  issues: string[];
  /** Coil Cutting material list (workshop catalog, loaded once by the form) */
  coils?: WorkshopCoilOption[];
  coilsLoading: boolean;
  /** This sub-job's sheets with the rest of the card's, against free stock (null = not stock-tracked) */
  sheet: SheetNeed | null;
  overrideAllowed: boolean;
  onSubmit: () => void;
  onCancelEdit: () => void;
}

/** Add / edit one sub-job: a. job type, b. material (branch or a gate pass item), c. pricing, d. details (Docs/decisions/0007). */
export function SubJobTemplate({
  id,
  step,
  form,
  onChange,
  workshop,
  customerOn,
  materials,
  phoneReady,
  canCreateGatePass,
  onCreateGatePass,
  counts,
  editing,
  issues,
  coils,
  coilsLoading,
  sheet,
  overrideAllowed,
  onSubmit,
  onCancelEdit,
}: Props) {
  const custom = isCustomMode(form);
  const isCustomer = form.material_source === MaterialSource.CUSTOMER;
  const coilCutting = form.job_type === 'COIL_CUTTING';
  const lengthMaterial = workshop.length_materials.includes(form.material_type);
  // Customer cut/bend and rolling are always priced by hand, so there is no choice to make (prototype)
  const forcedCustom = isCustomer && !coilCutting;
  const canChoosePricing = workshop.allow_custom_jobs && !forcedCustom;
  // Branch material inputs stay in custom mode; the customer's material comes from the gate pass item
  const branchInputs = !isCustomer;
  const detailsStep = String.fromCharCode('a'.charCodeAt(0) + 1 + (customerOn ? 1 : 0) + (canChoosePricing ? 1 : 0));
  const picked = materials.find((m) => m.gp_item_id === form.gp_item_id);
  // More pieces than the gate pass item has left: shown on the field at once (Docs/decisions/0009)
  const piecesOver = isCustomer && !!picked && Number(form.gp_quantity) > picked.left;
  const sheetShort = branchInputs && form.job_type === 'CUT_BEND' && !!sheet && sheet.need > sheet.free;
  const coilOptions = useMemo(() => {
    const list = (coils ?? []).map((c) => ({ value: c.name, label: c.name, hint: `${c.sku} · ${c.stock_ft.toLocaleString()} ft in stock` }));
    // A saved card keeps its material selectable even if it is no longer in the inventory
    return form.coil_material && !list.some((o) => o.value === form.coil_material) ? [...list, { value: form.coil_material, label: form.coil_material, hint: 'Not in inventory' }] : list;
  }, [coils, form.coil_material]);
  const set = (k: Field) => (e: { target: { value: string } }) => onChange({ [k]: e.target.value });
  const charges = toLineInput(form).custom_charges;
  const customTotal = charges.reduce((s, c) => s + Math.round(c.rate * c.quantity), 0);

  const select = (k: Field, list: string[], placeholder: string, reset?: Partial<SubJobForm>, required = true) => (
    <SearchableSelect
      options={withCurrent(list, form[k] as string).map((v) => ({ value: v, label: v }))}
      value={(form[k] as string) || undefined}
      onChange={(v) => onChange({ [k]: v, ...reset })}
      placeholder={placeholder}
      invalid={required && !form[k]}
    />
  );

  const chargeRow = (title: string, d: Field, r: Field, q: Field | null, prefix: string) => {
    const rate = form[r] as string;
    // An empty quantity counts as 1, as on save
    const qty = q ? Number(form[q] as string) || 1 : 1;
    const line = rate.trim() ? Math.round(parseMoney(rate) * qty) : 0;
    return (
      <>
        <h4 className="col-span-full mb-1 text-xs font-bold uppercase tracking-wider text-purple-800">{title}</h4>
        <div className={q ? 'sm:col-span-5' : 'sm:col-span-7'}>
          <label className={label}>{prefix} Description</label>
          <input type="text" value={form[d] as string} onChange={set(d)} className={cls} placeholder="What is being done" />
        </div>
        <div className="sm:col-span-3">
          <label className={label}>{prefix} Rate (Rs.)</label>
          <input type="number" min="0" step="0.01" value={rate} onChange={set(r)} className={cls} />
        </div>
        {q && (
          <div className="sm:col-span-2">
            <label className={label}>{prefix} Quantity</label>
            <input type="number" min="1" value={form[q] as string} onChange={set(q)} className={cls} />
          </div>
        )}
        <div className="flex items-end pb-2 text-sm font-semibold tabular-nums text-purple-900 sm:col-span-2">{line > 0 ? `= ${formatRs(line)}` : ''}</div>
      </>
    );
  };

  const reasonPicker = form.custom && !isCustomer && (
    <div className="sm:col-span-6">
      <label className={label}>Reason for custom pricing {req}</label>
      {select('customized_reason_code', CUSTOMIZED_REASONS, 'Select reason…')}
    </div>
  );

  return (
    <div id={id} className={`scroll-mt-4 border-b border-gray-200 p-6 ${editing ? 'bg-amber-50/50' : ''}`}>
      <SectionHeader
        step={step}
        title={editing ? 'Edit Sub-Job' : 'Add Sub-Job'}
      />

      <StepLabel>a. Work Type</StepLabel>
      <div className="mb-6">
        <ChoiceTiles
          className="grid-cols-3 sm:max-w-md"
          tiles={workshop.job_types.map((t) => ({
            value: t,
            label: JOB_TYPE_LABEL[t],
            icon: JOB_TYPE_ICON[t],
            count: counts[t],
            // A saved sub-job keeps its job type
            disabled: editing && form.job_type !== t,
          }))}
          value={form.job_type}
          onChange={(t) => onChange({ job_type: t })}
        />
      </div>

      {customerOn && (
        <div className="mb-6">
          <StepLabel>b. Material</StepLabel>
          <Segmented
            value={form.material_source}
            onChange={(v) => onChange({ material_source: v })}
            options={[
              { value: MaterialSource.BRANCH, label: 'Branch Stock' },
              { value: MaterialSource.CUSTOMER, label: "Customer's Material" },
            ]}
          />
          {isCustomer &&
            (materials.length === 0 ? (
              <div className="mt-3 flex max-w-2xl flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                <span className="inline-flex items-start gap-1.5">
                  <Icon name="alertCircle" className="mt-0.5 h-4 w-4 shrink-0" />
                  {phoneReady ? 'This customer has no gate pass material left. Record a gate pass first.' : 'Enter the customer phone first to see their gate passes.'}
                </span>
                {phoneReady && canCreateGatePass && (
                  <button type="button" onClick={onCreateGatePass} className="shrink-0 text-xs font-bold text-[#0033A0] hover:underline">
                    Create New Gate Pass
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-3 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-12">
                <div className="sm:col-span-9">
                  <label className={label}>Gate Pass Item {req}</label>
                  <SearchableSelect
                    options={materials.map((m) => ({
                      value: m.gp_item_id,
                      label: materialLabel(m),
                      hint: `${Math.max(0, m.left)} of ${m.received} left`,
                    }))}
                    value={form.gp_item_id || undefined}
                    onChange={(v) => onChange({ gp_item_id: v, gp_quantity: v && !form.gp_quantity ? '1' : form.gp_quantity })}
                    placeholder="Search gate pass material…"
                    invalid={!form.gp_item_id}
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className={label}>Pieces Used {req}</label>
                  <input
                    type="number"
                    min="1"
                    max={picked ? Math.max(0, picked.left) : undefined}
                    value={form.gp_quantity}
                    onChange={set('gp_quantity')}
                    className={`${cls} ${piecesOver ? '!border-red-400 !ring-red-300' : ''}`}
                  />
                </div>
                {piecesOver && picked && (
                  <p className="col-span-full -mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-red-600">
                    <Icon name="alertCircle" className="h-4 w-4 shrink-0" />
                    Only {Math.max(0, picked.left)} piece{picked.left === 1 ? '' : 's'} left on {picked.pass_number} for this sub-job.
                  </p>
                )}
              </div>
            ))}
        </div>
      )}

      {canChoosePricing && (
        <div className="mb-6">
          <StepLabel>{customerOn ? 'c.' : 'b.'} Pricing</StepLabel>
          <Segmented
            value={custom ? 'CUSTOM' : 'STANDARD'}
            onChange={(v) => onChange({ custom: v === 'CUSTOM' })}
            options={[
              { value: 'STANDARD', label: 'Standard' },
              { value: 'CUSTOM', label: 'Custom' },
            ]}
          />
        </div>
      )}

      <StepLabel>{detailsStep}. {JOB_TYPE_LABEL[form.job_type]} details</StepLabel>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
        {/* Inputs share a baseline even when a label wraps */}
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-12">
          {form.job_type === 'CUT_BEND' && (
            <>
              {/* Branch sheets are always named (held and deducted); counts grey out when priced by hand (prototype) */}
              {branchInputs && (
                <>
                  <div className="sm:col-span-6 lg:col-span-4">
                    <label className={label}>Material Type {req}</label>
                    {select('material_type', workshop.materials, 'Select material…', { thickness: '' })}
                  </div>
                  <div className="sm:col-span-6 lg:col-span-3">
                    <label className={label}>
                      {lengthMaterial ? 'Length' : 'Thickness'} {req}
                    </label>
                    {lengthMaterial ? (
                      <input type="text" value={form.thickness} onChange={set('thickness')} className={cls} />
                    ) : (
                      select('thickness', workshop.thicknesses, 'Select thickness…')
                    )}
                  </div>
                  <div className="sm:col-span-6 lg:col-span-3">
                    <label className={label}>Inches</label>
                    <input type="text" value={form.inches} onChange={set('inches')} className={cls} placeholder="e.g. 5" />
                  </div>
                  <div className="sm:col-span-6 lg:col-span-2">
                    <label className={label}>Material Qty {req}</label>
                    <input
                      type="number"
                      min="1"
                      value={form.material_quantity}
                      onChange={set('material_quantity')}
                      className={`${cls} ${sheetShort ? '!border-amber-400' : ''}`}
                      placeholder="e.g. 3"
                    />
                  </div>
                  {sheetShort && sheet && (
                    <p className={`col-span-full -mt-1 inline-flex items-center gap-1.5 text-sm font-medium ${overrideAllowed ? 'text-amber-700' : 'text-red-600'}`}>
                      <Icon name="alertCircle" className="h-4 w-4 shrink-0" />
                      Only {Math.max(0, sheet.free)} {sheet.label} free ({sheet.need} needed on this card).{' '}
                      {overrideAllowed ? 'Saving will ask for a stock override.' : 'Overrides are off at this branch.'}
                    </p>
                  )}
                  <div className="sm:col-span-6 lg:col-span-3">
                    <label className={label}>Total Cut Count</label>
                    <input type="number" min="0" disabled={custom} value={custom ? '' : form.cut_count} onChange={set('cut_count')} className={cls} />
                  </div>
                  <div className="sm:col-span-6 lg:col-span-3">
                    <label className={label}>Total Bend Count</label>
                    <input type="number" min="0" disabled={custom} value={custom ? '' : form.bend_count} onChange={set('bend_count')} className={cls} />
                  </div>
                  {!custom && <p className="col-span-full -mt-1 text-xs text-gray-500">Enter the cuts, the bends, or both.</p>}
                </>
              )}
              {reasonPicker}
              {custom && (
                <div className="col-span-full grid grid-cols-1 gap-4 rounded-md border border-purple-200 bg-purple-50 p-4 sm:grid-cols-12">
                  {chargeRow('Custom Cut Details', 'cut_desc', 'cut_rate', 'cut_qty', 'Cut')}
                  {chargeRow('Custom Bend Details', 'bend_desc', 'bend_rate', 'bend_qty', 'Bend')}
                </div>
              )}
              {/* Optional on every Cut / Bend sub-job, charged whenever a rate is given */}
              <div className="col-span-full grid grid-cols-1 gap-4 border-t border-gray-200 pt-4 sm:grid-cols-12">
                <h4 className="col-span-full text-xs font-bold uppercase tracking-wider text-gray-700">Sheet Rolling (optional)</h4>
                <div className="sm:col-span-3">
                  <label className={label}>Rolling Rate (Rs.)</label>
                  <input type="number" min="0" step="0.01" value={form.sheet_roll_rate} onChange={set('sheet_roll_rate')} className={cls} />
                </div>
                <div className="sm:col-span-3">
                  <label className={label}>Rolling Quantity</label>
                  <input type="number" min="1" value={form.sheet_roll_qty} onChange={set('sheet_roll_qty')} className={cls} />
                </div>
              </div>
            </>
          )}

          {coilCutting && (
            <>
              <div className="sm:col-span-6">
                <label className={label}>Material {req}</label>
                {/* Branch stock: a coil from the inventory; the customer's own coil is described by hand */}
                {branchInputs ? (
                  <SearchableSelect
                    options={coilOptions}
                    value={form.coil_material || undefined}
                    onChange={(v) => onChange({ coil_material: v })}
                    placeholder={coilsLoading ? 'Loading coils…' : 'Search coil…'}
                    invalid={!form.coil_material}
                  />
                ) : (
                  <input type="text" value={form.coil_material} onChange={set('coil_material')} className={cls} placeholder="e.g. Zinc coil 0.47mm" />
                )}
              </div>
              <div className="sm:col-span-6">
                <label className={label}>Amount (In Ton) {req}</label>
                {select('amount_range', workshop.coil_cutting_ranges, 'Select amount…')}
              </div>
              {reasonPicker}
              {form.custom && (
                <div className="col-span-full grid grid-cols-1 gap-4 rounded-md border border-purple-200 bg-purple-50 p-4 sm:grid-cols-12">
                  {chargeRow('Custom Coil Cutting Price', 'coil_desc', 'coil_rate', null, 'Price')}
                </div>
              )}
            </>
          )}

          {form.job_type === 'ROLLING' && (
            <>
              {/* Branch: type and sub type stay; size and quantity grey out when priced by hand (prototype) */}
              {branchInputs && (
                <>
                  <div className="sm:col-span-6 lg:col-span-3">
                    <label className={label}>Rolling Type {!custom && req}</label>
                    {select('rolling_type', workshop.rolling_types, 'Select type…', { size: '' }, !custom)}
                  </div>
                  <div className="sm:col-span-6 lg:col-span-3">
                    <label className={label}>Sub Type {!custom && req}</label>
                    {select('work_type', workshop.rolling_work_types, 'Select sub type…', undefined, !custom)}
                  </div>
                  <div className="sm:col-span-6 lg:col-span-3">
                    <label className={label}>Size {!custom && req}</label>
                    {custom ? (
                      <input type="text" disabled value="" className={cls} />
                    ) : (
                      select('size', rollingSizesFor(workshop, form.rolling_type), 'Select size…')
                    )}
                  </div>
                  <div className="sm:col-span-6 lg:col-span-3">
                    <label className={label}>Material Quantity {!custom && req}</label>
                    <input type="number" min="1" disabled={custom} value={custom ? '' : form.quantity} onChange={set('quantity')} className={cls} />
                  </div>
                </>
              )}
              {reasonPicker}
              {custom && (
                <div className="col-span-full grid grid-cols-1 gap-4 rounded-md border border-purple-200 bg-purple-50 p-4 sm:grid-cols-12">
                  {chargeRow('Custom Rolling Details', 'roll_desc', 'roll_rate', 'roll_qty', '')}
                </div>
              )}
            </>
          )}

          {custom && customTotal > 0 && (
            <div className="col-span-full -mt-1 text-sm font-medium text-purple-800">Custom price for this sub-job: {formatRs(customTotal)}</div>
          )}
          {!custom && issues.length === 0 && <div className="col-span-full -mt-1 text-sm font-medium text-blue-700">{describeSubJob(form)}</div>}
        </div>
      </div>

      <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-h-4 text-xs text-amber-700">
          {issues.length > 0 && (
            <span className="inline-flex items-center">
              <Icon name="alertCircle" className="mr-1 h-4 w-4 shrink-0" /> Still needed: {issues.join(' · ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {editing && (
            <button type="button" onClick={onCancelEdit} className="text-sm font-medium text-gray-700 hover:text-gray-900">
              Cancel edit
            </button>
          )}
          <button
            type="button"
            onClick={onSubmit}
            disabled={issues.length > 0}
            className="inline-flex items-center rounded-md border border-transparent bg-gray-900 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name={editing ? 'check' : 'plus'} className="mr-2 h-4 w-4" />
            {editing ? 'Update Sub-Job' : 'Add Sub-Job'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Keeps a value that is no longer in the branch list selectable while editing (prototype withCurrent). */
function withCurrent(list: string[], current: string): string[] {
  return current && !list.includes(current) ? [...list, current] : list;
}
