import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Icon, type IconName } from './Icon';

type Tone = 'slate' | 'amber' | 'blue' | 'emerald' | 'red' | 'violet';

const TONES: Record<Tone, { ring: string; icon: string; value: string }> = {
  slate: { ring: 'ring-slate-200', icon: 'bg-slate-100 text-slate-600', value: 'text-slate-900' },
  amber: { ring: 'ring-amber-200', icon: 'bg-amber-50 text-amber-600', value: 'text-amber-700' },
  blue: { ring: 'ring-blue-200', icon: 'bg-blue-50 text-blue-600', value: 'text-blue-700' },
  emerald: { ring: 'ring-emerald-200', icon: 'bg-emerald-50 text-emerald-600', value: 'text-emerald-700' },
  red: { ring: 'ring-red-200', icon: 'bg-red-50 text-red-600', value: 'text-red-700' },
  violet: { ring: 'ring-violet-200', icon: 'bg-violet-50 text-violet-600', value: 'text-violet-700' },
};

/** A KPI tile; clickable tiles open the list behind the number (instructions §5.3). */
export function KpiCard({
  label,
  value,
  sub,
  icon,
  tone = 'slate',
  active,
  onClick,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: IconName;
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
}) {
  const t = TONES[tone];
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all',
        onClick && 'hover:border-slate-300 hover:shadow',
        active && `ring-2 ${t.ring}`,
      )}
    >
      {icon && (
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', t.icon)}>
          <Icon name={icon} className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
        <span className={cn('block text-2xl font-bold', t.value)}>{value}</span>
        {sub && <span className="block text-xs text-slate-500">{sub}</span>}
      </span>
    </Comp>
  );
}
