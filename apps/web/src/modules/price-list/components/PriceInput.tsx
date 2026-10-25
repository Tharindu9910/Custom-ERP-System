import { useState } from 'react';
import { centsToInput, formatRs, parseMoney } from '@/shared/lib/format';

/**
 * A price shown as text; with `editable`, clicking turns it into a rupee input.
 * Enter or blur saves (only when the value changed), Escape cancels.
 */
export function PriceInput({
  cents,
  editable,
  saving,
  onSave,
  label,
}: {
  cents: number;
  editable: boolean;
  saving?: boolean;
  onSave: (cents: number) => void;
  label: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (!editable || draft === null) {
    return editable ? (
      <button
        type="button"
        className="rounded px-1 font-mono text-gray-900 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
        title={`Edit ${label}`}
        disabled={saving}
        onClick={() => setDraft(centsToInput(cents))}
      >
        {formatRs(cents)}
      </button>
    ) : (
      <span className="font-mono text-gray-900">{formatRs(cents)}</span>
    );
  }

  const commit = () => {
    const next = parseMoney(draft);
    setDraft(null);
    if (next !== cents && next >= 0) onSave(next);
  };

  return (
    <input
      autoFocus
      aria-label={label}
      inputMode="decimal"
      className="input w-28 py-1 text-right font-mono"
      value={draft}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(null);
      }}
    />
  );
}
