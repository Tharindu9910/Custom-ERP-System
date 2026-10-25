// Colour helpers ported from the prototype (utils/scan.ts) so pills and swatches match.

const PALETTE = ['#0033A0', '#0f766e', '#b45309', '#6d28d9', '#be123c', '#0369a1', '#3f6212', '#9f1239', '#4338ca'];

export function accentFor(label: string): string {
  const key = (label || '').trim().toLowerCase();
  if (!key) return '#94a3b8';
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

const NAMED_COLORS: Record<string, string> = {
  blue: '#2563eb', red: '#dc2626', green: '#16a34a', white: '#f8fafc', silver: '#cbd5e1', grey: '#6b7280',
  gray: '#6b7280', 'dark grey': '#374151', 'off white': '#f5f5f4', 'chocolate brown': '#5c3317', brown: '#92400e',
  galvanized: '#9ca3af', yellow: '#eab308', orange: '#ea580c', black: '#111827', gold: '#ca8a04', maroon: '#7f1d1d',
  zincalume: '#a1a1aa', 'charcoal grey': '#334155',
};

/** Swatch colour for a material colour name (or coil colour). */
export function swatchFor(color?: string | null): string | null {
  if (!color) return null;
  const key = color.trim().toLowerCase();
  if (NAMED_COLORS[key]) return NAMED_COLORS[key];
  const match = Object.keys(NAMED_COLORS).find((name) => key.includes(name));
  return match ? NAMED_COLORS[match] : accentFor(color);
}

/** Text/background colour for a status label, by meaning. */
export function statusTone(status: string): string {
  const v = (status || '').toLowerCase();
  if (v.includes('released')) return '#0f766e';
  if (v.includes('cancel') || v.includes('void')) return '#b91c1c';
  if (v.includes('ready')) return '#047857';
  if (v.includes('placed') || v.includes('awaiting')) return '#b45309';
  if (v.includes('unpaid') || v.includes('critical') || v.includes('reject') || v.includes('out of')) return '#b91c1c';
  if (v.includes('progress') || v.includes('partial') || v.includes('advance') || v.includes('sent')) return '#1d4ed8';
  if (v.includes('complete') || v.includes('closed') || v.includes('fully') || v.includes('healthy') || v.includes('received')) return '#047857';
  if (v.includes('queue') || v.includes('pending') || v.includes('open') || v.includes('low') || v.includes('waiting')) return '#b45309';
  if (v.includes('reserv')) return '#6d28d9';
  if (v.includes('assign')) return '#b45309';
  return '#475569';
}
