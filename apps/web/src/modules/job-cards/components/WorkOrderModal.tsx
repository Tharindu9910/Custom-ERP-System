import { useState } from 'react';
import { LineStatus, OrderStatus, PAYMENT_STATE_LABEL, formatGatePassLength, type StockOverride } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { Modal } from '@/shared/components/Modal';
import { Notice } from '@/shared/components/Notice';
import { StockOverrideDialog, type StockShortageDetails } from '@/shared/components/StockOverrideDialog';
import { apiError } from '@/shared/api/errors';
import { formatDate, formatDateTime, formatRs } from '@/shared/lib/format';
import { usePermission } from '@/shared/hooks/usePermission';
import { useCanTransact } from '@/shared/hooks/useCanTransact';
import { useLineAction, useOrderDetail, useVoidJobCard, type OrderLineDto } from '@/modules/orders/hooks/useOrders';

const LINE_TYPE_LABEL: Record<string, string> = { CUT_BEND: 'Cut / Bend', COIL_CUTTING: 'Coil Cutting', ROLLING: 'Rolling' };

const statusPill = (s: LineStatus) =>
  s === LineStatus.IN_PROGRESS ? 'bg-blue-100 text-blue-800' : s === LineStatus.COMPLETED ? 'bg-green-100 text-green-800' : s === LineStatus.CANCELLED ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-800';

/** Spec summary for a sub-job (prototype modal row). */
function lineSummary(l: OrderLineDto): string {
  const s = l.spec as Record<string, unknown>;
  if (l.is_customized) return 'Customized Work';
  if (l.line_type === 'CUT_BEND') return `${s.material_type ?? ''} ${s.thickness ?? ''} | Qty: ${s.material_quantity ?? 0} | Cut: ${s.cut_count ?? 0} | Bend: ${s.bend_count ?? 0}`;
  if (l.line_type === 'ROLLING') return `Rolling (${s.work_type}) ${s.rolling_type} ${s.size} | Qty: ${s.quantity ?? 0}`;
  return `Coil: ${s.coil_material} - ${s.amount_range} Ton`;
}

/**
 * Work order (job card) popup from the Workshop Queue: material details and each
 * sub-job with Start / Complete. Start deducts branch material (BR10) and may ask
 * for a stock override. `readOnly` (opened from History) shows the card with no actions.
 */
