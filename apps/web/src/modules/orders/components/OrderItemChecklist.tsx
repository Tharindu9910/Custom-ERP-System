import { isAccessoryCategory, roofingItemTitle, type RoofingLineInput } from '@erp/shared';
import { formatDate, formatRs } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { thicknessLabel } from '@/modules/gate-passes/lib/customer-material';
import { LINE_TYPE_LABEL, lineSummary } from '@/modules/job-cards/lib/line-summary';
import type { CashierQueueRow, OrderDetailDto, OrderLineDto } from '../hooks/useOrders';

type RoofingSpec = RoofingLineInput & {
  coil_sku?: string;
  coil_details?: string;
  price_note?: string;
};

/** Title, spec lines and quantity for one order line, job card or roofing. */
function describeLine(l: OrderLineDto, roofing: boolean): { title: string; kind: string; details: string[]; qty: string } {
  const unit = l.item_unit ? ` ${l.item_unit}` : '';
  if (!roofing) {
    const details = [lineSummary(l)];
    if (l.is_customized && l.work_info) details.push(l.work_info);
    if (l.item_name) details.push(l.item_name);
    return {
      title: l.line_number,
      kind: LINE_TYPE_LABEL[l.line_type] ?? l.line_type,
      details,
      qty: l.quantity != null ? `${l.quantity}${unit}` : '—',
    };
  }
  const s = l.spec as unknown as RoofingSpec;
  const accessory = isAccessoryCategory(s.category);
  const details = [roofingItemTitle(s)];
  if (!accessory) details.push(`${s.length_ft} ft × ${s.pieces} · Cuts ${s.total_cuts || 0} / Bends ${s.total_bends || 0}`);
  if (s.coil_sku) details.push(`Coil ${s.coil_sku}${s.coil_details ? ` · ${s.coil_details}` : ''}`);
  if (s.price_note) details.push(s.price_note);
  return {
    title: l.line_number,
    kind: s.category,
    details,
    qty: accessory ? String(s.quantity ?? l.quantity ?? '—') : `${(l.quantity ?? 0).toLocaleString()} running ft`,
  };
}

/** Customer and order header above the item list (cashier checkout and supervisor hand-over). */
export function OrderCheckHeader({
  order,
  row,
  roofing,
}: {
  order: OrderDetailDto;
  row: Pick<CashierQueueRow, 'customer_name' | 'customer_phone'>;
  roofing: boolean;
}) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
      <div>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer &amp; Contact</p>
        <p className="text-[15px] font-bold text-slate-900">{order.customer?.name ?? row.customer_name ?? 'Walk-in'}</p>
        <p className="mt-0.5 font-mono text-sm text-slate-500">{order.customer?.phone ?? row.customer_phone}</p>
      </div>
      <div>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Order</p>
        <p className="text-sm font-semibold text-slate-900">
          {roofing ? 'Roofing order' : 'Job card'} · {order.display_label}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {formatDate(order.header.job_date ?? order.header.order_date ?? order.created_at)}
          {order.created_by_name && ` · Created by ${order.created_by_name}`}
        </p>
      </div>
    </div>
  );
}

/**
 * Every item in full (spec, material source, qty, unit price, amount) as a row to tick off
 * one by one. The ticks live only in the parent's state; they are not saved.
 */
export function OrderItemChecklist({
  lines,
  roofing,
  checked,
  onChange,
}: {
  lines: OrderLineDto[];
  roofing: boolean;
  checked: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const allChecked = lines.every((l) => checked.has(l.line_id));
  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Item Breakdown</p>
        <div className="flex items-center gap-3">
          <span className={cn('rounded px-2 py-0.5 text-[11px] font-bold', allChecked ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>
            {checked.size} of {lines.length} checked
          </span>
          <button
            type="button"
            onClick={() => onChange(allChecked ? new Set() : new Set(lines.map((l) => l.line_id)))}
            className="text-xs font-semibold text-[#0033A0] hover:underline"
          >
            {allChecked ? 'Uncheck all' : 'Check all'}
          </button>
        </div>
      </div>

      <ul className="space-y-3">
        {lines.map((l) => {
          const d = describeLine(l, roofing);
          const on = checked.has(l.line_id);
          return (
            <li key={l.line_id}>
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition-colors',
                  on ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-white hover:bg-slate-50',
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(l.line_id)}
                  className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 accent-emerald-600"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tabular-nums text-slate-400">{d.title}</span>
                    <span className="text-sm font-bold text-slate-900">{d.kind}</span>
                    {l.is_customized && (
                      <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-purple-700">Custom price</span>
                    )}
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">{l.status_label}</span>
                  </div>
                  {d.details.map((t, i) => (
                    <p key={i} className="mt-1 text-sm text-slate-600">
                      {t}
                    </p>
                  ))}
                  <p className="mt-1 text-xs text-slate-500">
                    {l.material_source === 'CUSTOMER' ? 'Customer material' : 'Branch material'}
                    {l.customer_material &&
                      ` · ${l.customer_material.material_type}${l.customer_material.thickness ? ` (${thicknessLabel(l.customer_material.thickness)})` : ''} from ${l.customer_material.pass_number} × ${l.customer_material.quantity}`}
                  </p>
                  {l.notes && <p className="mt-1 text-xs text-amber-700">{l.notes}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-slate-500">Qty</p>
                  <p className="text-sm font-bold tabular-nums text-slate-900">{d.qty}</p>
                  {l.unit_price > 0 && <p className="mt-1 text-xs tabular-nums text-slate-500">@ {formatRs(l.unit_price)}</p>}
                  <p className="mt-1 text-base font-bold tabular-nums text-slate-900">{formatRs(l.line_total)}</p>
                </div>
              </label>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function SummaryRow({ label, value, tone = 'text-slate-900' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={cn('font-bold tabular-nums', tone)}>{value}</span>
    </div>
  );
}

export function SummaryTile({ label, value, tone = 'text-slate-900' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
      <p className="mb-0.5 text-[9px] font-bold uppercase text-slate-400">{label}</p>
      <p className={cn('text-sm font-bold tabular-nums', tone)}>{value}</p>
    </div>
  );
}
