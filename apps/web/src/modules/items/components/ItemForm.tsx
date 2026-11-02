import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ItemType } from '@erp/shared';
import { apiError, newRequestId } from '@/shared/api/errors';
import { SectionTitle } from '@/shared/components/DetailParts';
import { Modal } from '@/shared/components/Modal';
import { Notice } from '@/shared/components/Notice';
import { centsToInput, formatDateTime, formatRs, parseMoney } from '@/shared/lib/format';
import { useCatalogOptions, useCreateItem, useCreateItemRequest, useItemRequestAction, type ItemRequestDto } from '../hooks/useItemRequests';

/**
 * - request:    a supervisor asks; the branch manager decides
 * - direct:     a branch manager adds it straight away (still audited)
 * - approve:    the manager reviews a supervisor's request, may correct it, and approves or rejects
 * - headOffice: admin / super admin add to the catalogue from Price List
 */
export type ItemFormMode = 'request' | 'direct' | 'approve' | 'headOffice';

const TYPE_LABEL: Record<ItemType, string> = { HARDWARE: 'Hardware', MATERIAL: 'Sheet material', COIL: 'Coil' };
const DEFAULT_UNIT: Record<ItemType, string> = { HARDWARE: 'piece', MATERIAL: 'sheet', COIL: 'ft' };

/** What pricing looks the item up by, so these must be exact (Docs/decisions/0013). */
const ATTRIBUTE_FIELDS: Record<ItemType, { key: string; label: string; required: boolean; placeholder: string }[]> = {
  HARDWARE: [{ key: 'size', label: 'Size', required: false, placeholder: 'e.g. 12mm' }],
  MATERIAL: [
    { key: 'material_type', label: 'Material type', required: true, placeholder: 'e.g. MS Plain' },
    { key: 'thickness', label: 'Thickness', required: true, placeholder: 'e.g. 2mm' },
  ],
  COIL: [
    { key: 'origin', label: 'Origin', required: true, placeholder: 'e.g. CN' },
    { key: 'thickness', label: 'Thickness', required: true, placeholder: 'e.g. 0.47mm' },
    { key: 'color', label: 'Colour', required: true, placeholder: 'e.g. RED' },
  ],
};

const TITLE: Record<ItemFormMode, string> = {
  request: 'Ask for a new item',
  direct: 'Add a new item',
  approve: 'Review new item',
  headOffice: 'Add a new item',
};
const SUBTITLE: Record<ItemFormMode, string> = {
  request: 'Your branch manager checks it and sets the SKU and price. It is not sold anywhere until then.',
  direct: 'It goes into the catalogue for every branch at once, and your branch starts keeping it.',
  approve: 'Approving adds it to the catalogue for every branch. Correct anything that is wrong first.',
  headOffice: 'It goes into the catalogue for every branch at once. Branches set their own minimum.',
};

