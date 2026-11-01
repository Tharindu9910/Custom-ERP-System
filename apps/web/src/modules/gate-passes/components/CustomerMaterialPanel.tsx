import { Icon } from '@/shared/components/Icon';
import type { CustomerMaterialOption } from '../lib/customer-material';

interface Props {
  /** A customer phone has been entered (passes are looked up by phone) */
  phoneReady: boolean;
  loading: boolean;
  options: CustomerMaterialOption[];
  /** Pieces per gate pass item taken by this card's sub-jobs */
  used: Record<string, number>;
  canCreate: boolean;
  onCreateNew: () => void;
}

/**
 * What the customer brought on their gate passes and how much is left for this card.
 * Customer sub-jobs pick from these items in the sub-job editor (Docs/decisions/0007).
 */
export function CustomerMaterialPanel({ phoneReady, loading, options, used, canCreate, onCreateNew }: Props) {
  return (
    <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Customer's material (gate passes)</h4>
          {/* <p className="text-xs text-slate-500">Customer-supplied sub-jobs must use an item from a gate pass.</p> */}
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex shrink-0 items-center self-start rounded-md bg-[#0033A0] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-800 sm:self-auto"
          >
            <Icon name="plus" className="mr-1.5 h-4 w-4" />
            Create New Gate Pass
          </button>
        )}
      </div>

      {!phoneReady ? (
        <p className="mt-3 text-sm text-slate-500">Enter the customer phone to see their gate passes.</p>
      ) : loading ? (
        <p className="mt-3 text-sm text-slate-400">Loading…</p>
      ) : options.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No gate pass material for this customer.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-md border border-slate-200 bg-white">
          {options.map((o) => {
            const left = o.max - (used[o.gp_item_id] ?? 0);
            return (
              <li key={o.gp_item_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-mono text-xs font-bold text-slate-500">{o.pass_number}</span>
                  <span className="mx-1.5 text-slate-300">·</span>
                  <span className="font-medium text-slate-900">{o.material_type}</span>
                  {o.specs && <span className="text-slate-500"> ({o.specs})</span>}
                </span>
                <span className={`shrink-0 text-xs font-semibold tabular-nums ${left > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {left} of {o.received} left
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
