import type { GatePassDto } from '../hooks/useGatePasses';

const STYLE: Record<string, string> = {
  OPEN: 'bg-slate-100 border-slate-200 text-slate-700',
  RESERVED: 'bg-purple-50 border-purple-200 text-purple-800',
  PARTIALLY_ASSIGNED: 'bg-blue-50 border-blue-200 text-[#0033A0]',
  FULLY_ASSIGNED: 'bg-amber-50 border-amber-200 text-amber-800',
  CLOSED: 'bg-emerald-50 border-emerald-200 text-emerald-800',
};

const LABEL: Record<string, string> = {
  OPEN: 'Open',
  RESERVED: 'Reserved',
  PARTIALLY_ASSIGNED: 'Partially Assigned',
  FULLY_ASSIGNED: 'Fully Assigned',
  CLOSED: 'Closed',
};

const indicator = (i: 'PARTIAL' | 'FULL' | null) => (i === 'FULL' ? 'Full' : i === 'PARTIAL' ? 'Partial' : null);

/** Prototype gate pass status pill, including the reservation indicator. */
export function GatePassStatusBadge({ summary, compact }: { summary: GatePassDto['summary']; compact?: boolean }) {
  const pill = (text: string) => (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STYLE[summary.status]}`}>{text}</span>
  );
  const ind = indicator(summary.reservation_indicator);
  if (summary.status === 'RESERVED') return pill(compact ? 'Reserved' : `Reserved (${ind ?? 'Draft'})`);
  if (summary.status === 'PARTIALLY_ASSIGNED' && ind && !compact) {
    return (
      <div className="space-y-1">
        {pill(LABEL.PARTIALLY_ASSIGNED)}
        <span className="block text-[10px] font-semibold text-purple-700">+ {ind} Reserved</span>
      </div>
    );
  }
  return pill(LABEL[summary.status]);
}
