import { useState } from 'react';
import { MaterialSource, type LineSubType, type PriceBasis } from '@erp/shared';
import { apiError } from '@/shared/api/errors';
import { FormField } from '@/shared/components/FormField';
import { Modal } from '@/shared/components/Modal';
import { parseMoney } from '@/shared/lib/format';
import { useCreateRate } from '../hooks/usePriceList';
import { BASIS_LABEL, LINE_TYPE_LABEL, RATE_FIELDS, RATE_LINE_TYPES, SUB_TYPE_LABEL } from '../lib/price-labels';

type RateLineType = (typeof RATE_LINE_TYPES)[number];

/** Adds a work rate. The key fields must match what the order forms send, or the line stays customized. */
export function AddRateModal({ open, initialLineType, onClose }: { open: boolean; initialLineType: RateLineType; onClose: () => void }) {
  const create = useCreateRate();
  const [lineType, setLineType] = useState<RateLineType>(initialLineType);
  const [subType, setSubType] = useState<LineSubType | ''>('');
  const [variant, setVariant] = useState('');
  const [workType, setWorkType] = useState('');
  const [thickness, setThickness] = useState('');
  const [source, setSource] = useState<MaterialSource>(MaterialSource.BRANCH);
  const [basis, setBasis] = useState<PriceBasis>(RATE_FIELDS[initialLineType].bases[0]);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const fields = RATE_FIELDS[lineType];

  const pickLineType = (t: RateLineType) => {
    setLineType(t);
    setSubType('');
    setBasis(RATE_FIELDS[t].bases[0]);
    setError('');
  };

  const close = () => {
    setError('');
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (amount.trim() === '') return setError('Enter the rate');
    try {
      await create.mutateAsync({
        line_type: lineType,
        sub_type: subType || null,
        variant: fields.variant ? variant.trim() || null : null,
        work_type: fields.workType ? workType.trim() || null : null,
        thickness_or_size: fields.thickness ? thickness.trim() || null : null,
        material_source: fields.materialSource ? source : MaterialSource.BRANCH,
        price_basis: basis,
        rate: parseMoney(amount),
      });
      setVariant('');
      setWorkType('');
      setThickness('');
      setAmount('');
      close();
    } catch (err) {
      setError(apiError(err).message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="sm"
      title="Add Rate"
      subtitle="Applies to every branch. Spell names and sizes exactly as the order forms show them."
    >
      <form onSubmit={submit} className="space-y-4">
        <FormField label="Work type" required>
          <select className="input" value={lineType} onChange={(e) => pickLineType(e.target.value as RateLineType)}>
            {RATE_LINE_TYPES.map((t) => (
              <option key={t} value={t}>{LINE_TYPE_LABEL[t]}</option>
            ))}
          </select>
        </FormField>

        {fields.subTypes.length > 0 && (
          <FormField label="Operation" hint="Leave empty for a sheet or accessory rate">
            <select className="input" value={subType} onChange={(e) => setSubType(e.target.value as LineSubType | '')}>
              <option value="">—</option>
              {fields.subTypes.map((s) => (
                <option key={s} value={s}>{SUB_TYPE_LABEL[s]}</option>
              ))}
            </select>
          </FormField>
        )}
        {fields.variant && (
          <FormField label={fields.variant}>
            <input className="input" value={variant} onChange={(e) => setVariant(e.target.value)} />
          </FormField>
        )}
        {fields.workType && (
          <FormField label="Bend type" hint="e.g. Circle Bend">
            <input className="input" value={workType} onChange={(e) => setWorkType(e.target.value)} />
          </FormField>
        )}
        {fields.thickness && (
          <FormField label={fields.thickness}>
            <input className="input" value={thickness} onChange={(e) => setThickness(e.target.value)} />
          </FormField>
        )}
        {fields.materialSource && (
          <FormField label="Material">
            <select className="input" value={source} onChange={(e) => setSource(e.target.value as MaterialSource)}>
              <option value={MaterialSource.BRANCH}>Branch material</option>
              <option value={MaterialSource.CUSTOMER}>Customer material</option>
            </select>
          </FormField>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Rate (Rs)" required>
            <input
              className="input text-right font-mono"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            />
          </FormField>
          <FormField label="Charged" required>
            <select className="input" value={basis} onChange={(e) => setBasis(e.target.value as PriceBasis)}>
              {fields.bases.map((b) => (
                <option key={b} value={b}>{BASIS_LABEL[b]}</option>
              ))}
            </select>
          </FormField>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={close}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Add Rate'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
