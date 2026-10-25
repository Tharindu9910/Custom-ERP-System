import { statusTone } from '@/shared/lib/tones';
import { cn } from '@/shared/lib/utils';

/** Status pill coloured by meaning (prototype StatusPill), e.g. "Pending", "Ready", "Unpaid". */
export function StatusPill({ label, status, className }: { label: string; status?: string; className?: string }) {
  const tone = statusTone(status ?? label);
  return (
    <span className={cn('status-pill', className)} style={{ color: tone, background: `${tone}18`, borderColor: `${tone}40` }}>
      {label}
    </span>
  );
}
