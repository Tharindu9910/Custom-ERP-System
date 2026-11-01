import { formatGatePassLength } from '@erp/shared';
import { SectionTitle, Stat, StatStrip } from '@/shared/components/DetailParts';
import { ColorDot } from '@/shared/components/Marks';
import { Modal } from '@/shared/components/Modal';
import { formatDate } from '@/shared/lib/format';
import { accentFor } from '@/shared/lib/tones';
import { useGatePass, type GatePassDto } from '../hooks/useGatePasses';
import { GatePassStatusBadge } from './GatePassStatusBadge';

interface Props {
  gatePass: GatePassDto;
  hideColor: boolean;
  canAllocateJobCard: boolean;
  canAllocateOrder: boolean;
  onAllocateJobCard: (gp: GatePassDto) => void;
  onAllocateOrder: (gp: GatePassDto) => void;
  onClose: () => void;
}

const DOC_TYPE: Record<string, string> = { JOB_CARD: 'Job card', ROOFING_ORDER: 'Order', DRAFT: 'Draft' };

/** Gate pass details popup: who brought what, how much is left, and where it was used. */
export function GatePassDetailsModal({ gatePass, hideColor, canAllocateJobCard, canAllocateOrder, onAllocateJobCard, onAllocateOrder, onClose }: Props) {
  // Keep the popup live while open (another draft may reserve material)
  const { data } = useGatePass(gatePass.gate_pass_id);
  const gp = data ?? gatePass;
  const s = gp.summary;
  const reservedNote =
    s.reservation_indicator === 'FULL' ? 'Fully reserved in drafts' : s.reservation_indicator === 'PARTIAL' ? 'Partly reserved in drafts' : null;

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={`Gate Pass #${gp.pass_number}`}
      subtitle={`Created ${formatDate(gp.created_at)}`}
      footer={
        <>
          <span className="mr-auto self-center text-xs text-slate-500">
            {s.has_available ? <span className="font-semibold text-emerald-700">{s.total_available} piece(s) available to allocate</span> : 'All material used'}
          </span>
          {s.has_available && canAllocateJobCard && (
            <button
              onClick={() => onAllocateJobCard(gp)}
              className="rounded-lg bg-[#0033A0] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800"
            >
              Allocate to Job Card
            </button>
          )}
          {s.has_available && canAllocateOrder && (
            <button
              onClick={() => onAllocateOrder(gp)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              Allocate to Order Form
            </button>
          )}
          <button onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Close
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-900">
                {gp.customer_name}
                <span className="ml-2 font-mono text-sm font-normal text-slate-500">{gp.customer_phone}</span>
              </p>
              {(reservedNote || s.closed_at) && (
                <p className="mt-0.5 text-xs">
                  {reservedNote && <span className="font-medium text-purple-700">{reservedNote}</span>}
                  {reservedNote && s.closed_at && <span className="text-slate-400"> · </span>}
                  {s.closed_at && <span className="text-slate-500">Closed {formatDate(s.closed_at)}</span>}
                </p>
              )}
            </div>
            <GatePassStatusBadge summary={s} compact />
          </div>

          <StatStrip>
            <Stat label="Received" value={s.total_received} />
            <Stat label="Used" value={s.total_committed} />
            {s.total_reserved > 0 && <Stat label="In drafts" value={s.total_reserved} tone="text-purple-700" />}
            <Stat label="Available" value={s.total_available} tone={s.total_available > 0 ? 'text-emerald-700' : 'text-slate-400'} />
          </StatStrip>
        </div>

        {/* The focus: what came in, and how much of each is still free */}
        <div>
          <SectionTitle title="Materials" count={s.item_balances.length} />
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 shadow-sm">
            {s.item_balances.map((bal) => {
              const item = gp.items.find((i) => i.gp_item_id === bal.gp_item_id)!;
              const usage = [bal.committed > 0 && `${bal.committed} used`, bal.reserved > 0 && `${bal.reserved} in draft`].filter(Boolean).join(' · ');
              const spent = bal.available === 0;
              return (
                <li
                  key={bal.gp_item_id}
                  className={`flex items-center justify-between gap-4 py-3.5 pl-5 pr-4 ${spent ? 'bg-slate-50/70' : 'bg-white'}`}
                  style={{ boxShadow: `inset 4px 0 0 ${spent ? '#cbd5e1' : accentFor(item.material_type)}` }}
                >
                  <div className="min-w-0 space-y-1.5">
                    <p className={`font-bold ${spent ? 'text-slate-500' : 'text-slate-900'}`}>{item.material_type}</p>
                    {(item.thickness || item.length || (!hideColor && item.color)) && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.thickness && <span className="spec-chip">{item.thickness} mm</span>}
                        {item.length && <span className="spec-chip">{formatGatePassLength(item.length, item.length_unit)}</span>}
                        {!hideColor && item.color && (
                          <span className="spec-chip">
                            <ColorDot color={item.color} />
                            {item.color}
                          </span>
                        )}
                      </div>
                    )}
                    {item.condition_note && (
                      <p className="inline-flex items-start rounded-md border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                        {item.condition_note}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Available</p>
                    <p className="whitespace-nowrap tabular-nums">
                      <span className={`text-xl font-bold ${spent ? 'text-slate-400' : 'text-emerald-700'}`}>{bal.available}</span>
                      <span className="text-sm font-medium text-slate-400"> / {bal.received}</span>
                    </p>
                    {usage && <p className="text-xs text-slate-500">{usage}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {gp.linked_documents.length > 0 && (
          <div>
            <SectionTitle title="Used on" count={gp.linked_documents.length} />
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
              {gp.linked_documents.map((doc, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5">
                  <div className="min-w-0">
                    <p>
                      <span className="font-mono font-semibold text-slate-900">#{doc.document_number}</span>
                      <span className="text-slate-500"> · {DOC_TYPE[doc.document_type] ?? doc.document_type}</span>
                      <span className={`font-medium ${doc.closed_at ? 'text-emerald-700' : 'text-[#0033A0]'}`}> · {doc.status_label}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {doc.items.map((it) => `${it.quantity}× ${it.material_type}${it.specs ? ` (${it.specs})` : ''}`).join(', ')}
                    </p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-slate-400">{formatDate(doc.allocated_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