export function ItemForm({
  mode,
  request,
  onClose,
  onDone,
}: {
  mode: ItemFormMode;
  /** The request under review (approve mode) */
  request?: ItemRequestDto;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { data: options } = useCatalogOptions();
  const createRequest = useCreateItemRequest();
  const decide = useItemRequestAction();
  const createItem = useCreateItem();
  const requestId = useRef(newRequestId());

  const [itemType, setItemType] = useState<ItemType>(request?.item_type ?? ItemType.HARDWARE);
  const [name, setName] = useState(request?.name ?? '');
  const [category, setCategory] = useState(request?.category ?? '');
  const [unit, setUnit] = useState(request?.unit ?? DEFAULT_UNIT[ItemType.HARDWARE]);
  const [attributes, setAttributes] = useState<Record<string, string>>(request?.attributes ?? {});
  const [note, setNote] = useState('');
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState(centsToInput(request?.suggested_price));
  const [cost, setCost] = useState(centsToInput(request?.suggested_cost));
  const [minimum, setMinimum] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const live = mode !== 'request';
  const branchMinimum = mode === 'direct' || mode === 'approve';
  const busy = createRequest.isPending || decide.isPending || createItem.isPending;

  const pickType = (t: ItemType) => {
    setItemType(t);
    setUnit(DEFAULT_UNIT[t]);
    setAttributes({});
  };
  const fields = { name: name.trim(), item_type: itemType, category: category.trim(), unit: unit.trim(), attributes: cleaned(itemType, attributes) };
  const liveFields = () => ({ sku: sku.trim().toUpperCase(), price: parseMoney(price), unit_cost: parseMoney(cost) });

  const missing = [
    !fields.name && 'name',
    !fields.category && 'category',
    !fields.unit && 'unit',
    ...ATTRIBUTE_FIELDS[itemType].filter((f) => f.required && !attributes[f.key]?.trim()).map((f) => f.label.toLowerCase()),
    live && !sku.trim() && 'SKU',
    live && itemType !== ItemType.COIL && parseMoney(price) <= 0 && 'selling price',
    branchMinimum && minimum.trim() === '' && 'minimum',
  ].filter(Boolean) as string[];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (missing.length > 0) return setError(`Fill in: ${missing.join(', ')}`);
    setError(null);
    try {
      if (mode === 'request') {
        await createRequest.mutateAsync({
          ...fields,
          client_request_id: requestId.current,
          suggested_price: price.trim() ? parseMoney(price) : undefined,
          suggested_cost: cost.trim() ? parseMoney(cost) : undefined,
          note: note.trim() || undefined,
        });
        onDone(`Sent "${fields.name}" to your branch manager.`);
      } else if (mode === 'direct') {
        const r = await createRequest.mutateAsync({
          ...fields,
          client_request_id: requestId.current,
          approve: { ...liveFields(), reorder_level: Number(minimum) },
        });
        onDone(`Added ${r.item?.sku ?? fields.name} to the catalogue.`);
      } else if (mode === 'approve' && request) {
        const r = await decide.mutateAsync({
          action: 'approve',
          id: request.request_id,
          body: { ...fields, ...liveFields(), reorder_level: Number(minimum) },
        });
        onDone(`Approved: ${r.item?.sku ?? fields.name} is now in the catalogue.`);
      } else {
        await createItem.mutateAsync({ ...fields, ...liveFields() });
        onDone(`Added ${liveFields().sku} to the catalogue.`);
      }
      requestId.current = newRequestId();
    } catch (err) {
      setError(apiError(err).message);
    }
  };

  const reject = async () => {
    if (!request || reason.trim().length < 3) return setError('Give a reason (at least 3 characters)');
    try {
      await decide.mutateAsync({ action: 'reject', id: request.request_id, body: { reason: reason.trim() } });
      onDone(`Rejected "${request.name}".`);
    } catch (err) {
      setError(apiError(err).message);
    }
  };

  const submitLabel = mode === 'request' ? 'Send to manager' : mode === 'approve' ? 'Approve and add' : 'Add item';

  return (
    <Modal
      open
      size="md"
      fixedHeight
      onClose={onClose}
      title={TITLE[mode]}
      subtitle={SUBTITLE[mode]}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-3">
          {rejecting ? (
            <>
              <button type="button" onClick={() => setRejecting(false)} className="btn-secondary">
                Back
              </button>
              <button
                type="button"
                onClick={() => void reject()}
                disabled={reason.trim().length < 3 || busy}
                className="btn-primary bg-red-600 hover:bg-red-700"
              >
                {busy ? 'Rejecting…' : 'Reject request'}
              </button>
            </>
          ) : (
            <>
              {mode === 'approve' && (
                <button type="button" onClick={() => setRejecting(true)} className="btn-secondary mr-auto border-red-300 text-red-700 hover:bg-red-50">
                  Reject
                </button>
              )}
              <button type="button" onClick={onClose} className="btn-secondary">
                Close
              </button>
              <button type="submit" form="item-form" disabled={busy} className="btn-primary">
                {busy ? 'Saving…' : submitLabel}
              </button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        {request && (
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-slate-50 p-4 text-sm">
            <span className="text-slate-500">Asked by</span>
            <span className="text-right font-semibold text-slate-900">{request.requested_by_name ?? 'A supervisor'}</span>
            <span className="text-slate-500">Asked on</span>
            <span className="text-right font-semibold text-slate-900">{formatDateTime(request.created_at)}</span>
            {request.suggested_price !== null && (
              <>
                <span className="text-slate-500">Suggested price</span>
                <span className="text-right font-semibold text-slate-900">{formatRs(request.suggested_price)}</span>
              </>
            )}
          </div>
        )}
        {request?.note && (
          <p className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
            <strong className="text-slate-800">Note:</strong> {request.note}
          </p>
        )}

        {rejecting ? (
          <div>
            <p className="mb-3 text-sm text-slate-600">Say why, so the supervisor knows what to do instead.</p>
            <Field label="Reason" required>
              <textarea className={`${inputCls} min-h-28`} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus aria-label="Reject reason" />
            </Field>
          </div>
        ) : (
          <form id="item-form" onSubmit={(e) => void submit(e)} className="space-y-5">
            <div>
              <SectionTitle title="Product" />
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                <Field label="Type" required>
                  <select className={inputCls} value={itemType} onChange={(e) => pickType(e.target.value as ItemType)} aria-label="Item type">
                    {Object.values(ItemType).map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Name" required>
                  <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} aria-label="Item name" />
                </Field>
                <Field label="Category" required>
                  <ChoiceInput key={`category-${itemType}-${options ? 'ready' : 'loading'}`} label="Category" value={category} choices={options?.[itemType]?.categories ?? []} onChange={setCategory} />
                </Field>
                <Field label="Unit" required>
                  <ChoiceInput key={`unit-${itemType}-${options ? 'ready' : 'loading'}`} label="Unit" value={unit} choices={options?.[itemType]?.units ?? [DEFAULT_UNIT[itemType]]} onChange={setUnit} />
                </Field>
                {ATTRIBUTE_FIELDS[itemType].map((f) => (
                  <Field key={f.key} label={f.label} required={f.required}>
                    <input
                      className={inputCls}
                      value={attributes[f.key] ?? ''}
                      placeholder={f.placeholder}
                      onChange={(e) => setAttributes((a) => ({ ...a, [f.key]: e.target.value }))}
                      aria-label={f.label}
                    />
                  </Field>
                ))}
              </div>
              {itemType !== ItemType.HARDWARE && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  Job pricing finds this item by {ATTRIBUTE_FIELDS[itemType].map((f) => f.label.toLowerCase()).join(', ')}. Spell them exactly as on existing items.
                </p>
              )}
            </div>

            {live && (
              <div>
                <SectionTitle title={branchMinimum ? 'Price and stock' : 'Price'} />
                <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                  <Field label="SKU" required hint="Unique code, e.g. FIT-HG-075">
                    <input className={`${inputCls} font-mono uppercase`} value={sku} onChange={(e) => setSku(e.target.value)} aria-label="SKU" />
                  </Field>
                  <Field label="Selling price (Rs)" required={itemType !== ItemType.COIL} hint={itemType === ItemType.COIL ? 'Coils are charged by the roofing rates' : undefined}>
                    <input className={inputCls} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Selling price" />
                  </Field>
                  <Field label="Cost (Rs)">
                    <input className={inputCls} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} aria-label="Cost" />
                  </Field>
                  {branchMinimum && (
                    <Field label="Minimum at this branch" required hint="Restock lists it below this">
                      <input className={inputCls} type="number" min={0} step="any" value={minimum} onChange={(e) => setMinimum(e.target.value)} aria-label="Minimum" />
                    </Field>
                  )}
                </div>
              </div>
            )}

            {mode === 'request' && (
              <div>
                <SectionTitle title="For the manager" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                  <Field label="Suggested price (Rs)" hint="Optional; the manager sets the real price">
                    <input className={inputCls} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Suggested price" />
                  </Field>
                  <Field label="Cost, if known (Rs)">
                    <input className={inputCls} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} aria-label="Suggested cost" />
                  </Field>
                  <Field label="Why is it needed?" className="col-span-2">
                    <textarea className={`${inputCls} min-h-20`} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
                  </Field>
                </div>
              </div>
            )}
          </form>
        )}

        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Modal>
  );
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500';

