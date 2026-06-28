import { cn } from '@/shared/lib/utils';

const COLOR_MAP: Record<string, string> = {
  // Job Card
  DRAFT: 'bg-gray-100 text-gray-700',
  IN_QUEUE: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  CANCELLATION_PENDING: 'bg-orange-100 text-orange-700',
  CLOSED: 'bg-green-100 text-green-700',
  VOIDED: 'bg-red-100 text-red-600',
  // Work Order
  PENDING: 'bg-gray-100 text-gray-600',
  ASSIGNED: 'bg-sky-100 text-sky-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-600',
  // Goods Issue
  ISSUED: 'bg-purple-100 text-purple-700',
  CONFIRMED: 'bg-emerald-100 text-emerald-700',
  // Conflict
  RESOLVED: 'bg-green-100 text-green-700',
  DISMISSED: 'bg-gray-100 text-gray-400',
};

const LABEL_MAP: Record<string, string> = {
  IN_QUEUE: 'In Queue',
  IN_PROGRESS: 'In Progress',
  CANCELLATION_PENDING: 'Cancel Pending',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const colors = COLOR_MAP[status] ?? 'bg-gray-100 text-gray-600';
  const label = LABEL_MAP[status] ?? status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        colors,
        className,
      )}
    >
      {label}
    </span>
  );
}