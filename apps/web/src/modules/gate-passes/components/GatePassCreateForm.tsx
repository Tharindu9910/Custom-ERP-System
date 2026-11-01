import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { LengthUnit, formatGatePassLength, type GatePassItemInput } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { Combobox } from '@/shared/components/Combobox';
import { ColorDot } from '@/shared/components/Marks';
import { Notice } from '@/shared/components/Notice';
import { apiError, newRequestId } from '@/shared/api/errors';
import { accentFor } from '@/shared/lib/tones';
import { useCatalogMaterials, useCreateGatePass, useGatePassMaterials, type GatePassDto } from '../hooks/useGatePasses';

interface DraftItem extends GatePassItemInput {
  key: string;
}

/** Quick-edit buffer for an added row — strings so the inputs can be cleared mid-edit. */
interface RowEdit {
  key: string;
  thickness: string;
  length: string;
  unit: LengthUnit;
  qty: string;
}

interface Props {
  materials: string[];
  colors: string[];
  hideColor: boolean;
  initialPhone?: string;
  initialName?: string;
  onCreated: (gp: GatePassDto) => void;
}

const inputCls =
  'block w-full rounded-lg border border-slate-300 py-2 px-3 text-sm text-slate-900 shadow-sm focus:border-[#0033A0] focus:outline-none focus:ring-2 focus:ring-[#0033A0]/20';
const editInputCls =
  'rounded-md border border-slate-300 py-1 px-2 text-xs text-slate-900 focus:border-[#0033A0] focus:outline-none focus:ring-2 focus:ring-[#0033A0]/20';

