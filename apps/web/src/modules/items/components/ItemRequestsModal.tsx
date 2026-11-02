import { useState } from 'react';
import { ITEM_REQUEST_STATUS_LABEL, ItemRequestStatus, type ItemRequestQuery } from '@erp/shared';
import { apiError } from '@/shared/api/errors';
import { Modal } from '@/shared/components/Modal';
import { Notice } from '@/shared/components/Notice';
import { formatDateTime, formatRs } from '@/shared/lib/format';
import { useAuthStore } from '@/shared/stores/auth.store';
import { useItemRequestAction, useItemRequests, type ItemRequestDto } from '../hooks/useItemRequests';
import { ItemForm } from './ItemForm';

const STATUS_STYLE: Record<ItemRequestStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-800',
  APPROVED: 'bg-green-50 text-green-700',
  REJECTED: 'bg-red-50 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-600',
};

/**
 * The branch's new-product requests (Docs/decisions/0013). Supervisors follow theirs and can
 * cancel while waiting; the branch manager reviews, approves or rejects. Head office only reads.
 */
export function ItemRequestsModal({
  canApprove,
  canCancel,
  onClose,
  onDone,
}: {
  canApprove: boolean;
  /** Branch staff (not head office) may cancel their own waiting requests */
  canCancel: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const userId = useAuthStore((s) => s.user?.user_id);
  const [status, setStatus] = useState<ItemRequestQuery['status']>('OPEN');
  const [reviewing, setReviewing] = useState<ItemRequestDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading } = useItemRequests({ status });
  const cancel = useItemRequestAction();
  const rows = data?.rows ?? [];

  // The review form replaces the list, so only one dialog is open at a time
  if (reviewing) {
    return (
      <ItemForm
        mode="approve"
        request={reviewing}
        onClose={() => setReviewing(null)}
        onDone={(message) => {
          setReviewing(null);
          onDone(message);
        }}
      />
    );
  }

  const doCancel = async (r: ItemRequestDto) => {
    try {
      await cancel.mutateAsync({ action: 'cancel', id: r.request_id });
      setError(null);
    } catch (e) {
      setError(apiError(e).message);
    }
  };

  return (
    <Modal
      open
      size="md"
      fixedHeight
      onClose={onClose}
      title="New item requests"
      subtitle={canApprove ? 'Approve to add an item to the catalogue for every branch.' : 'Items your branch asked to add to the catalogue.'}
      footer={
        <button onClick={onClose} className="btn-secondary">
          Close
        </button>
      }
    >
      <div className="mb-4 inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-xs font-bold">
        {(
          [
            ['OPEN', `Waiting${data ? ` (${data.pending})` : ''}`],
            ['ALL', 'All'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setStatus(key)}
            className={`rounded-md px-4 py-1.5 transition-all ${status === key ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-900'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <Notice tone="error" className="mb-3">
          {error}
        </Notice>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-sm text-slate-400">Loading…</div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
          {status === 'OPEN' ? 'Nothing is waiting for approval.' : 'No requests yet.'}
        </p>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 text-sm">
          {rows.map((r) => {
            const pending = r.status === ItemRequestStatus.PENDING;
            return (
              <div key={r.request_id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    {r.name}
                    {r.item && <span className="ml-2 font-mono text-xs font-normal text-slate-500">{r.item.sku}</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.category} · per {r.unit}
                    {Object.values(r.attributes).length > 0 && ` · ${Object.values(r.attributes).join(' · ')}`}
                    {r.item && ` · ${formatRs(r.item.price)}`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {r.requested_by_name ?? 'Someone'} · {formatDateTime(r.created_at)}
                    {r.decided_by_name && ` · decided by ${r.decided_by_name}`}
                  </p>
                  {r.reject_reason && <p className="mt-1 text-xs text-red-700">Rejected: {r.reject_reason}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>{ITEM_REQUEST_STATUS_LABEL[r.status]}</span>
                  {pending && canApprove && (
                    <button onClick={() => setReviewing(r)} className="rounded bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-800">
                      Review
                    </button>
                  )}
                  {pending && canCancel && r.requested_by === userId && (
                    <button
                      onClick={() => void doCancel(r)}
                      disabled={cancel.isPending}
                      className="rounded bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      Cancel request
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
