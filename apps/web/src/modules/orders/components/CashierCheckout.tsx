import { useRef, useState } from 'react';
import { DEFAULT_BRANCH_SETTINGS, LineStatus, OrderStatus, OrderType, PAYMENT_STATE_LABEL, PaymentMode } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { IdChip } from '@/shared/components/Marks';
import { Notice } from '@/shared/components/Notice';
import { PaymentCapture } from '@/shared/components/PaymentCapture';
import { apiError, newRequestId } from '@/shared/api/errors';
import { useBranchContext } from '@/shared/hooks/useBranchContext';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import { centsToInput, formatDateTime, formatRs, parseMoney } from '@/shared/lib/format';
import { toPayment, validatePaymentDraft, type PaymentDraft } from '@/shared/lib/payment-draft';
import { cn } from '@/shared/lib/utils';
import { useOrderDetail, useRecordPayment, useSendRoofingToQueue, useSendToWorkshop, type CashierQueueRow } from '../hooks/useOrders';
import { OrderCheckHeader, OrderItemChecklist, SummaryRow as Row, SummaryTile as Tile } from './OrderItemChecklist';

const MODE_LABEL: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  TRANSFER: 'Transfer',
};
const KIND_LABEL: Record<string, string> = {
  ADVANCE: 'Advance',
  PARTIAL: 'Partial',
  FINAL: 'Final',
};

/**
 * Cashier checkout, shown in place of the Cashier Queue board (prototype CashierQueue
 * checkout): step 1 the cashier ticks every item off with the customer, step 2 takes
 * the payment. Covers Take Advance, Take Payment mid-job, Collect Balance and roofing
 * balances. The cashier never closes a card: once a finished card is paid in full the
 * supervisor checks and hands it over (Docs/decisions/0005).
 */
