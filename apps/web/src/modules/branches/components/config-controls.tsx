import { useState, type ReactNode } from 'react';
import { Icon } from '@/shared/components/Icon';

// Small building blocks for the Branch Configuration screen (prototype: admin/BranchSettings).

export const inputClass =
  'mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 text-sm text-gray-800 focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500';
export const labelClass = 'block text-sm font-medium text-gray-700';
export const primaryBtn =
  'inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed';
export const secondaryBtn =
  'inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50';

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}
    >
      <span className={`mt-0.5 inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

/** One setting per row: text on the left, control on the right. */
export function SettingRow({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div>
        <p className="text-sm font-medium text-gray-900">{title}</p>
        {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
      </div>
      <div className="pt-0.5">{children}</div>
    </div>
  );
}

export function FieldGroup({ title, hint, actions, children }: { title: string; hint?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="border-b border-gray-100 py-5 first:pt-0 last:border-b-0">
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
          {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

/** Pick a subset of a fixed list. */
export function OptionPicker<T extends string>({ options, selected, onChange }: { options: { value: T; label: string }[]; selected: T[]; onChange: (next: T[]) => void }) {
  const toggle = (v: T) => onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <label
            key={o.value}
            className={`inline-flex cursor-pointer select-none items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${on ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            <input type="checkbox" checked={on} onChange={() => toggle(o.value)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

export function SelectAllLinks({ onAll, onNone }: { onAll: () => void; onNone: () => void }) {
  return (
    <div className="space-x-3 text-xs">
      <button type="button" onClick={onAll} className="text-blue-600 hover:text-blue-800">
        Select all
      </button>
      <button type="button" onClick={onNone} className="text-gray-500 hover:text-gray-700">
        Clear
      </button>
    </div>
  );
}

/** Free list maintained per branch (materials, thicknesses, ...). */
export function ListEditor({ values, onChange, placeholder }: { values: string[]; onChange: (next: string[]) => void; placeholder: string }) {
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim();
    if (!v || values.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    onChange([...values, v]);
    setText('');
  };
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        {values.length === 0 && <span className="text-sm text-gray-400">None added</span>}
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-gray-50 py-1 pl-3 pr-1.5 text-sm text-gray-800">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="rounded p-0.5 text-gray-400 hover:bg-white hover:text-red-600" aria-label={`Remove ${v}`}>
              <Icon name="x" className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex max-w-md gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
        />
        <button type="button" onClick={add} className={`${secondaryBtn} py-1.5`}>
          Add
        </button>
      </div>
    </div>
  );
}

/** Whole-number % input; empty stays empty while typing. */
export function PercentInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex max-w-40 items-center gap-2">
      <input
        type="number"
        min={0}
        max={100}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
        className={`${inputClass} mt-0`}
      />
      <span className="text-sm text-gray-500">%</span>
    </div>
  );
}

export function TypeBadge({ label }: { label: string }) {
  return <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{label}</span>;
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}
