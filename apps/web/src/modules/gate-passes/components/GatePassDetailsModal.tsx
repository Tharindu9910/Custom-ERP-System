import { formatGatePassLength } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { ColorDot, IdChip } from '@/shared/components/Marks';
import { formatDate } from '@/shared/lib/format';
import { accentFor } from '@/shared/lib/tones';
import { useGatePass, type GatePassDto } from '../hooks/useGatePasses';
import { gatePassStatusLabel } from '../lib/labels';

interface Props {
  gatePass: GatePassDto;
  hideColor: boolean;
  canAllocateJobCard: boolean;
  canAllocateOrder: boolean;
  onAllocateJobCard: (gp: GatePassDto) => void;
  onAllocateOrder: (gp: GatePassDto) => void;
  onClose: () => void;
}

/** Gate pass details popup — balances, line availability and linked documents. */
export function GatePassDetailsModal({ gatePass, hideColor, canAllocateJobCard, canAllocateOrder, onAllocateJobCard, onAllocateOrder, onClose }: Props) {
  // Keep the popup live while open (another draft may reserve material)
  const { data } = useGatePass(gatePass.gate_pass_id);
  const gp = data ?? gatePass;
  const s = gp.summary;
  const indicator = s.reservation_indicator === 'FULL' ? 'Full' : s.reservation_indicator === 'PARTIAL' ? 'Partial' : null;

  const fullyAllocated = (
    <span className="rounded-lg bg-slate-200/70 px-3 py-1.5 text-xs font-semibold text-slate-500">Fully Allocated</span>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-blue-100 p-1.5 text-[#0033A0]">
              <Icon name="layers" className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Gate Pass Details</h3>
              <p className="mt-0.5 font-mono text-xs text-slate-500">#{gp.pass_number}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-600" title="Close">
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-4">
            <Info label="Created Date" value={formatDate(gp.created_at)} />
            <div>
              <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</p>
              <p className="font-bold text-slate-900">
                {gatePassStatusLabel(s.status)}
                {indicator && <span className="ml-1 block text-[10px] font-medium text-purple-700">({indicator} Reserved)</span>}
              </p>
            </div>
            <Info label="Customer Name" value={gp.customer_name} />
            <Info label="Customer Phone" value={gp.customer_phone} mono />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Total label="Total Intake" value={s.total_received} box="bg-slate-50 border-slate-200" text="text-slate-500" num="text-slate-900" />
            <Total label="Committed (Used)" value={s.total_committed} box="bg-blue-50/60 border-blue-200" text="text-blue-700" num="text-blue-900" />
            <Total label="In Drafts" value={s.total_reserved} box="bg-purple-50/60 border-purple-200" text="text-purple-700" num="text-purple-900" />
            <Total label="Available Balance" value={s.total_available} box="bg-emerald-50/70 border-emerald-200" text="text-emerald-700" num="text-emerald-900" />
          </div>

          <div>
            <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-700">
              Material Lines &amp; Availability ({s.item_balances.length} lines)
            </h4>
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50">
                  <tr className="font-bold uppercase tracking-wider text-slate-600">
                    <th className="w-8 px-3.5 py-2.5 text-left">#</th>
                    <th className="px-3.5 py-2.5 text-left">Material &amp; Specs</th>
                    <th className="px-3 py-2.5 text-center">Intake</th>
                    <th className="px-3 py-2.5 text-center">Committed</th>
                    <th className="px-3 py-2.5 text-center">In Drafts</th>
                    <th className="px-3 py-2.5 text-center text-slate-700">Available</th>
                    <th className="px-3.5 py-2.5 text-left">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {s.item_balances.map((bal, idx) => {
                    const item = gp.items.find((i) => i.gp_item_id === bal.gp_item_id)!;
                    return (
                      <tr key={bal.gp_item_id} className="hover:bg-slate-50/60" style={{ boxShadow: `inset 4px 0 0 ${accentFor(item.material_type)}` }}>
                        <td className="px-3.5 py-3 font-semibold text-slate-400">{idx + 1}</td>
                        <td className="px-3.5 py-3 font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            {!hideColor && <ColorDot color={item.color} />}
                            {item.material_type}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] font-normal text-slate-500">
                            {item.thickness && <span className="spec-chip">{item.thickness} mm</span>}
                            {item.length && <span className="spec-chip">{formatGatePassLength(item.length, item.length_unit)}</span>}
                            {!hideColor && item.color && <span className="spec-chip">{item.color}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center font-bold text-slate-800">{bal.received}</td>
                        <td className="px-3 py-3 text-center font-bold text-blue-700">{bal.committed}</td>
                        <td className="px-3 py-3 text-center font-semibold text-purple-700">{bal.reserved}</td>
                        <td className="px-3 py-3 text-center">
                          <span
                            className={`inline-flex rounded px-2 py-0.5 text-xs font-bold ${
                              bal.available > 0 ? 'border border-emerald-200 bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {bal.available}
                          </span>
                        </td>
                        <td className="max-w-xs px-3.5 py-3 text-slate-600">{item.condition_note || <span className="italic text-slate-400">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-700">
              Linked Documents &amp; Allocations ({gp.linked_documents.length})
            </h4>
            {gp.linked_documents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">None</div>
            ) : (
              <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 shadow-sm">
                {gp.linked_documents.map((doc, i) => {
                  const tone = doc.document_type === 'ROOFING_ORDER' ? '#0f766e' : '#4338ca';
                  const done = doc.closed_at !== null;
                  return (
                    <div key={i} className="flex flex-col justify-between gap-3 bg-white p-3.5 hover:bg-slate-50/50 sm:flex-row sm:items-center">
                      <div>
                        <div className="flex items-center gap-2">
                          <IdChip tone={tone}>#{doc.document_number}</IdChip>
                          <span className="spec-chip" style={{ color: tone }}>
                            {doc.document_type === 'JOB_CARD' ? 'Job' : doc.document_type === 'ROOFING_ORDER' ? 'Order' : 'Draft'}
                          </span>
                          <span
                            className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${
                              done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-blue-200 bg-blue-50 text-[#0033A0]'
                            }`}
                          >
                            {doc.status_label}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                          {doc.items.map((it, j) => (
                            <span key={j} className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5">
                              <strong>{it.quantity}x</strong> {it.material_type} {it.specs && `(${it.specs})`}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="shrink-0 text-[11px] text-slate-400 sm:text-right">
                        <div>Allocated: {formatDate(doc.allocated_at)}</div>
                        {doc.closed_at && <div className="text-emerald-700">Closed: {formatDate(doc.closed_at)}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-4">
          <div className="text-xs text-slate-500">
            {s.has_available ? (
              <span className="flex items-center gap-1 font-semibold text-emerald-700">
                <Icon name="checkCircle" className="h-3.5 w-3.5" />
                {s.total_available} piece(s) available for allocation
              </span>
            ) : (
              <span>All materials on this Gate Pass are fully committed.</span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            {canAllocateJobCard &&
              (s.has_available ? (
                <button
                  onClick={() => onAllocateJobCard(gp)}
                  className="rounded-lg bg-[#0033A0] px-5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-800"
                >
                  Allocate to Job Card
                </button>
              ) : (
                fullyAllocated
              ))}
            {canAllocateOrder &&
              (s.has_available ? (
                <button
                  onClick={() => onAllocateOrder(gp)}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700"
                >
                  Allocate to Order Form
                </button>
              ) : (
                fullyAllocated
              ))}
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`font-semibold text-slate-900 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function Total({ label, value, box, text, num }: { label: string; value: number; box: string; text: string; num: string }) {
  return (
    <div className={`rounded-lg border p-3 text-center ${box}`}>
      <span className={`block text-[10px] font-bold uppercase ${text}`}>{label}</span>
      <span className={`text-lg font-bold ${num}`}>{value}</span>
    </div>
  );
}
