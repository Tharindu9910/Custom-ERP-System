import type { ReactNode } from 'react';

/** Building blocks shared by the detail popups (gate pass, job card, orders, inventory). */

/** Section heading with its count in a chip ("Materials 3"). */
export function SectionTitle({ title, count, children }: { title: string; count?: number; children?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
      {count !== undefined && <span className="spec-chip">{count}</span>}
      {children}
    </div>
  );
}

/** Row of headline numbers (Received / Used / Available, Total / Paid / Balance). */
export function StatStrip({ children }: { children: ReactNode }) {
  return <div className="grid auto-cols-fr grid-flow-col divide-x divide-slate-200 rounded-xl border border-slate-200 bg-slate-50/60">{children}</div>;
}

export function Stat({ label, value, tone = 'text-slate-900' }: { label: ReactNode; value: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0 px-3 py-3 sm:px-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
