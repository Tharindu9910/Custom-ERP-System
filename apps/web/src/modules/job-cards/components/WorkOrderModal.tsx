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
import { thicknessLabel } from '../lib/customer-material';
import { CompleteJobDialog, StartJobDialog } from './JobCardMoveDialogs';

// Sub-job status pill and its action button share one size so the rows line up
const LINE_CHIP = 'inline-flex h-8 w-28 items-center justify-center gap-1 whitespace-nowrap rounded-md text-xs font-semibold';

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
 * Work order (job card) popup from the Workshop Queue: material details, each sub-job
 * with Start / Complete, and the card's own move (Start Job / Mark Completed —
 * Docs/decisions/0005). A sub-job starts only once the card is Ongoing; Start
 * deducts branch material (BR10) and may ask for a stock override. `readOnly` (opened
 * from History) shows the card with no actions, except Edit / Void on an unpaid draft.
 */
export function WorkOrderModal({
  orderId,
  onClose,
  onEdit,
  onMoved,
  readOnly = false,
}: {
  orderId: string;
  onClose: () => void;
  onEdit?: () => void;
  /** The card moved to another column; the modal closes and the board shows the message */
  onMoved?: (message: string) => void;
  readOnly?: boolean;
}) {
  const { data: order, isLoading } = useOrderDetail(orderId);
  const [moving, setMoving] = useState<'start' | 'complete' | null>(null);
  const action = useLineAction();
  const [error, setError] = useState<string | null>(null);
  const [override, setOverride] = useState<{ line: OrderLineDto; details: StockShortageDetails } | null>(null);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const voidCard = useVoidJobCard();
  const { can } = usePermission();
  // Drafts left the Workshop Queue, so History is where the supervisor edits or voids them
  const canTransact = useCanTransact() && (!readOnly || order?.status === OrderStatus.DRAFT);
  const [voidReason, setVoidReason] = useState<string | null>(null);
  // BR14: only an unpaid draft can be voided by the supervisor/chief
  const canVoid = canTransact && !!order && order.status === OrderStatus.DRAFT && order.paid_amount === 0 && can('cancel', 'job_card_draft');
  // BR05: work starts only once the cashier has taken the minimum advance
  const awaitingAdvance = order?.status === OrderStatus.DRAFT;
  const canStart = canTransact && can('update', 'job_card_status');
  const canComplete = canTransact && can('complete', 'work_order');
  const canEdit = canTransact && can('create', 'job_card');
  const cardStarted = order?.status === OrderStatus.IN_PROGRESS;
  const notStarted = order?.lines.filter((l) => l.status === LineStatus.PENDING || l.status === LineStatus.ASSIGNED).length ?? 0;
  const moved = (msg: string) => {
    setMoving(null);
    onClose();
    onMoved?.(msg);
  };

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
            {canStart && order?.status === OrderStatus.IN_QUEUE && (
              <button onClick={() => setMoving('start')} className="btn-primary">
                <Icon name="play" className="h-4 w-4" /> Start Job
              </button>
            )}
            {canComplete && cardStarted && (
              <button
                onClick={() => setMoving('complete')}
                disabled={notStarted > 0}
                title={notStarted > 0 ? 'Start every sub-job first' : undefined}
                className="btn-primary bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
              >
                <Icon name="checkCircle" className="h-4 w-4" /> Mark Finished
              </button>
            )}
            {canEdit && order?.can_edit && onEdit && (
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
            {order.status === OrderStatus.IN_QUEUE && canStart && (
              <Notice tone="info">Press Start Job to move this card to Ongoing. Sub-jobs left out can be started here afterwards.</Notice>
            )}
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">
                    {order.customer?.name ?? '—'}
                    {order.customer?.phone && <span className="ml-2 font-normal text-gray-500">{order.customer.phone}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {formatDate(order.header.job_date ?? order.created_at)}
                    {order.created_by_name && ` · Created by ${order.created_by_name}`}
                  </p>
                </div>
                <span className="whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{order.display_label}</span>
              </div>
              <div className="grid grid-cols-3 divide-x rounded-lg border border-gray-200 text-sm">
                <Field label="Total" value={formatRs(order.total)} />
                <div className="px-3 py-2">
                  <p className="text-xs text-gray-500">{PAYMENT_STATE_LABEL[order.payment_state]}</p>
                  <p className={`font-semibold ${order.payment_state === 'UNPAID' ? 'text-red-600' : 'text-green-600'}`}>{formatRs(order.paid_amount)}</p>
                </div>
                <Field label="Balance" value={formatRs(order.balance)} />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <h4 className="font-semibold text-gray-900">Materials</h4>
                <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{source}</span>
                {[...new Set(order.customer_materials.map((m) => m.pass_number))].map((n) => (
                  <span key={n} className="rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                    Gate pass {n}
                  </span>
                ))}
              </div>
              {branchMaterials.length + order.customer_materials.length > 0 ? (
                <ul className="divide-y rounded-lg border border-gray-200 text-sm">
                  {branchMaterials.map((l) => (
                    <li key={l.line_id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="text-gray-900">
                        {l.item_name ?? `${(l.spec as Record<string, string>).material_type} (${(l.spec as Record<string, string>).thickness})`}{' '}
                        <span className="text-xs text-gray-400">Branch</span>
                      </span>
                      <span className="whitespace-nowrap text-gray-600">
                        {l.quantity ?? '-'} {l.item_unit ?? ''}
                      </span>
                    </li>
                  ))}
                  {order.customer_materials.map((m) => (
                    <li key={`${m.gp_item_id}:${m.line_id ?? ''}`} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="text-gray-900">
                        {m.material_type} {m.thickness ? `(${m.thickness})` : ''} {m.length ? `[${formatGatePassLength(m.length, m.length_unit)}]` : ''}{' '}
                        {m.color ? `{Color: ${m.color}}` : ''} <span className="text-xs text-gray-400">Customer · {m.pass_number}</span>
                        {m.line_id && <span className="text-xs text-gray-400"> · for {active.find((l) => l.line_id === m.line_id)?.line_number ?? 'a removed sub-job'}</span>}
                      </span>
                      <span className="whitespace-nowrap text-gray-600">{m.quantity}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No materials added.</p>
              )}
            </div>

            <div>
              <h4 className="mb-2 font-semibold text-gray-900">Sub Jobs ({active.length})</h4>
              <ul className="divide-y rounded-lg border border-gray-200">
                {active.map((l) => (
                  <li key={l.line_id} className="px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-gray-900">
                        {l.line_number} <span className="text-xs font-normal text-gray-400">· {LINE_TYPE_LABEL[l.line_type] ?? l.line_type}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="whitespace-nowrap text-sm font-semibold text-gray-700">{formatRs(l.line_total)}</span>
                        <span className={`${LINE_CHIP} ${statusPill(l.status)}`}>{l.status_label}</span>
                        {canStart && cardStarted && l.status === LineStatus.ASSIGNED && (
                          <button
                            disabled={action.isPending}
                            onClick={() => void run(l, 'start')}
                            className={`${LINE_CHIP} bg-blue-600 text-white shadow-sm hover:bg-blue-700 disabled:opacity-50`}
                          >
                            <Icon name="play" className="h-3.5 w-3.5" /> Start
                          </button>
                        )}
                        {canComplete && cardStarted && l.status === LineStatus.IN_PROGRESS && (
                          <button
                            disabled={action.isPending}
                            onClick={() => void run(l, 'complete')}
                            className={`${LINE_CHIP} bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50`}
                          >
                            <Icon name="checkCircle" className="h-3.5 w-3.5" /> Finish
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{l.is_customized ? <span className="font-medium text-purple-700">Customized Work</span> : lineSummary(l)}</p>
                    {l.customer_material && (
                      <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-orange-800">
                        <Icon name="packageOpen" className="h-4 w-4 shrink-0" />
                        Customer's {l.customer_material.material_type}
                        {l.customer_material.thickness ? ` (${thicknessLabel(l.customer_material.thickness)})` : ''} from {l.customer_material.pass_number} ×{' '}
                        {l.customer_material.quantity}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-gray-400">
                      {l.workers.length > 0 && `Workers: ${l.workers.map((w) => w.full_name).join(', ')}`}
                      {l.started_at && ` · Started ${formatDateTime(l.started_at)} by ${l.started_by}`}
                      {l.inspected_by && ` · Inspected by ${l.inspected_by}`}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            {order.history.length > 0 && (
              <div>
                <h4 className="mb-2 font-semibold text-gray-900">History</h4>
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
      {moving === 'start' && <StartJobDialog orderId={orderId} onClose={() => setMoving(null)} onDone={moved} />}
      {moving === 'complete' && <CompleteJobDialog orderId={orderId} onClose={() => setMoving(null)} onDone={moved} />}
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-semibold text-gray-900">{value}</p>
    </div>
  );
}
