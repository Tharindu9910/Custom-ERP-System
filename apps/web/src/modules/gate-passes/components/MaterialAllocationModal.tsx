import { useMemo, useState } from 'react';
import { formatGatePassLength } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { formatDate } from '@/shared/lib/format';
import type { GatePassDto, GatePassItemDto } from '../hooks/useGatePasses';

export interface AllocatedItem {
  item: GatePassItemDto;
  quantity: number;
}

interface Props {
  gatePass: GatePassDto;
  documentType: 'JOB_CARD' | 'ROOFING_ORDER';
  /** Quantities already picked in the form, per gate pass item */
  picked?: Record<string, number>;
  /** When editing a saved order, its committed material counts as available to it */
  committed?: Record<string, number>;
  onConfirm: (items: AllocatedItem[]) => void;
  onClose: () => void;
}

/**
 * Pick customer material from a gate pass (prototype MaterialAllocationModal). Nothing is
 * held here: the picked quantities are saved to the order only when it is placed.
 */
export function MaterialAllocationModal({ gatePass, documentType, picked = {}, committed = {}, onConfirm, onClose }: Props) {
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(gatePass.items.map((i) => [i.gp_item_id, picked[i.gp_item_id] ?? 0])),
  );
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      gatePass.items.map((item) => {
        const bal = gatePass.summary.item_balances.find((b) => b.gp_item_id === item.gp_item_id)!;
        // The balance counts this order's saved material as used; add it back when editing
        return { item, bal, max: bal.available + (committed[item.gp_item_id] ?? 0) };
      }),
    [gatePass, committed],
  );

  const set = (id: string, v: number, max: number) => {
    setError(null);
    setQty((p) => ({ ...p, [id]: Math.max(0, Math.min(Math.floor(v || 0), max)) }));
  };

  let totalPieces = 0;
  let lines = 0;
  let remaining = 0;
  rows.forEach(({ item, max }) => {
    const q = qty[item.gp_item_id] || 0;
    if (q > 0) {
      totalPieces += q;
      lines++;
    }
    remaining += Math.max(0, max - q);
  });

  const confirm = () => {
    const chosen = rows.filter(({ item }) => (qty[item.gp_item_id] || 0) > 0);
    if (chosen.length === 0) return setError('Please assign a quantity greater than zero for at least one material line.');
    onConfirm(chosen.map(({ item }) => ({ item, quantity: qty[item.gp_item_id] })));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-3 backdrop-blur-sm sm:p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-[#0033A0]">
              <Icon name="layers" className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Allocate Customer Materials</h3>
                <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-xs font-bold text-[#0033A0]">
                  GP #{gatePass.pass_number}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Select materials and enter quantities to assign to this {documentType === 'JOB_CARD' ? 'Job Card' : 'Order Form'}.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-600">
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 bg-blue-50/50 px-6 py-2.5 text-xs text-slate-700">
          <div className="flex items-center gap-4">
            <span>
              Customer: <strong className="text-slate-900">{gatePass.customer_name}</strong>
            </span>
            <span className="text-slate-300">·</span>
            <span>
              Phone: <strong className="font-mono text-slate-900">{gatePass.customer_phone}</strong>
            </span>
          </div>
          <span className="text-[11px] font-medium text-blue-800">Intake Date: {formatDate(gatePass.created_at)}</span>
        </div>

        {error && (
          <div className="mx-6 mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <Icon name="alertCircle" className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div className="flex-1 font-medium">{error}</div>
          </div>
        )}

        <div className="flex-1 space-y-3.5 overflow-y-auto p-6">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
            <span>Available Material Lines ({rows.length})</span>
            <span className="text-[11px] text-slate-400">Unassigned balance remains available for other jobs</span>
          </div>

          {rows.map(({ item, bal, max }, idx) => {
            const current = qty[item.gp_item_id] || 0;
            const selected = current > 0;
            const available = max > 0;
            return (
              <div
                key={item.gp_item_id}
                className={`rounded-xl border p-4 transition-all ${
                  selected
                    ? 'border-blue-300 bg-blue-50/40 shadow-sm ring-1 ring-blue-400/20'
                    : available
                      ? 'border-slate-200 bg-white hover:border-slate-300'
                      : 'border-slate-200 bg-slate-50 opacity-60'
                }`}
              >
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                        {idx + 1}
                      </span>
                      <h4 className="truncate text-sm font-bold text-slate-900">{item.material_type}</h4>
                      {item.color && (
                        <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                          {item.color}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      {item.thickness && <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium">Thickness: {item.thickness} mm</span>}
                      {item.length && (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium">
                          Length: {formatGatePassLength(item.length, item.length_unit)}
                        </span>
                      )}
                      {item.condition_note && (
                        <span className="rounded border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[11px] italic text-amber-800">
                          Note: {item.condition_note}
                        </span>
                      )}
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="font-medium text-slate-500">
                        Intake: <strong className="text-slate-800">{bal.received}</strong>
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="font-medium text-blue-700">
                        Committed: <strong>{bal.committed}</strong>
                      </span>
                      {bal.reserved > 0 && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="font-medium text-purple-700">
                            In Drafts: <strong>{bal.reserved}</strong>
                          </span>
                        </>
                      )}
                      <span className="text-slate-300">·</span>
                      <span
                        className={`rounded px-2 py-0.5 font-bold ${
                          max > 0 ? 'border border-emerald-200 bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        Available to assign: {max}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 pt-2 md:flex-col md:items-end md:border-t-0 md:pt-0">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-700">Qty to Assign:</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={!available || current <= 0}
                        onClick={() => set(item.gp_item_id, current - 1, max)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 text-slate-700 transition-colors hover:bg-slate-200 disabled:pointer-events-none disabled:opacity-30"
                      >
                        <Icon name="minus" className="h-3.5 w-3.5" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        max={max}
                        disabled={!available}
                        value={current === 0 ? '' : current}
                        placeholder="0"
                        onChange={(e) => {
                          const v = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                          set(item.gp_item_id, isNaN(v) ? 0 : v, max);
                        }}
                        className={`h-8 w-16 rounded-lg border text-center text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#0033A0]/30 disabled:opacity-50 ${
                          selected ? 'border-[#0033A0] text-[#0033A0]' : 'border-slate-300 text-slate-700'
                        }`}
                      />
                      <button
                        type="button"
                        disabled={!available || current >= max}
                        onClick={() => set(item.gp_item_id, current + 1, max)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 text-slate-700 transition-colors hover:bg-slate-200 disabled:pointer-events-none disabled:opacity-30"
                      >
                        <Icon name="plus" className="h-3.5 w-3.5" />
                      </button>
                      {max > 1 && (
                        <button type="button" onClick={() => set(item.gp_item_id, max, max)} className="px-1.5 py-1 text-[11px] font-semibold text-[#0033A0] hover:underline">
                          All ({max})
                        </button>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400">
                      Remaining after: <strong className="text-slate-600">{Math.max(0, max - current)}</strong>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col justify-between gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
          <div className="space-y-0.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800">
                Allocating: <strong className="text-[#0033A0]">{totalPieces}</strong> piece(s) across {lines} line(s)
              </span>
              <span className="text-slate-300">·</span>
              <span className="font-semibold text-emerald-700">{remaining} will remain available on Gate Pass</span>
            </div>
            <p className="text-[11px] text-slate-400">
              {totalPieces > 0
                ? 'Nothing is held yet. The material is assigned when you save.'
                : 'Please enter at least one positive quantity to confirm.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={totalPieces === 0}
              className="inline-flex items-center rounded-lg bg-[#0033A0] px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-800 disabled:pointer-events-none disabled:opacity-40"
            >
              <Icon name="check" className="mr-1.5 h-3.5 w-3.5" />
              Confirm Allocation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
