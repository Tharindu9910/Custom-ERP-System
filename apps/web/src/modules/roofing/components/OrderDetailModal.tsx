import type { ReactNode } from 'react';
import { MaterialSource, PAYMENT_STATE_LABEL, formatGatePassLength, isAccessoryCategory, roofingItemTitle, type RoofingLineInput } from '@erp/shared';
import { Modal } from '@/shared/components/Modal';
import { StatusPill } from '@/shared/components/StatusPill';
import { formatDateTime, formatRs } from '@/shared/lib/format';
import { useOrderDetail, type Milestone, type OrderDetailDto } from '@/modules/orders/hooks/useOrders';
import { DesignPhoto } from './DesignPhoto';

const PAYMENT_KIND: Record<string, string> = { ADVANCE: 'Advance', PARTIAL: 'Partial', FINAL: 'Final' };
const MODE: Record<string, string> = { CASH: 'Cash', CARD: 'Card', TRANSFER: 'Transfer' };

/** Roofing order detail (prototype Order Queue detail popup). Actions come from the queue. */
export function OrderDetailModal({ orderId, onClose, actions }: { orderId: string; onClose: () => void; actions: (o: OrderDetailDto) => ReactNode }) {
  const { data: o, isLoading } = useOrderDetail(orderId);
  const cancelled = o?.status === 'VOIDED';
  const lines = o ? o.lines.filter((l) => cancelled || l.status !== 'CANCELLED') : [];

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={
        o ? (
          <span className="flex flex-wrap items-center gap-2">
            Order {o.order_number}
            <StatusPill label={o.display_label} />
            {!cancelled && <StatusPill label={PAYMENT_STATE_LABEL[o.payment_state]} />}
          </span>
        ) : (
          'Order'
        )
      }
      subtitle={o ? `${o.customer?.name ?? ''} · ${o.customer?.phone ?? ''} · Worker ${o.header.technician || '—'}` : undefined}
      footer={
        o ? (
          <div className="flex w-full items-center justify-between gap-3">
            <button onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Close
            </button>
            {actions(o)}
          </div>
        ) : undefined
      }
    >
      {isLoading || !o ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <div className="space-y-6">
          {o.milestones && <OrderTimeline m={o.milestones} />}

          {o.gate_pass && (
            <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-violet-800">Customer Supplied Material</h4>
                <span className="text-xs font-semibold text-violet-700">Gate Pass #{o.gate_pass.pass_number}</span>
              </div>
              <div className="space-y-1">
                {o.customer_materials.map((m) => (
                  <div key={m.gp_item_id} className="flex justify-between rounded-md border border-violet-100 bg-white px-3 py-1.5 text-sm">
                    <span>
                      {m.material_type}
                      {m.thickness && <span className="text-slate-500"> ({m.thickness})</span>}
                      {m.length && <span className="text-slate-500"> [{formatGatePassLength(m.length, m.length_unit)}]</span>}
                    </span>
                    <span className="font-semibold">Qty {m.quantity}</span>
                  </div>
                ))}
                {o.customer_materials.length === 0 && <p className="text-xs text-violet-700">Material was released when the order was cancelled.</p>}
              </div>
            </div>
          )}

          <div>
            <h4 className="mb-3 font-semibold text-slate-900">Items ({lines.length})</h4>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs font-medium text-slate-500">
                    <th className="px-4 py-2">Item</th>
                    <th className="px-4 py-2">Coil</th>
                    <th className="px-4 py-2">Size / Qty</th>
                    <th className="px-4 py-2">Cuts / Bends</th>
                    <th className="px-4 py-2">Source</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((l) => {
                    const spec = l.spec as unknown as RoofingLineInput & { coil_sku?: string; coil_details?: string; price_note?: string };
                    const accessory = isAccessoryCategory(spec.category);
                    return (
                      <tr key={l.line_id} className="align-top">
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            {spec.design_attachment_id && <DesignPhoto attachmentId={spec.design_attachment_id} className="h-10 w-10" />}
                            <div>
                              <div className="font-semibold">{spec.category}</div>
                              <div className="text-xs text-slate-500">{accessory ? roofingItemTitle(spec) : spec.job_type === 'CUSTOMIZED' ? 'Customized design' : spec.pattern || 'Standard'}</div>
                              {l.notes && <div className="mt-0.5 text-xs text-amber-700">{l.notes}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700">{spec.coil_sku ? `${spec.coil_sku} · ${spec.coil_details}` : '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold">
                          {accessory ? (
                            spec.quantity
                          ) : (
                            <>
                              {spec.length_ft} ft × {spec.pieces}
                              <div className="text-xs font-normal text-slate-500">{(l.quantity ?? 0).toLocaleString()} running ft</div>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{accessory ? '—' : `${spec.total_cuts || 0} / ${spec.total_bends || 0}`}</td>
                        <td className="px-4 py-3 text-xs text-slate-700">{l.material_source === MaterialSource.CUSTOMER ? 'Customer' : 'Branch'}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="font-semibold tabular-nums">{formatRs(l.line_total)}</div>
                          {spec.price_note && <div className="ml-auto max-w-[220px] text-[11px] text-slate-400">{spec.price_note}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <h4 className="mb-3 font-semibold text-slate-900">Payments ({o.payments.length})</h4>
              {o.payments.length === 0 ? (
                <p className="text-sm text-slate-500">No payments recorded.</p>
              ) : (
                <div className="space-y-2">
                  {o.payments.map((p) => (
                    <div key={p.payment_id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {PAYMENT_KIND[p.kind] ?? p.kind} · {MODE[p.mode] ?? p.mode}
                          {p.reference_number ? ` · ${p.reference_number}` : ''}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {formatDateTime(p.paid_at)} · {p.received_by_name} · {p.receipt_no}
                        </p>
                      </div>
                      <span className="font-bold tabular-nums text-emerald-700">{formatRs(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2 self-start rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <Row label="Subtotal" value={formatRs(o.subtotal)} />
              {o.discount > 0 && <Row label="Discount" value={`− ${formatRs(o.discount)}`} />}
              <div className="flex justify-between border-t border-slate-200 pt-2 font-bold">
                <span>Total</span>
                <span className="tabular-nums">{formatRs(o.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Paid</span>
                <span className="font-semibold tabular-nums text-emerald-700">{formatRs(o.paid_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Balance</span>
                <span className={`font-bold tabular-nums ${o.balance > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatRs(o.balance)}</span>
              </div>
              {cancelled && o.paid_amount > 0 && <p className="text-xs font-semibold text-amber-700">Refund {formatRs(o.paid_amount)} at the counter (no refund record is kept).</p>}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** Placed → Started → Completed → Released, or Placed → Cancelled (prototype OrderTimeline). */
function OrderTimeline({ m }: { m: NonNullable<OrderDetailDto['milestones']> }) {
  const steps: (Milestone & { label: string })[] = m.cancelled
    ? [
        { label: 'Placed', ...m.placed },
        { label: 'Cancelled', ...m.cancelled },
      ]
    : [
        { label: 'Placed', ...m.placed },
        { label: 'Started', ...m.started },
        { label: 'Completed', ...m.completed },
        { label: 'Released', ...m.released },
      ];
  return (
    <ol className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {steps.map((s) => {
        const done = !!s.at;
        const cancelled = s.label === 'Cancelled';
        return (
          <li
            key={s.label}
            className={`rounded-lg border p-3 ${cancelled ? 'border-red-200 bg-red-50' : done ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}
          >
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${cancelled ? 'bg-red-500' : done ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span className={`text-xs font-bold uppercase tracking-wider ${done ? 'text-slate-800' : 'text-slate-400'}`}>{s.label}</span>
            </div>
            {done ? (
              <>
                <p className="mt-1 text-[11px] text-slate-600">{formatDateTime(s.at!)}</p>
                {s.by && <p className="text-[11px] text-slate-500">by {s.by}</p>}
                {s.note && <p className="mt-0.5 text-[11px] text-slate-700">{s.note}</p>}
              </>
            ) : (
              <p className="mt-1 text-[11px] text-slate-400">Pending</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