export function CashierCheckout({ row, onBack, onPaid }: { row: CashierQueueRow; onBack: () => void; onPaid: (msg: string) => void }) {
  const { data: order, isLoading } = useOrderDetail(row.order_id);
  const { settings } = useBranchContext();
  const general = settings?.general ?? DEFAULT_BRANCH_SETTINGS.general;
  const online = useOnlineStatus();
  const pay = useRecordPayment();
  const requestId = useRef(newRequestId());

  const [step, setStep] = useState<1 | 2>(1);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const isDraft = row.status === OrderStatus.DRAFT;
  const suggested = isDraft && row.advance_due > 0 ? row.advance_due : row.balance;
  const [draft, setDraft] = useState<PaymentDraft>({
    amount: centsToInput(suggested),
    mode: general.payment_modes[0] ?? PaymentMode.CASH,
    reference: '',
  });
  const [error, setError] = useState<string | null>(null);
  // A payment while the job is in the workshop only lowers the balance; the card stays where it is
  const inWorkshop = row.column === 'IN_WORKSHOP';
  const finished = row.column === 'FINISHED_BALANCE_DUE';
  // Every card waits here first; with nothing due the cashier may send it on without taking money
  const roofing = row.order_type !== OrderType.JOB_CARD;
  // Unpaid roofing orders (submitted by the supervisor) go on to the Order Queue instead
  const sendJob = useSendToWorkshop();
  const sendRoofing = useSendRoofingToQueue();
  const send = roofing ? sendRoofing : sendJob;
  const queueName = roofing ? 'Order Queue' : 'Workshop Queue';
  const canSendFree = isDraft && row.advance_due === 0;

  const lines = order?.lines.filter((l) => l.status !== LineStatus.CANCELLED) ?? [];
  const allChecked = lines.every((l) => checked.has(l.line_id));

  const amount = parseMoney(draft.amount || '0');
  const balanceAfter = Math.max(0, row.balance - amount);

  const submit = async () => {
    setError(null);
    const invalid = validatePaymentDraft(draft, {
      min: 1,
      max: row.balance,
      requireReference: general.require_payment_reference,
    });
    if (invalid) return setError(invalid);
    try {
      const res = await pay.mutateAsync({
        orderId: row.order_id,
        dto: {
          client_request_id: requestId.current,
          ...toPayment(draft),
        },
      });
      onPaid(
        res.status === OrderStatus.IN_QUEUE && isDraft
          ? `${formatRs(amount)} received for ${row.order_number}. It is now in the ${queueName}.`
          : finished && res.balance === 0
            ? `${formatRs(amount)} received for ${row.order_number}. Paid in full — sent to the supervisor for hand-over.`
            : inWorkshop
              ? `${formatRs(amount)} received for ${row.order_number}. ${res.balance > 0 ? `Balance now ${formatRs(res.balance)}` : 'Paid in full'} — the job stays in the workshop.`
              : `${formatRs(amount)} received for ${row.order_number}.`,
      );
    } catch (e) {
      setError(apiError(e).message);
    }
  };

  const sendFree = async () => {
    setError(null);
    try {
      await send.mutateAsync({ orderId: row.order_id, version: order?.version ?? row.version });
      onPaid(`${row.order_number} sent to the ${queueName} without payment.`);
    } catch (e) {
      setError(apiError(e).message);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header: step dots, title, order and payment state */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className={cn('h-1.5 rounded-full bg-[#0033A0] transition-all', step === 1 ? 'w-5' : 'w-1.5')} />
            <div className={cn('h-1.5 rounded-full transition-all', step === 2 ? 'w-5 bg-[#0033A0]' : 'w-1.5 bg-slate-300')} />
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold tracking-tight text-slate-900">{step === 1 ? 'Check Items' : 'Take Payment'}</h2>
              <IdChip>{row.order_number}</IdChip>
            </div>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {step === 1 ? 'Go through each item with the customer and tick it off.' : 'Enter the payment details to record the transaction.'}
            </p>
          </div>
        </div>
        {order && (
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
              order.payment_state === 'FULLY_PAID'
                ? 'bg-emerald-100 text-emerald-800'
                : order.payment_state === 'ADVANCE_PAID'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-rose-100 text-rose-800',
            )}
          >
            {PAYMENT_STATE_LABEL[order.payment_state]}
          </span>
        )}
      </div>

      <div className="flex-1">
        {isLoading || !order ? (
          <div className="py-20 text-center text-sm text-slate-400">Loading…</div>
        ) : step === 1 ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px]">
            <div className="p-6 lg:border-r lg:border-slate-200">
              <OrderCheckHeader order={order} row={row} roofing={roofing} />
              <OrderItemChecklist lines={lines} roofing={roofing} checked={checked} onChange={setChecked} />
            </div>

            <div className="flex flex-col gap-6 bg-slate-50 p-6">
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-6 text-center">
                  <Icon name="fileText" className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Payment Summary</p>
                </div>
                <div className="space-y-3 text-sm">
                  <Row label="Subtotal" value={formatRs(order.subtotal)} />
                  {order.discount > 0 && <Row label="Discount" value={`− ${formatRs(order.discount)}`} />}
                  <Row label="Total" value={formatRs(order.total)} />
                  <Row label="Paid to date" value={formatRs(order.paid_amount)} tone="text-emerald-600" />
                  {isDraft && row.advance_due > 0 && <Row label="Minimum advance" value={formatRs(row.advance_due)} tone="text-amber-600" />}
                  <div className="flex flex-col items-center gap-1 border-t border-dashed border-slate-200 pt-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount Outstanding</span>
                    <span className="text-2xl font-black tabular-nums text-slate-900">{formatRs(row.balance)}</span>
                  </div>
                </div>
              </div>

              {order.payments.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Previous payments</p>
                  <ul className="space-y-2 text-xs">
                    {order.payments.map((p) => (
                      <li key={p.payment_id} className="flex justify-between gap-2">
                        <span className="text-slate-600">
                          {p.receipt_no} · {KIND_LABEL[p.kind] ?? p.kind} · {MODE_LABEL[p.mode] ?? p.mode}
                          <span className="block text-slate-400">{formatDateTime(p.paid_at)}</span>
                        </span>
                        <span className="font-bold tabular-nums text-slate-800">{formatRs(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Notice tone="info">Check each item and its quantity with the customer before taking payment.</Notice>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl p-8">
            <div className="grid grid-cols-1 gap-10 md:grid-cols-[1fr_320px]">
              <div className="space-y-6">
                {!online && <Notice tone="warning">Payments can't be recorded offline (BR18). Reconnect to continue.</Notice>}
                {inWorkshop && (
                  <Notice tone="info">
                    The job is still in the workshop ({row.display_label}). This payment lowers the balance; the job stays where it is.
                  </Notice>
                )}
                <PaymentCapture
                  value={draft}
                  onChange={(next) => {
                    setDraft(next);
                    setError(null);
                  }}
                  general={general}
                  quickAmounts={[
                    ...(isDraft && row.advance_due > 0 ? [{ label: 'Minimum advance', amount: row.advance_due }] : []),
                    { label: 'Full balance', amount: row.balance },
                  ]}
                />
              </div>

              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                  <p className="mb-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Confirmation Review</p>
                  <p className="text-sm font-bold text-slate-900">{order.customer?.name ?? row.customer_name ?? 'Walk-in'}</p>
                  <p className="font-mono text-xs text-slate-500">{order.customer?.phone ?? row.customer_phone}</p>
                  <p className="mt-1 text-xs text-slate-500">{lines.length} items checked</p>
                  <div className="mt-4 grid gap-2">
                    <Tile label="Balance due" value={formatRs(row.balance)} />
                    <Tile label="Paid already" value={formatRs(order.paid_amount)} tone="text-emerald-600" />
                    <Tile label="This payment" value={formatRs(amount)} tone="text-[#0033A0]" />
                    <Tile label="Balance after" value={formatRs(balanceAfter)} />
                  </div>
                </div>
                {error && <Notice tone="error">{error}</Notice>}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
        <button type="button" onClick={step === 1 ? onBack : () => setStep(1)} className="btn-secondary">
          <Icon name="chevronRight" className="h-4 w-4 rotate-180" /> {step === 1 ? 'Back to queue' : 'Back'}
        </button>
        {step === 1 ? (
          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={!order || !allChecked}
            title={!allChecked ? 'Tick every item first' : undefined}
            className="btn-primary disabled:opacity-50"
          >
            Next: Take Payment <Icon name="arrowRight" className="h-4 w-4" />
          </button>
        ) : (
          <div className="flex items-center gap-3">
            {canSendFree && (
              <button type="button" onClick={() => void sendFree()} disabled={send.isPending || pay.isPending} className="btn-secondary">
                {send.isPending ? 'Sending…' : `Send to ${roofing ? 'Order Queue' : 'Workshop'} (no payment)`}
              </button>
            )}
            <button type="button" onClick={() => void submit()} disabled={pay.isPending || send.isPending || !online} className="btn-primary">
              {pay.isPending ? 'Saving…' : 'Confirm Payment'} <Icon name="check" className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
