/** Colours of the role queue boards' status cards (see StatusBoard). */
export interface StatusTone {
  ring: string;
  count: string;
  icon: string;
}

export const TONES = {
  amber: { ring: 'border-amber-400 ring-amber-200', count: 'text-amber-600', icon: 'bg-amber-100 text-amber-700' },
  blue: { ring: 'border-blue-400 ring-blue-200', count: 'text-blue-600', icon: 'bg-blue-100 text-blue-700' },
  violet: { ring: 'border-violet-400 ring-violet-200', count: 'text-violet-600', icon: 'bg-violet-100 text-violet-700' },
  slate: { ring: 'border-slate-400 ring-slate-200', count: 'text-slate-600', icon: 'bg-slate-100 text-slate-700' },
  emerald: { ring: 'border-emerald-400 ring-emerald-200', count: 'text-emerald-600', icon: 'bg-emerald-100 text-emerald-700' },
} satisfies Record<string, StatusTone>;
