import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** Building blocks of the step-by-step entry forms (Create Order, Create Job Card). */

/** Numbered step heading: blue circle, title and a one-line hint. */
export function SectionHeader({ step, title, hint }: { step: number; title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-start">
      <span className="mr-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0033A0] text-sm font-bold text-white">{step}</span>
      <div>
        <h3 className="text-base font-bold text-gray-900">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
      </div>
    </div>
  );
}

/** Sub-step label inside a section ("a. What is being made?"). */
export function StepLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-700">{children}</p>;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg bg-gray-200 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${value === o.value ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900 disabled:hover:text-gray-600'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface ChoiceTile<T extends string> {
  value: T;
  label: string;
  icon: IconName;
  /** Items of this kind already added; shown as a badge */
  count?: number;
  disabled?: boolean;
}

/** Icon tiles for picking what is being added (category / job type). */
export function ChoiceTiles<T extends string>({
  tiles,
  value,
  onChange,
  className = 'grid-cols-3 sm:grid-cols-5 lg:grid-cols-9',
}: {
  tiles: ChoiceTile<T>[];
  value?: T;
  onChange: (v: T) => void;
  /** Grid columns */
  className?: string;
}) {
  return (
    <div className={`grid gap-2 ${className}`}>
      {tiles.map((t) => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            aria-label={t.label}
            disabled={t.disabled}
            onClick={() => onChange(t.value)}
            className={`relative flex flex-col items-center justify-center rounded-lg border px-2 py-3 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              active ? 'border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600' : 'border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-gray-50'
            }`}
          >
            <Icon name={t.icon} className="mb-1.5 h-5 w-5" />
            <span className="text-xs font-semibold leading-tight">{t.label}</span>
            {!!t.count && <span className="absolute right-1 top-1 rounded-full bg-gray-900 px-1.5 text-[10px] font-bold text-white">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
