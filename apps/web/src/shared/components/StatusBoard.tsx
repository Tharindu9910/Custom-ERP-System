import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import type { StatusTone } from '@/shared/lib/status-tones';
import { Icon, type IconName } from './Icon';

/** Building blocks of the role queue boards: Workshop, Cashier and Order Queue (Docs/decisions/0005). */

export interface StatusStep<T extends string> {
  key: T;
  title: string;
  icon: IconName;
  /** Shown when the step's list is empty */
  empty: string;
  tone: StatusTone;
}

// Every card on one line from md up, however many statuses the board has (Tailwind needs the class names written out)
const ONE_LINE: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
};

/**
 * One card per status, in lifecycle order, each with its count. The picked card's list is
 * shown below it. `arrowAfter` draws the "next step" chevron after a card.
 */
export function StatusCards<T extends string>({
  steps,
  value,
  onChange,
  counts,
  loading,
  sub,
  arrowAfter = (_key, i) => i < steps.length - 1,
}: {
  steps: StatusStep<T>[];
  value: T;
  onChange: (key: T) => void;
  counts: Partial<Record<T, number>>;
  loading?: boolean;
  /** A short note under a card's title ("2 unpaid") */
  sub?: Partial<Record<T, string>>;
  arrowAfter?: (key: T, index: number) => boolean;
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2', ONE_LINE[steps.length] ?? 'md:grid-cols-5')}>
      {steps.map((s, i) => {
        const on = s.key === value;
        const count = counts[s.key] ?? 0;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onChange(s.key)}
            aria-pressed={on}
            className={cn(
              'relative flex min-w-0 items-center gap-3 rounded-xl border bg-white px-3 py-4 lg:px-4 text-left shadow-sm transition-all hover:shadow-md',
              on ? cn('ring-2', s.tone.ring) : 'border-slate-200',
            )}
          >
            {/* The icon gives way first so the title and count fit on narrow screens */}
            <span className={cn('hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg xl:flex', s.tone.icon)}>
              <Icon name={s.icon} className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold leading-snug text-slate-900">{s.title}</span>
              {sub?.[s.key] && <span className="block text-xs font-semibold text-red-500">{sub[s.key]}</span>}
            </span>
            <span className={cn('shrink-0 text-2xl font-bold leading-none tabular-nums', count ? s.tone.count : 'text-slate-300')}>{loading ? '–' : count}</span>
            {arrowAfter(s.key, i) && (
              <Icon name="chevronRight" className="absolute -right-3.5 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 rounded-full bg-slate-50 text-slate-300 md:block" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The picked status's list: a titled, full-width frame. */
export function BoardSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
          {title} <span className="ml-1 font-semibold text-slate-400">({count})</span>
        </h2>
      </header>
      {children}
    </section>
  );
}
