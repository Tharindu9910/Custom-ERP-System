import { Modal } from '@/shared/components/Modal';
import { IdChip } from '@/shared/components/Marks';
import { formatDateTime, formatRs } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { useOrderDetail } from '@/modules/orders/hooks/useOrders';

const MODE_LABEL: Record<string, string> = { CASH: 'Cash', CARD: 'Card', TRANSFER: 'Bank Transfer' };

const STATUS_TONE: Record<string, string> = {
  AWAITING_PAYMENT: 'bg-amber-50 text-amber-700 ring-amber-200',
  PAID: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CANCELLED: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const qty = (n: number | null) => (n === null ? '–' : Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, ''));

/** Hardware order details: itemised lines, totals, every payment and where it was taken. */
export function HardwareSaleModal({ orderId, onClose, footer }: { orderId: string; onClose: () => void; footer?: React.ReactNode }) {
  const { data: o, isLoading } = useOrderDetail(orderId);

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={o ? `Hardware order · ${o.order_number}` : 'Hardware order'}
      subtitle={o ? `Placed ${formatDateTime(o.created_at)}${o.created_by_name ? ` by ${o.created_by_name}` : ''}` : undefined}
      footer={
        footer ?? (
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
        )
      }
    >
      {isLoading || !o ? (
        <p className="py-12 text-center text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <IdChip>{o.order_number}</IdChip>
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold ring-1', STATUS_TONE[o.display_status])}>{o.display_label}</span>
            {o.origin_branch_name && (
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
                Placed at {o.origin_branch_name}
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer</div>
              <div className="font-semibold text-slate-900">{o.customer?.name ?? 'Walk-in'}</div>
              {o.customer && <div className="font-mono text-xs text-slate-500">{o.customer.phone}</div>}
            </div>
            {o.header.notes && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Note</div>
                <div className="text-sm text-slate-800">{o.header.notes}</div>
              </div>
            )}
            {o.header.cancel_reason && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Cancelled</div>
                <div className="text-sm text-slate-800">{o.header.cancel_reason}</div>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Item</th>
                  <th className="px-4 py-2 text-right">Qty</th>
                  <th className="px-4 py-2 text-right">Unit price</th>
                  <th className="px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {o.lines.map((l) => (
                  <tr key={l.line_id}>
                    <td className="px-4 py-2">
                      <div className="font-semibold text-slate-900">{l.item_name}</div>
                      <div className="font-mono text-xs text-slate-400">{l.item_sku}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      {qty(l.quantity)} <span className="text-xs text-slate-400">{l.item_unit}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-slate-600">{formatRs(l.unit_price)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-semibold">{formatRs(l.line_total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 text-sm">
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-right font-bold text-slate-700">
                    Total
                  </td>
                  <td className="px-4 py-2 text-right font-bold text-slate-900">{formatRs(o.total)}</td>
                </tr>
                <tr>
                  <td colSpan={3} className="px-4 py-1 text-right text-slate-500">
                    Paid
                  </td>
                  <td className="px-4 py-1 text-right text-slate-700">{formatRs(o.paid_amount)}</td>
                </tr>
                {o.balance > 0 && o.display_status === 'AWAITING_PAYMENT' && (
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-right font-bold text-amber-700">
                      Balance due
                    </td>
                    <td className="px-4 py-2 text-right font-bold text-amber-700">{formatRs(o.balance)}</td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>

          {o.payments.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Payments</h3>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
                {o.payments.map((p) => (
                  <li key={p.payment_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                    <div>
                      <span className="font-mono text-xs text-slate-500">{p.receipt_no}</span>
                      <span className="ml-2 font-semibold text-slate-800">{MODE_LABEL[p.mode] ?? p.mode}</span>
                      {p.reference_number && <span className="ml-2 text-xs text-slate-500">Ref {p.reference_number}</span>}
                      <div className="text-xs text-slate-400">
                        {formatDateTime(p.paid_at)}
                        {p.received_by_name ? ` · ${p.received_by_name}` : ''}
                        {p.received_branch_name ? ` · ${p.received_branch_name}` : ''}
                      </div>
                    </div>
                    <span className="font-bold text-slate-900">{formatRs(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">History</h3>
            <ul className="space-y-1.5 text-sm">
              {o.history.map((h) => (
                <li key={h.history_id} className="flex gap-3">
                  <span className="w-36 shrink-0 text-xs text-slate-400">{formatDateTime(h.created_at)}</span>
                  <span className="text-slate-700">
                    {h.note ?? `${h.from_status ?? '—'} → ${h.to_status}`}
                    {h.actor_name && <span className="text-slate-400"> · {h.actor_name}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}
