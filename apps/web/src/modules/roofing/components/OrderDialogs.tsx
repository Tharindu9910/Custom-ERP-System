import { useRef, useState } from 'react';
import { DEFAULT_BRANCH_SETTINGS } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { Modal } from '@/shared/components/Modal';
import { Notice } from '@/shared/components/Notice';
import { PaymentCapture } from '@/shared/components/PaymentCapture';
import { apiError, newRequestId } from '@/shared/api/errors';
import { useBranchContext } from '@/shared/hooks/useBranchContext';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import { formatRs } from '@/shared/lib/format';
import { emptyPaymentDraft, toPayment, validatePaymentDraft, type PaymentDraft } from '@/shared/lib/payment-draft';
import { useRecordPayment } from '@/modules/orders/hooks/useOrders';
import { useRoofingAction } from '../hooks/useRoofing';

/** What the dialogs need to know about an order (from a queue row or the detail). */
export interface OrderRef {
  order_id: string;
  order_number: string;
  customer_name: string | null;
  total: number;
  paid_amount: number;
  balance: number;
  version: number;
  has_customer_material: boolean;
}

const labelCls = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500';

/** Supervisor hands a ready, fully paid order to the customer (prototype ReleaseDialog). */
export function ReleaseDialog({ order, onClose, onDone }: { order: OrderRef; onClose: () => void; onDone: (msg: string) => void }) {
  const action = useRoofingAction();
  const [releasedTo, setReleasedTo] = useState(order.customer_name ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!releasedTo.trim()) return setError('Enter who collected the order.');
    try {
      await action.mutateAsync({ orderId: order.order_id, action: 'release', version: order.version, released_to: releasedTo.trim(), note: note.trim() || undefined });
      onDone(`Order ${order.order_number} released to ${releasedTo.trim()}.`);
    } catch (e) {
      setError(apiError(e).message);
    }
  };

  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={`Release Order ${order.order_number}`}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
            Back
          </button>
          <button
            onClick={() => void submit()}
            disabled={action.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-5 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            <Icon name="packageCheck" className="h-4 w-4" /> {action.isPending ? 'Releasing…' : 'Release to Customer'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5 text-sm">
          <p className="flex items-center gap-2 font-semibold text-emerald-700">
            <Icon name="check" className="h-4 w-4" /> Work completed
          </p>
          <p className="flex items-center gap-2 font-semibold text-emerald-700">
            <Icon name="check" className="h-4 w-4" /> Fully paid ({formatRs(order.total)})
          </p>
        </div>
        <div>
          <label className={labelCls}>
            Handed over to <span className="text-red-500">*</span>
          </label>
          <input
            value={releasedTo}
            onChange={(e) => {
              setReleasedTo(e.target.value);
              setError(null);
            }}
            className="field-input"
            placeholder="Name of the person collecting"
          />
        </div>
        <div>
          <label className={labelCls}>Note</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="field-input" placeholder="Vehicle no., delivery note… (optional)" />
        </div>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Modal>
  );
}

/** Cashier cancels a placed order (prototype CancelDialog). Money paid is refunded at the counter (BR16). */
export function CancelDialog({ order, onClose, onDone }: { order: OrderRef; onClose: () => void; onDone: (msg: string) => void }) {
  const action = useRoofingAction();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (reason.trim().length < 3) return setError('Give a reason for cancelling.');
    try {
      await action.mutateAsync({ orderId: order.order_id, action: 'cancel', reason: reason.trim() });
      onDone(`Order ${order.order_number} cancelled.`);
    } catch (e) {
      setError(apiError(e).message);
    }
  };

  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={`Cancel Order ${order.order_number}`}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
            Keep order
          </button>
          <button
            onClick={() => void submit()}
            disabled={action.isPending}
            className="rounded-lg bg-red-600 px-5 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {action.isPending ? 'Cancelling…' : 'Cancel Order'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {order.paid_amount > 0 && <Notice tone="warning">{formatRs(order.paid_amount)} has been paid. Refund it to the customer at the counter.</Notice>}
        {order.has_customer_material && <p className="text-xs text-slate-500">Customer material on the gate pass will be freed for other orders.</p>}
        <div>
          <label className={labelCls}>
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
            rows={3}
            className="field-input"
            placeholder="Why is this order being cancelled?"
          />
        </div>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Modal>
  );
}

/** Collects a balance payment against an order (prototype OrderPaymentModal). */
export function CollectPaymentModal({ order, onClose, onDone }: { order: OrderRef; onClose: () => void; onDone: (msg: string) => void }) {
  const { settings } = useBranchContext();
  const general = settings?.general ?? DEFAULT_BRANCH_SETTINGS.general;
  const online = useOnlineStatus();
  const pay = useRecordPayment();
  const requestId = useRef(newRequestId());
  const [draft, setDraft] = useState<PaymentDraft>(() => ({ ...emptyPaymentDraft(general.payment_modes[0]), amount: String(order.balance / 100) }));
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const err = validatePaymentDraft(draft, { min: 1, max: order.balance, requireReference: general.require_payment_reference });
    if (err) return setError(err);
    const p = toPayment(draft);
    try {
      await pay.mutateAsync({ orderId: order.order_id, dto: { client_request_id: requestId.current, ...p } });
      onDone(`${formatRs(p.amount)} received for order ${order.order_number}.`);
    } catch (e) {
      setError(apiError(e).message);
    }
  };

  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title="Collect Payment"
      subtitle={`${order.order_number} · ${order.customer_name ?? 'Customer'}`}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
            Close
          </button>
          {order.balance > 0 && (
            <button
              onClick={() => void submit()}
              disabled={pay.isPending || !online}
              className="rounded-lg bg-[#0033A0] px-5 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {pay.isPending ? 'Saving…' : 'Record Payment'}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase text-slate-400">Total</p>
            <p className="text-sm font-bold text-slate-900">{formatRs(order.total)}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-[10px] font-bold uppercase text-emerald-600">Paid</p>
            <p className="text-sm font-bold text-emerald-800">{formatRs(order.paid_amount)}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-[10px] font-bold uppercase text-amber-600">Balance</p>
            <p className="text-sm font-bold text-amber-800">{formatRs(order.balance)}</p>
          </div>
        </div>
        {!online && <Notice tone="warning">Payments can't be recorded offline (BR18). Reconnect to continue.</Notice>}
        {order.balance <= 0 ? (
          <p className="text-sm font-semibold text-emerald-700">This order is fully paid.</p>
        ) : (
          <PaymentCapture
            value={draft}
            onChange={(next) => {
              setDraft(next);
              setError(null);
            }}
            general={general}
            quickAmounts={[{ label: 'Full balance', amount: order.balance }]}
          />
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Modal>
  );
}