/** Small uppercase label above a field, as in the other stock popups. */
function Field({ label, required, hint, className, children }: { label: string; required?: boolean; hint?: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </p>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

const OTHER = '__other__';

/**
 * A dropdown of the values the catalogue already uses (from the item table), with
 * "Other…" for a new one, which turns it into a text box.
 */
function ChoiceInput({ label, value, choices, onChange }: { label: string; value: string; choices: string[]; onChange: (v: string) => void }) {
  const [typing, setTyping] = useState(() => value !== '' && !choices.includes(value));
  if (typing) {
    return (
      <div className="flex gap-2">
        <input className={`${inputCls} flex-1`} value={value} autoFocus placeholder={`New ${label.toLowerCase()}`} onChange={(e) => onChange(e.target.value)} aria-label={label} />
        {choices.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setTyping(false);
              onChange('');
            }}
            className="shrink-0 text-xs font-semibold text-slate-500 hover:text-slate-800"
          >
            Pick from list
          </button>
        )}
      </div>
    );
  }
  return (
    <select
      className={inputCls}
      value={choices.includes(value) ? value : ''}
      onChange={(e) => {
        if (e.target.value === OTHER) {
          setTyping(true);
          onChange('');
        } else onChange(e.target.value);
      }}
      aria-label={label}
    >
      <option value="">Choose…</option>
      {choices.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value={OTHER}>Other (new {label.toLowerCase()})…</option>
    </select>
  );
}

/** Only the fields this type uses, without blanks. */
function cleaned(itemType: ItemType, attributes: Record<string, string>): Record<string, string> {
  const keys = ATTRIBUTE_FIELDS[itemType].map((f) => f.key);
  return Object.fromEntries(Object.entries(attributes).filter(([k, v]) => keys.includes(k) && v.trim()).map(([k, v]) => [k, v.trim()]));
}
