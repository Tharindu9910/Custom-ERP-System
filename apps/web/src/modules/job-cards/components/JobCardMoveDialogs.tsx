import { useState } from 'react';
import { LineStatus, type StockOverride } from '@erp/shared';
import { Modal } from '@/shared/components/Modal';
import { Notice } from '@/shared/components/Notice';
import { StockOverrideDialog, type StockShortageDetails } from '@/shared/components/StockOverrideDialog';
import { apiError } from '@/shared/api/errors';
import { formatRs } from '@/shared/lib/format';
import { useJobCardAction, useOrderDetail, type OrderLineDto } from '@/modules/orders/hooks/useOrders';

interface DialogProps {
  orderId: string;
  onClose: () => void;
  onDone: (message: string) => void;
}

/**
 * Start Job (In Queue → Ongoing). Every sub-job is ticked; untick the ones that
 * start later from the card. Branch material for the ticked ones is deducted now
 * (BR10) and a shortage asks for the stock override.
 */
export function StartJobDialog({ orderId, onClose, onDone }: DialogProps) {
  const { data: order } = useOrderDetail(orderId);
  const action = useJobCardAction();
  const startable = order?.lines.filter((l) => l.status === LineStatus.PENDING || l.status === LineStatus.ASSIGNED) ?? [];
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [shortage, setShortage] = useState<StockShortageDetails | null>(null);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const chosen = startable.filter((l) => !unticked.has(l.line_id));

  const toggle = (id: string) =>
    setUnticked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async (override?: StockOverride) => {
    if (!order) return;
    setError(null);
    setOverrideError(null);
    try {
      await action.mutateAsync({ orderId, action: 'start', version: order.version, line_ids: chosen.map((l) => l.line_id), override });
      onDone(`${order.order_number} started — ${chosen.length} of ${startable.length} sub-job(s) in progress.`);
    } catch (e) {
      const info = apiError(e);
      if (info.code === 'STK_001') setShortage(info.details as StockShortageDetails);
      else if (override) setOverrideError(info.message);
      else setError(info.message);
    }
  };

  return (
    <>
      <Modal
        open
        size="sm"
        onClose={onClose}
        title={`Start Job · ${order?.order_number ?? ''}`}
        subtitle="The job card moves to Ongoing"
        footer={
          <>
            <button onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button onClick={() => void submit()} disabled={!order || action.isPending} className="btn-primary">
              {action.isPending ? 'Starting…' : 'Start Job'}
            </button>
          </>
        }
      >
        {!order ? (
          <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Sub-jobs to start now. Unticked ones can be started later from the job card.</p>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {startable.map((l) => (
                <LineCheck key={l.line_id} line={l} checked={!unticked.has(l.line_id)} onToggle={() => toggle(l.line_id)} />
              ))}
            </ul>
            {error && <Notice tone="error">{error}</Notice>}
          </div>
        )}
      </Modal>
      {shortage && (
        <StockOverrideDialog
          details={shortage}
          pending={action.isPending}
          error={overrideError}
          onConfirm={(ov) => void submit(ov)}
          onClose={() => setShortage(null)}
        />
      )}
    </>
  );
}

/**
 * Mark Completed (Ongoing → Finished). Needs every sub-job started; the ones still
 * in progress are completed now with this user as inspector (BR07).
 */
export function CompleteJobDialog({ orderId, onClose, onDone }: DialogProps) {
  const { data: order } = useOrderDetail(orderId);
  const action = useJobCardAction();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const active = order?.lines.filter((l) => l.status !== LineStatus.CANCELLED) ?? [];
  const notStarted = active.filter((l) => l.status === LineStatus.PENDING || l.status === LineStatus.ASSIGNED);
  const inProgress = active.filter((l) => l.status === LineStatus.IN_PROGRESS);

  const submit = async () => {
    if (!order) return;
    setError(null);
    try {
      await action.mutateAsync({ orderId, action: 'complete', version: order.version, note: note.trim() || undefined });
      onDone(`${order.order_number} finished — sent to the cashier for collection.`);
    } catch (e) {
      setError(apiError(e).message);
    }
  };

  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={`Mark Finished · ${order?.order_number ?? ''}`}
      subtitle="The job card moves to Finished and waits at the cashier"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={() => void submit()} disabled={!order || notStarted.length > 0 || action.isPending} className="btn-primary">
            {action.isPending ? 'Saving…' : 'Mark Finished'}
          </button>
        </>
      }
    >
      {!order ? (
        <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-3">
          {notStarted.length > 0 ? (
            <Notice tone="warning">
              {notStarted.map((l) => l.line_number).join(', ')} {notStarted.length === 1 ? 'has' : 'have'} not started yet. Start them from the job card first.
            </Notice>
          ) : inProgress.length > 0 ? (
            <>
              <p className="text-sm text-slate-600">These sub-jobs will be marked completed, with you as the inspector:</p>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {inProgress.map((l) => (
                  <li key={l.line_id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="font-semibold text-slate-800">{l.line_number}</span>
                    <span className="text-slate-500">{formatRs(l.line_total)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-slate-600">Every sub-job is done.</p>
          )}
          <div>
            <label className="field-label">Inspection note (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="field-input" />
          </div>
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      )}
    </Modal>
  );
}

function LineCheck({ line, checked, onToggle }: { line: OrderLineDto; checked: boolean; onToggle: () => void }) {
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
        <input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4 rounded border-slate-300" />
        <span className="font-semibold text-slate-800">{line.line_number}</span>
        <span className="truncate text-slate-500">
          {line.material_source === 'BRANCH' && line.item_name ? `${line.item_name} · ${line.quantity ?? ''} ${line.item_unit ?? ''}` : 'No branch stock used'}
        </span>
      </label>
    </li>
  );
}
