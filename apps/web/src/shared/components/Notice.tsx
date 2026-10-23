import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Icon, type IconName } from './Icon';

type Tone = 'info' | 'warning' | 'error' | 'success';
const STYLES: Record<Tone, { box: string; icon: IconName }> = {
  info: { box: 'border-blue-200 bg-blue-50 text-blue-800', icon: 'info' },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-800', icon: 'alertTriangle' },
  error: { box: 'border-red-200 bg-red-50 text-red-700', icon: 'alertCircle' },
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-800', icon: 'checkCircle' },
};

export function Notice({ tone = 'info', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const s = STYLES[tone];
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', s.box, className)}>
      <Icon name={s.icon} className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