/** "Create Gate Pass" tab — ported from the prototype GatePassView. */
export function GatePassCreateForm({ materials, colors, hideColor, initialPhone = '', initialName = '', onCreated }: Props) {
  const create = useCreateGatePass();
  // One request id per form instance, so a double-click or retry can't create two passes
  const requestId = useRef(newRequestId());
  const [phone, setPhone] = useState(initialPhone);
  const [name, setName] = useState(initialName);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [materialType, setMaterialType] = useState('');
  const [thickness, setThickness] = useState('');
  const [length, setLength] = useState('');
  const [unit, setUnit] = useState<LengthUnit>(LengthUnit.FT);
  const [color, setColor] = useState('');
  const [qty, setQty] = useState('');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rowEdit, setRowEdit] = useState<RowEdit | null>(null);
  // Inventory types first (exact spelling pricing matches on), then the branch list,
  // then names already used on earlier passes (one spelling each). Free typing still allowed.
  const { data: catalog } = useCatalogMaterials();
  const { data: usedMaterials } = useGatePassMaterials();
  const materialOptions = useMemo(() => {
    const seen = new Set<string>();
    return [...(catalog ?? []).map((c) => c.material_type), ...materials, ...(usedMaterials ?? [])].filter((m) => {
      const k = m.trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [catalog, materials, usedMaterials]);
  // Thicknesses the inventory stocks for a material (suggestions only)
  const thicknessesFor = (material: string) => catalog?.find((c) => c.material_type.toLowerCase() === material.trim().toLowerCase())?.thicknesses ?? [];

  const canAdd = !!materialType.trim() && (!!thickness.trim() || !!length.trim() || qty !== '');

  const addItem = () => {
    if (!canAdd) return;
    const lengthNum = length.trim() ? Number(length) : undefined;
    setItems((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        material_type: materialType.trim(),
        thickness: thickness.trim() || undefined,
        length: lengthNum && lengthNum > 0 ? lengthNum : undefined,
        length_unit: unit,
        color: hideColor ? undefined : color.trim() || undefined,
        quantity: qty !== '' ? Math.max(1, Math.floor(Number(qty))) : 1,
        condition_note: remarks.trim() || undefined,
      },
    ]);
    setMaterialType('');
    setThickness('');
    setLength('');
    setUnit(LengthUnit.FT);
    setColor('');
    setQty('');
    setRemarks('');
  };

  const startRowEdit = (item: DraftItem) =>
    setRowEdit({
      key: item.key,
      thickness: item.thickness ?? '',
      length: item.length ? String(item.length) : '',
      unit: item.length_unit ?? LengthUnit.FT,
      qty: String(item.quantity ?? 1),
    });

  const saveRowEdit = () => {
    if (!rowEdit) return;
    const lengthNum = rowEdit.length.trim() ? Number(rowEdit.length) : undefined;
    const qtyNum = Math.floor(Number(rowEdit.qty));
    setItems((prev) =>
      prev.map((i) =>
        i.key === rowEdit.key
          ? {
              ...i,
              thickness: rowEdit.thickness.trim() || undefined,
              length: lengthNum && lengthNum > 0 ? lengthNum : undefined,
              length_unit: rowEdit.unit,
              quantity: qtyNum >= 1 ? qtyNum : 1,
            }
          : i,
      ),
    );
    setRowEdit(null);
  };

  // Enter saves / Escape cancels, and Enter must not submit the whole form
  const rowEditKeys = (e: KeyboardEvent<HTMLElement>) => {
    // Already handled by the thickness suggestion list (picked a row / closed the list)
    if (e.defaultPrevented) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      saveRowEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setRowEdit(null);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (rowEdit) return setError('Save or cancel the item you are editing first.');
    if (!phone.trim() || !name.trim()) return setError('Customer phone number and customer name are required.');
    if (items.length === 0) return setError('Add at least one material item.');
    try {
      const gp = await create.mutateAsync({
        client_request_id: requestId.current,
        customer: { phone: phone.trim(), name: name.trim() },
        items: items.map(({ key, ...i }) => (void key, i)),
      });
      requestId.current = newRequestId();
      setPhone('');
      setName('');
      setItems([]);
      onCreated(gp);
    } catch (err) {
      setError(apiError(err).message);
    }
  };

  return (
    <form onSubmit={submit}>
      {/* Customer */}
      <div className="border-b border-slate-200 p-6">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">Customer</h3>
        <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="field-label">
              Customer Phone Number <span className="text-red-500">*</span>
            </label>
            <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="field-label">
              Customer Name <span className="text-red-500">*</span>
            </label>
            <input required type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>

      {/* Material */}
      <div className="border-b border-slate-200 bg-slate-50/50 p-6">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">Material</h3>
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            <div className={hideColor ? 'sm:col-span-12 lg:col-span-5' : 'sm:col-span-12 lg:col-span-4'}>
              <label className="field-label">
                Material Type <span className="text-red-500">*</span>
              </label>
              <Combobox
                value={materialType}
                onChange={setMaterialType}
                suggestions={materialOptions}
                noun="material"
                placeholder="Type or pick a material"
                className={inputCls}
              />
            </div>
            <div className={hideColor ? 'sm:col-span-6 lg:col-span-3' : 'sm:col-span-4 lg:col-span-2'}>
              <label className="field-label">Thickness (mm)</label>
              <Combobox value={thickness} onChange={setThickness} suggestions={thicknessesFor(materialType)} noun="thickness" className={inputCls} />
            </div>
            <div className={hideColor ? 'sm:col-span-6 lg:col-span-4' : 'sm:col-span-4 lg:col-span-3'}>
              <label className="field-label">Length &amp; Unit</label>
              <div className="flex rounded-lg shadow-sm">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                  className="block w-full min-w-0 rounded-l-lg border border-slate-300 py-2 px-3 text-sm text-slate-900 focus:border-[#0033A0] focus:outline-none focus:ring-2 focus:ring-[#0033A0]/20"
                />
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as LengthUnit)}
                  className="cursor-pointer rounded-r-lg border border-l-0 border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-700 focus:outline-none"
                >
                  <option value={LengthUnit.FT}>ft</option>
                  <option value={LengthUnit.INCHES}>inches</option>
                </select>
              </div>
            </div>
            {!hideColor && (
              <div className="sm:col-span-4 lg:col-span-3">
                <label className="field-label">Color</label>
                <input list="gp-color-options" type="text" value={color} onChange={(e) => setColor(e.target.value)} className={inputCls} />
                <datalist id="gp-color-options">
                  {colors.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 items-end gap-4 pt-1 sm:grid-cols-12">
            <div className="sm:col-span-3 lg:col-span-2">
              <label className="field-label">Quantity</label>
              <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} />
            </div>
            <div className="sm:col-span-6 lg:col-span-7">
              <label className="field-label">Remarks / Notes</label>
              <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} className={inputCls} />
            </div>
            <div className="sm:col-span-3 lg:col-span-3">
              <button
                type="button"
                onClick={addItem}
                disabled={!canAdd}
                className="flex h-[40px] w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0033A0] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                <Icon name="plus" />
                <span>Add Material</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Added */}
      <div className="p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Added</h3>
          <span className="spec-chip">{items.length}</span>
        </div>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-500">None</div>
        ) : (
          // Not clipped while editing, so the thickness suggestion list can drop below the last row
          <div className={`${rowEdit ? 'overflow-visible' : 'overflow-x-auto'} rounded-xl border border-slate-200 shadow-sm`}>
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-slate-50/80">
                <tr className="text-left font-bold uppercase tracking-wider text-slate-600">
                  <th className="w-12 px-4 py-3">#</th>
                  <th className="px-4 py-3">Material Type</th>
                  <th className="px-4 py-3">Thickness (mm)</th>
                  <th className="px-4 py-3">Length</th>
                  {!hideColor && <th className="px-4 py-3">Color</th>}
                  <th className="px-4 py-3">Quantity</th>
                  <th className="px-4 py-3">Remarks</th>
                  <th className="w-24 px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {items.map((item, idx) => {
                  const editing = rowEdit?.key === item.key ? rowEdit : null;
                  return (
                    <tr
                      key={item.key}
                      className={editing ? 'bg-blue-50/40' : 'hover:bg-slate-50/75'}
                      style={{
                        boxShadow: `inset 4px 0 0 ${accentFor(item.material_type)}`,
                      }}
                    >
                      <td className="px-4 py-3.5 font-bold text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-3.5 font-bold text-slate-900">{item.material_type}</td>
                      <td className="px-4 py-3.5">
                        {editing ? (
                          <div className="w-28" onKeyDown={rowEditKeys}>
                            <Combobox
                              autoFocus
                              value={editing.thickness}
                              onChange={(v) => setRowEdit({ ...editing, thickness: v })}
                              suggestions={thicknessesFor(item.material_type)}
                              noun="thickness"
                              className={`${editInputCls} w-full`}
                            />
                          </div>
                        ) : item.thickness ? (
                          <span className="spec-chip">{item.thickness}</span>
                        ) : (
                          <Dash />
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {editing ? (
                          <div className="flex">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              aria-label="Length"
                              value={editing.length}
                              onChange={(e) =>
                                setRowEdit({
                                  ...editing,
                                  length: e.target.value,
                                })
                              }
                              onKeyDown={rowEditKeys}
                              className={`${editInputCls} w-20 rounded-r-none`}
                            />
                            <select
                              aria-label="Length unit"
                              value={editing.unit}
                              onChange={(e) =>
                                setRowEdit({
                                  ...editing,
                                  unit: e.target.value as LengthUnit,
                                })
                              }
                              onKeyDown={rowEditKeys}
                              className="cursor-pointer rounded-r-md border border-l-0 border-slate-300 bg-slate-50 px-2 text-xs font-semibold text-slate-700 focus:outline-none"
                            >
                              <option value={LengthUnit.FT}>ft</option>
                              <option value={LengthUnit.INCHES}>inches</option>
                            </select>
                          </div>
                        ) : item.length ? (
                          <span className="spec-chip">{formatGatePassLength(item.length, item.length_unit)}</span>
                        ) : (
                          <Dash />
                        )}
                      </td>
                      {!hideColor && (
                        <td className="px-4 py-3.5">
                          {item.color ? (
                            <span className="spec-chip">
                              <ColorDot color={item.color} />
                              {item.color}
                            </span>
                          ) : (
                            <Dash />
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3.5">
                        {editing ? (
                          <input
                            type="number"
                            min="1"
                            aria-label="Quantity"
                            value={editing.qty}
                            onChange={(e) => setRowEdit({ ...editing, qty: e.target.value })}
                            onKeyDown={rowEditKeys}
                            className={`${editInputCls} w-16`}
                          />
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-[#0033A0]">
                            Qty: {item.quantity ?? 1}
                          </span>
                        )}
                      </td>
                      <td className="max-w-xs px-4 py-3.5">
                        {item.condition_note ? (
                          <span className="inline-flex items-start rounded-md border border-amber-200/80 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">
                            <span className="mr-1 shrink-0 font-bold text-amber-700">Remarks:</span>
                            {item.condition_note}
                          </span>
                        ) : (
                          <Dash />
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <div className="inline-flex items-center gap-1">
                          {editing ? (
                            <>
                              <button
                                type="button"
                                onClick={saveRowEdit}
                                className="rounded-md p-1.5 text-emerald-600 transition-colors hover:bg-emerald-50"
                                title="Save changes"
                              >
                                <Icon name="check" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setRowEdit(null)}
                                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                title="Cancel edit"
                              >
                                <Icon name="x" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => startRowEdit(item)}
                                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-[#0033A0]"
                                title="Edit item"
                              >
                                <Icon name="edit" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setItems((prev) => prev.filter((i) => i.key !== item.key))}
                                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                title="Remove item"
                              >
                                <Icon name="trash" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {error && (
          <Notice tone="error" className="mt-4">
            {error}
          </Notice>
        )}
      </div>

      <div className="flex flex-col justify-between gap-4 border-t border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="text-xs font-semibold text-slate-600">{items.length > 0 ? `${items.length} item(s)` : ''}</div>
        <button
          type="submit"
          disabled={items.length === 0 || create.isPending}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[#0033A0] px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {create.isPending ? 'Saving…' : 'Generate Gate Pass'}
        </button>
      </div>
    </form>
  );
}

const Dash = () => <span className="italic text-slate-400">—</span>;
