import { formatGatePassLength, isSearchablePhone } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { formatDate } from '@/shared/lib/format';
import { useAvailableGatePasses, type GatePassDto } from '../hooks/useGatePasses';
import type { AllocatedItem } from './MaterialAllocationModal';

interface Props {
  phone: string;
  required: boolean;
  documentLabel: string;
  assigned: GatePassDto | null;
  allocated: AllocatedItem[];
  /** Roles that only allocate existing passes don't get the create button */
  canCreate?: boolean;
  onCreateNew: () => void;
  onAllocate: (gp: GatePassDto) => void;
  onUnassign: () => void;
}

/**
 * Gate Pass section of the job card / order form (prototype): the assigned pass with
 * what is allocated, and the customer's other passes that still have material.
 */
export function OrderGatePassPanel({ phone, required, documentLabel, assigned, allocated, canCreate = true, onCreateNew, onAllocate, onUnassign }: Props) {
  const searchable = isSearchablePhone(phone);
  const { data: passes = [] } = useAvailableGatePasses(phone, assigned?.gate_pass_id, searchable || !!assigned);
  const fresh = passes.find((p) => p.gate_pass_id === assigned?.gate_pass_id) ?? assigned;
  const others = passes.filter((p) => p.gate_pass_id !== assigned?.gate_pass_id);
  const pieces = allocated.reduce((s, a) => s + a.quantity, 0);

  return (
    <div className="border-b border-gray-200 bg-slate-50/70 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Gate Pass</h3>
          <p className="text-xs text-slate-500">{required ? 'Mandatory for customer-supplied material.' : 'Recommended when customer supplies materials.'}</p>
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

      {fresh && allocated.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Assigned Gate Pass</span>
              <span className="font-mono text-xs font-bold text-slate-900">#{fresh.pass_number}</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                <Icon name="check" className="h-3 w-3" />
                {pieces} pieces allocated
              </span>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => onAllocate(fresh)}
                className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2.5 py-1 text-xs font-semibold text-[#0033A0] transition-colors hover:bg-blue-50 hover:text-blue-800"
              >
                <Icon name="edit" className="h-3 w-3" />
                Edit Allocation
              </button>
              <button
                type="button"
                onClick={onUnassign}
                className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700"
              >
                Unassign
              </button>
            </div>
          </div>
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-600">
              <div>
                <span className="mr-1.5 font-medium text-slate-400">Customer:</span>
                <span className="font-semibold text-slate-800">{fresh.customer_name}</span>
              </div>
              <div>
                <span className="mr-1.5 font-medium text-slate-400">Date:</span>
                <span className="font-medium text-slate-700">{formatDate(fresh.created_at)}</span>
              </div>
              <div>
                <span className="mr-1.5 font-medium text-slate-400">Allocated Lines:</span>
                <span className="font-medium text-slate-700">{allocated.length} line(s)</span>
              </div>
            </div>
            <div className="border-t border-slate-200 pt-3">
              <h5 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Materials Allocated to this {documentLabel} ({allocated.length})
              </h5>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {allocated.map(({ item, quantity }, idx) => {
                  const bal = fresh.summary.item_balances.find((b) => b.gp_item_id === item.gp_item_id);
                  return (
                    <div key={item.gp_item_id} className="flex flex-col justify-between gap-2.5 rounded-lg border border-blue-200/80 bg-blue-50/30 p-3 text-xs shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-[#0033A0]">{idx + 1}</span>
                          <span className="text-sm font-bold text-slate-900">{item.material_type}</span>
                        </div>
                        <span className="shrink-0 rounded border border-blue-300 bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-900">Allocated: {quantity}</span>
                      </div>
                      <div className={`grid ${item.color ? 'grid-cols-3' : 'grid-cols-2'} gap-2 border-t border-slate-200/70 pt-1`}>
                        <Spec label="Thickness (mm)" value={item.thickness} />
                        <Spec label="Length" value={item.length ? formatGatePassLength(item.length, item.length_unit) : null} />
                        {item.color && <Spec label="Color" value={item.color} />}
                      </div>
                      {bal && (
                        <div className="flex items-center justify-between border-t border-slate-200/50 pt-1 text-[11px] text-slate-500">
                          <span>
                            Intake Total: <strong>{bal.received}</strong>
                          </span>
                          <span className="font-medium text-emerald-700">
                            Remaining on GP: <strong>{bal.available}</strong>
                          </span>
                        </div>
                      )}
                      {item.condition_note && (
                        <div className="flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                          <span className="mt-0.5 shrink-0 text-[10px] font-bold uppercase text-amber-700">Remarks:</span>
                          <span className="font-medium">{item.condition_note}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 border-t border-slate-200 pt-4">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-800">Available Gate Passes for Customer</h4>
            <p className="text-xs text-slate-500">Gate passes with unassigned materials that can be allocated across multiple jobs.</p>
          </div>
          {searchable && (
            <span className="text-xs font-medium text-slate-500">
              Phone: <strong className="text-slate-800">{phone}</strong>
            </span>
          )}
        </div>

        {!searchable ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-3.5 text-xs text-slate-500">
            Enter a customer phone number above to find open gate passes.
          </div>
        ) : others.length > 0 ? (
          <div className="space-y-2.5">
            {others.map((gp) => (
              <div
                key={gp.gate_pass_id}
                className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm transition-colors hover:border-slate-300 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="font-mono text-sm font-bold text-[#0033A0]">#{gp.pass_number}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-500">{formatDate(gp.created_at)}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-600">
                      Customer: <strong className="font-medium text-slate-800">{gp.customer_name}</strong>
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                      {gp.summary.total_available} piece(s) available
                    </span>
                  </div>
                  <div className="mt-2.5 space-y-2">
                    {gp.items.map((item, idx) => {
                      const bal = gp.summary.item_balances.find((b) => b.gp_item_id === item.gp_item_id)!;
                      return (
                        <div key={item.gp_item_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700">{idx + 1}</span>
                            <span className="text-sm font-bold text-slate-900">{item.material_type}</span>
                            <span className="text-[11px] text-slate-500">
                              {[item.thickness ? `${item.thickness} mm` : null, item.length ? formatGatePassLength(item.length, item.length_unit) : null, item.color]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium text-slate-500">Total: {bal.received}</span>
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-bold ${
                                bal.available > 0 ? 'border border-emerald-200 bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-400'
                              }`}
                            >
                              Available: {bal.available}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onAllocate(gp)}
                  className="inline-flex shrink-0 items-center rounded-md bg-[#0033A0] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-800"
                >
                  <Icon name="layers" className="mr-1.5 h-3.5 w-3.5" />
                  Allocate Materials
                </button>
              </div>
            ))}
          </div>
        ) : fresh ? (
          <div className="rounded-lg border border-slate-200 bg-white/70 p-3 text-xs text-slate-500">No other available gate passes for this customer.</div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-3.5 text-xs text-slate-500">
            No open gate passes with available materials found for <strong>{phone}</strong>.
            {canCreate && ' Click "Create New Gate Pass" above to log received materials.'}
          </div>
        )}
      </div>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded border border-slate-200/80 bg-white p-2">
      <span className="mb-0.5 block text-[10px] font-bold uppercase text-slate-400">{label}</span>
      <span className="font-semibold text-slate-800">{value || <span className="font-normal italic text-slate-400">—</span>}</span>
    </div>
  );
}
