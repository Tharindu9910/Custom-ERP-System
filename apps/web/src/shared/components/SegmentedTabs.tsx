import { cn } from '@/shared/lib/utils';

export interface SegmentedTab<T extends string> {
  key: T;
  label: string;
  count?: number;
}

/** Prototype segmented status control (slate pill with counts). */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: SegmentedTab<T>[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
      {tabs.map((tab) => {
        const active = value === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all',
              active ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-900',
            )}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className={cn('font-mono text-[10px]', active ? 'font-bold text-blue-600/70' : 'text-slate-400')}>{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
