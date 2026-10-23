import { cn } from '@/shared/lib/utils';

/** Marks the main (distribution) branch wherever branches are listed. */
export function MainBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800', className)}
      title="Main branch — stock arrives here and is sent to the other branches"
    >
      ★ Main
    </span>
  );
}