export function WorkOrderModal({ orderId, onClose, onEdit, readOnly = false }: { orderId: string; onClose: () => void; onEdit?: () => void; readOnly?: boolean }) {
  const { data: order, isLoading } = useOrderDetail(orderId);
  const action = useLineAction();
  const [error, setError] = useState<string | null>(null);
  const [override, setOverride] = useState<{ line: OrderLineDto; details: StockShortageDetails } | null>(null);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const voidCard = useVoidJobCard();
  const { can } = usePermission();
  const canTransact = useCanTransact() && !readOnly;
  const [voidReason, setVoidReason] = useState<string | null>(null);
  // BR14: only an unpaid draft can be voided by the supervisor/chief
  const canVoid = canTransact && !!order && order.status === OrderStatus.DRAFT && order.paid_amount === 0 && can('cancel', 'job_card_draft');
  // BR05: work starts only once the cashier has taken the minimum advance
  const awaitingAdvance = order?.status === OrderStatus.DRAFT;

  const confirmVoid = async () => {
    if (!order || !voidReason || voidReason.trim().length < 3) return;
    setError(null);
    try {
      await voidCard.mutateAsync({ orderId: order.order_id, reason: voidReason.trim() });
      onClose();
    } catch (e) {
      setError(apiError(e).message);
    }
  };

  const run = async (line: OrderLineDto, kind: 'start' | 'complete', ov?: StockOverride) => {
    setError(null);
    setOverrideError(null);
    try {
      await action.mutateAsync({ lineId: line.line_id, action: kind, version: line.version, override: ov });
      setOverride(null);
    } catch (e) {
      const info = apiError(e);
      if (info.code === 'STK_001') {
        setOverride({ line, details: info.details as StockShortageDetails });
      } else if (ov) {
        setOverrideError(info.message);
      } else {
        setError(info.message);
      }
    }
  };

  const active = order?.lines.filter((l) => l.status !== LineStatus.CANCELLED) ?? [];
  const branchMaterials = active.filter((l) => l.material_source === 'BRANCH' && l.line_type === 'CUT_BEND' && !l.is_customized);
  const hasBranch = active.some((l) => l.material_source === 'BRANCH');
  const hasCustomer = active.some((l) => l.material_source === 'CUSTOMER');
  const source = hasBranch && hasCustomer ? 'Combined' : hasCustomer ? 'Customer' : 'Branch';

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={order ? `Main Job Card: ${order.order_number}` : 'Main Job Card'}
        footer={
          <>
            {canVoid && voidReason === null && (
              <button onClick={() => setVoidReason('')} className="mr-auto rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                Void job card
              </button>
            )}
            {canVoid && voidReason !== null && (
              <div className="mr-auto flex items-center gap-2">
                <input
                  autoFocus
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="Reason for voiding"
                  className="rounded-md border border-red-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                />
                <button
                  disabled={voidReason.trim().length < 3 || voidCard.isPending}
                  onClick={() => void confirmVoid()}
                  className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Confirm void
                </button>
                <button onClick={() => setVoidReason(null)} className="text-sm text-gray-500 hover:text-gray-800">
                  Keep
                </button>
              </div>
            )}
            {canTransact && order?.can_edit && onEdit && (
              <button onClick={onEdit} className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100">
                Edit
              </button>
            )}
            <button onClick={onClose} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Close
            </button>
          </>
        }
      >
        {isLoading || !order ? (
          <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
        ) : (
          <div className="space-y-6">
            {error && <Notice tone="error">{error}</Notice>}
            {awaitingAdvance && canTransact && (
              <Notice tone="info">Waiting for the minimum advance at the cashier. Work can start once it is paid.</Notice>
            )}
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-5">
              <Field label="Customer" value={order.customer?.name ?? '—'} />
              <Field label="Phone" value={order.customer?.phone ?? '—'} />
              <Field label="Date" value={formatDate(order.header.job_date ?? order.created_at)} />
              <div>
                <p className="font-medium text-gray-500">Payment</p>
                <p className={`font-semibold ${order.payment_state === 'UNPAID' ? 'text-red-600' : 'text-green-600'}`}>
                  {PAYMENT_STATE_LABEL[order.payment_state]}
                  {order.paid_amount > 0 ? ` (${formatRs(order.paid_amount)})` : ''}
                </p>
              </div>
              <Field label="Overall Status" value={order.display_label} bold />
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-5">
              <Field label="Total" value={formatRs(order.total)} />
              <Field label="Balance" value={formatRs(order.balance)} />
              <Field label="Workers" value={order.workers.map((w) => w.full_name).join(', ') || '—'} />
              <Field label="Created by" value={order.created_by_name ?? '—'} />
            </div>

            <div>
              <h4 className="mb-3 border-b pb-2 font-semibold text-gray-900">Material Details</h4>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">Material Source</span>
                  <span className="text-sm font-bold text-blue-700">{source}</span>
                </div>
                {order.gate_pass && (
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">Gate Pass ID</span>
                    <span className="text-sm font-bold text-green-700">{order.gate_pass.pass_number}</span>
                  </div>
                )}
                {branchMaterials.length + order.customer_materials.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {branchMaterials.map((l) => (
                      <div key={l.line_id} className="flex items-center justify-between rounded border border-gray-200 bg-white p-2 text-sm">
                        <div>
                          <span className="font-medium text-gray-900">{l.item_name ?? `${(l.spec as Record<string, string>).material_type} (${(l.spec as Record<string, string>).thickness})`}</span>{' '}
                          <span className="text-gray-500">(Branch)</span>
                        </div>
                        <span className="font-medium text-gray-700">
                          Qty: {l.quantity ?? '-'} {l.item_unit ?? ''}
                        </span>
                      </div>
                    ))}
                    {order.customer_materials.map((m) => (
                      <div key={m.gp_item_id} className="flex items-center justify-between rounded border border-gray-200 bg-white p-2 text-sm">
                        <div>
                          <span className="font-medium text-gray-900">
                            {m.material_type} {m.thickness ? `(${m.thickness})` : ''} {m.length ? `[${formatGatePassLength(m.length, m.length_unit)}]` : ''}{' '}
                            {m.color ? `{Color: ${m.color}}` : ''}
                          </span>{' '}
                          <span className="text-gray-500">(Customer)</span>
                        </div>
                        <span className="font-medium text-gray-700">Qty: {m.quantity}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-gray-500">No materials added.</p>
                )}
              </div>
            </div>

            <div>
              <h4 className="mb-3 border-b pb-2 font-semibold text-gray-900">Sub Jobs ({active.length})</h4>
              <div className="space-y-3">
                {active.map((l) => (
                  <div key={l.line_id} className="flex flex-col items-start justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4 md:flex-row md:items-center">
                    <div>
                      <div className="flex items-center gap-2 font-semibold text-gray-900">
                        {l.line_number} <span className="text-xs font-normal text-gray-400">| {LINE_TYPE_LABEL[l.line_type] ?? l.line_type}</span>
                      </div>
                      <div className="mt-1 text-sm text-gray-600">
                        {l.is_customized ? <span className="font-medium text-purple-700">Customized Work</span> : lineSummary(l)}
                        {' • '}Worker: {l.workers.map((w) => w.full_name).join(', ')}
                      </div>
                      {(l.started_at || l.inspected_by) && (
                        <div className="mt-1 text-xs text-gray-400">
                          {l.started_at && `Started ${formatDateTime(l.started_at)} by ${l.started_by}`}
                          {l.inspected_by && ` · Inspected by ${l.inspected_by}`}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-gray-700">{formatRs(l.line_total)}</span>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold leading-5 ${statusPill(l.status)}`}>{l.status_label}</span>
                      {canTransact && !awaitingAdvance && l.status === LineStatus.ASSIGNED && (
                        <button
                          disabled={action.isPending}
                          onClick={() => void run(l, 'start')}
                          className="inline-flex items-center rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-900 disabled:opacity-50"
                        >
                          <Icon name="play" className="mr-1 h-3 w-3" /> Start
                        </button>
                      )}
                      {canTransact && l.status === LineStatus.IN_PROGRESS && (
                        <button
                          disabled={action.isPending}
                          onClick={() => void run(l, 'complete')}
                          className="inline-flex items-center rounded bg-green-50 px-2 py-1 text-xs font-medium text-green-600 hover:text-green-900 disabled:opacity-50"
                        >
                          <Icon name="checkCircle" className="mr-1 h-3 w-3" /> Complete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {order.history.length > 0 && (
              <div>
                <h4 className="mb-3 border-b pb-2 font-semibold text-gray-900">History</h4>
                <ol className="space-y-1.5 text-xs text-gray-600">
                  {order.history.map((h) => (
                    <li key={h.history_id} className="flex gap-2">
                      <span className="w-36 shrink-0 text-gray-400">{formatDateTime(h.created_at)}</span>
                      <span>
                        {h.line_number && <strong className="text-gray-800">{h.line_number}: </strong>}
                        {h.event_type === 'INSPECTION'
                          ? `Inspected (${h.result})`
                          : h.event_type === 'NOTE'
                            ? h.note
                            : `${h.from_status ?? 'New'} → ${h.to_status}`}
                        {h.event_type === 'STATUS_CHANGE' && h.note ? ` — ${h.note}` : ''}
                        {h.actor_name && <span className="text-gray-400"> · {h.actor_name}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </Modal>

      {override && (
        <StockOverrideDialog
          details={override.details}
          pending={action.isPending}
          error={overrideError}
          onConfirm={(ov) => void run(override.line, 'start', ov)}
          onClose={() => setOverride(null)}
        />
      )}
    </>
  );
}

function Field({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <p className="font-medium text-gray-500">{label}</p>
      <p className={`text-gray-900 ${bold ? 'font-semibold' : ''}`}>{value}</p>
    </div>
  );
}
