import { useState } from 'react';
import { LineStatus } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { IdChip } from '@/shared/components/Marks';
import { Notice } from '@/shared/components/Notice';
import { apiError } from '@/shared/api/errors';
import { formatRs } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { OrderCheckHeader, OrderItemChecklist, SummaryRow, SummaryTile } from '@/modules/orders/components/OrderItemChecklist';
import { useJobCardAction, useOrderDetail, type WorkshopQueueRow } from '@/modules/orders/hooks/useOrders';
import { useRoofingAction } from '@/modules/roofing/hooks/useRoofing';

type HandOverRow = Pick<WorkshopQueueRow, 'order_id' | 'order_number' | 'customer_name' | 'customer_phone' | 'version'>;

/**
 * Check & Hand Over, shown in place of the Workshop Queue board (Docs/decisions/0005):
 * the job card is finished and paid in full. Step 1 the supervisor ticks every item off
 * against what is handed to the customer, step 2 records who received them and closes the
 * card. The ticks are not saved. With `roofing` it is the Order Queue's Check & Release
 * of a ready, fully paid roofing order.
 */
export function HandOverCheckout({
  row,
  roofing = false,
  onBack,
  onClosed,
}: {
  row: HandOverRow;
  roofing?: boolean;
  onBack: () => void;
  onClosed: (msg: string) => void;
}) {
  const { data: order, isLoading } = useOrderDetail(row.order_id);
  const jobAction = useJobCardAction();
  const roofingAction = useRoofingAction();
  const action = roofing ? roofingAction : jobAction;
  const what = roofing ? 'order' : 'job card';
  const [step, setStep] = useState<1 | 2>(1);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [releasedTo, setReleasedTo] = useState(row.customer_name ?? '');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const lines = order?.lines.filter((l) => l.status !== LineStatus.CANCELLED) ?? [];
  const allChecked = lines.every((l) => checked.has(l.line_id));

  const submit = async () => {
    setError(null);
    if (!releasedTo.trim()) return setError('Enter who collected the items.');
    try {
      const version = order?.version ?? row.version;
      if (roofing) {
        await roofingAction.mutateAsync({ orderId: row.order_id, action: 'release', version, released_to: releasedTo.trim(), note: notes.trim() || undefined });
        onClosed(`Order ${row.order_number} released to ${releasedTo.trim()}.`);
        return;
      }
      await jobAction.mutateAsync({
        orderId: row.order_id,
        action: 'close',
        version,
        released_to: releasedTo.trim(),
        notes: notes.trim() || undefined,
      });
      onClosed(`${row.order_number} handed over to ${releasedTo.trim()} and closed.`);
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
              <h2 className="font-bold tracking-tight text-slate-900">{step === 1 ? 'Check Items' : roofing ? 'Release' : 'Hand Over'}</h2>
              <IdChip>{row.order_number}</IdChip>
            </div>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {step === 1
                ? 'Check each item and its quantity before handing it over, and tick it off.'
                : `Record who received the items to close the ${what}.`}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-800">Paid in full</span>
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
                  <Icon name="packageCheck" className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Payment</p>
                </div>
                <div className="space-y-3 text-sm">
                  <SummaryRow label="Total" value={formatRs(order.total)} />
                  <SummaryRow label="Paid" value={formatRs(order.paid_amount)} tone="text-emerald-600" />
                  <div className="flex flex-col items-center gap-1 border-t border-dashed border-slate-200 pt-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Balance</span>
                    <span className="text-2xl font-black tabular-nums text-emerald-600">{formatRs(order.balance)}</span>
                  </div>
                </div>
              </div>
              <Notice tone="info">Hand over only what you have checked. The cashier has collected the full amount.</Notice>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl p-8">
            <div className="grid grid-cols-1 gap-10 md:grid-cols-[1fr_320px]">
              <div className="space-y-4">
                <div>
                  <label className="field-label">Received by</label>
                  <input
                    value={releasedTo}
                    onChange={(e) => {
                      setReleasedTo(e.target.value);
                      setError(null);
                    }}
                    maxLength={120}
                    placeholder="Name of the person collecting"
                    className="field-input"
                  />
                </div>
                <div>
                  <label className="field-label">Note (optional)</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} className="field-input" />
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                  <p className="mb-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">Confirmation Review</p>
                  <p className="text-sm font-bold text-slate-900">{order.customer?.name ?? row.customer_name}</p>
                  <p className="font-mono text-xs text-slate-500">{order.customer?.phone ?? row.customer_phone}</p>
                  <p className="mt-1 text-xs text-slate-500">{lines.length} items checked</p>
                  <div className="mt-4 grid gap-2">
                    <SummaryTile label="Total" value={formatRs(order.total)} />
                    <SummaryTile label="Balance" value={formatRs(order.balance)} tone="text-emerald-600" />
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
            Next: {roofing ? 'Release' : 'Hand Over'} <Icon name="arrowRight" className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={action.isPending || !releasedTo.trim()}
            className="btn-primary bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
          >
            {action.isPending ? 'Closing…' : roofing ? 'Release to Customer' : 'Hand Over & Close'} <Icon name="check" className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
