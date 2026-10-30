import { formatGatePassLength } from '@erp/shared';
import { ColorDot } from '@/shared/components/Marks';
import { Modal } from '@/shared/components/Modal';
import { formatDate } from '@/shared/lib/format';
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
  const reservedNote = s.reservation_indicator === 'FULL' ? 'Fully reserved in drafts' : s.reservation_indicator === 'PARTIAL' ? 'Partly reserved in drafts' : null;

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={`Gate Pass #${gp.pass_number}`}
      subtitle={`Created ${formatDate(gp.created_at)}${gp.issued_by_name ? ` · by ${gp.issued_by_name}` : ''}`}
      footer={
        <>
          <span className="mr-auto self-center text-xs text-slate-500">
            {s.has_available ? (
              <span className="font-semibold text-emerald-700">{s.total_available} piece(s) available to allocate</span>
            ) : (
              'All material used'
            )}
          </span>
          {s.has_available && canAllocateJobCard && (
            <button onClick={() => onAllocateJobCard(gp)} className="rounded-md bg-[#0033A0] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800">
              Allocate to Job Card
            </button>
          )}
          {s.has_available && canAllocateOrder && (
            <button onClick={() => onAllocateOrder(gp)} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700">
              Allocate to Order Form
            </button>
          )}
          <button onClick={onClose} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Close
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-gray-900">
                {gp.customer_name}
                <span className="ml-2 font-mono text-sm font-normal text-gray-500">{gp.customer_phone}</span>
              </p>
              {(reservedNote || s.closed_at) && (
                <p className="mt-0.5 text-xs">
                  {reservedNote && <span className="font-medium text-purple-700">{reservedNote}</span>}
                  {reservedNote && s.closed_at && <span className="text-gray-400"> · </span>}
                  {s.closed_at && <span className="text-gray-500">Closed {formatDate(s.closed_at)}</span>}
                </p>
              )}
            </div>
            <GatePassStatusBadge summary={s} compact />
          </div>

          <div className={`grid divide-x rounded-lg border border-gray-200 text-sm ${s.total_reserved > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
            <Total label="Received" value={s.total_received} />
            <Total label="Used" value={s.total_committed} />
            {s.total_reserved > 0 && <Total label="In drafts" value={s.total_reserved} tone="text-purple-700" />}
            <Total label="Available" value={s.total_available} tone={s.total_available > 0 ? 'text-emerald-700' : 'text-gray-400'} />
          </div>
        </div>

        <div>
          <h4 className="mb-2 font-semibold text-gray-900">Materials ({s.item_balances.length})</h4>
          <ul className="divide-y rounded-lg border border-gray-200">
            {s.item_balances.map((bal) => {
              const item = gp.items.find((i) => i.gp_item_id === bal.gp_item_id)!;
              const specs = [item.thickness ? `${item.thickness} mm` : null, item.length ? formatGatePassLength(item.length, item.length_unit) : null].filter(Boolean).join(' · ');
              const usage = [bal.committed > 0 && `${bal.committed} used`, bal.reserved > 0 && `${bal.reserved} in draft`].filter(Boolean).join(' · ');
              return (
                <li key={bal.gp_item_id} className="flex items-start justify-between gap-4 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-semibold text-gray-900">{item.material_type}</span>
                      {(specs || (!hideColor && item.color)) && (
                        <span className="ml-2 inline-flex items-center gap-1 text-gray-500">
                          {specs}
                          {!hideColor && item.color && (
                            <>
                              {specs && ' · '}
                              <ColorDot color={item.color} />
                              {item.color}
                            </>
                          )}
                        </span>
                      )}
                    </p>
                    {item.condition_note && <p className="mt-0.5 text-xs italic text-gray-500">{item.condition_note}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="whitespace-nowrap text-sm">
                      <span className="text-gray-500">Available </span>
                      <span className={`font-semibold ${bal.available > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>{bal.available}</span>
                      <span className="text-gray-400"> / {bal.received}</span>
                    </p>
                    {usage && <p className="text-xs text-gray-400">{usage}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {gp.linked_documents.length > 0 && (
          <div>
            <h4 className="mb-2 font-semibold text-gray-900">Used on ({gp.linked_documents.length})</h4>
            <ul className="divide-y rounded-lg border border-gray-200 text-sm">
              {gp.linked_documents.map((doc, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2.5">
                  <div className="min-w-0">
                    <p>
                      <span className="font-mono font-semibold text-gray-900">#{doc.document_number}</span>
                      <span className="text-gray-500"> · {DOC_TYPE[doc.document_type] ?? doc.document_type}</span>
                      <span className={doc.closed_at ? 'text-emerald-700' : 'text-[#0033A0]'}> · {doc.status_label}</span>
                    </p>
                    <p className="text-xs text-gray-500">{doc.items.map((it) => `${it.quantity}× ${it.material_type}${it.specs ? ` (${it.specs})` : ''}`).join(', ')}</p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-gray-400">{formatDate(doc.allocated_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Total({ label, value, tone = 'text-gray-900' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`font-semibold ${tone}`}>{value}</p>
    </div>
  );
}
