import { Icon, type IconName } from './Icon';

export interface PageTab<T extends string> {
  value: T;
  label: string;
  icon: IconName;
}

/** Full-width tabs across the top of a page card (Gate Pass, Create Job Card). */
export function PageTabs<T extends string>({ tabs, value, onChange }: { tabs: PageTab<T>[]; value: T; onChange: (value: T) => void }) {
  return (
    <div role="tablist" className="flex border-b border-slate-200 bg-slate-50/70">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-4 py-3.5 text-sm font-semibold transition-all ${
              active ? 'border-[#0033A0] bg-white text-[#0033A0]' : 'border-transparent text-slate-500 hover:bg-slate-100/60 hover:text-slate-800'
            }`}
          >
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
