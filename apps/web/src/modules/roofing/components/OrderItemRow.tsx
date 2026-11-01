import { MaterialSource, isAccessoryCategory, roofingItemTitle, runningFt } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { formatRs } from '@/shared/lib/format';
import { AdvanceStrip, type SubJobAdvance } from '@/modules/job-cards/components/SubJobList';
import type { PricedRoofingQuoteLine } from '../hooks/useRoofing';
import type { OrderItem } from '../lib/order-items';
import { DesignPhoto } from './DesignPhoto';

interface Props {
  item: OrderItem;
  /** Coil label to show (the order coil when one is used), or null */
  coilLabel: string | null;
  price?: PricedRoofingQuoteLine;
  /** Gate pass item name for an item on the customer's material ("GP-00031 · Zinc Coated (…)") */
  materialName?: string | null;
  isEditing: boolean;
  locked?: boolean;
  /** The item's advance (Docs/decisions/0011) */
  advance?: SubJobAdvance;
  onAdvance: (advance: string) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

/** One line of the item: size, cuts, bends, coil, remarks. */
interface DetailRow {
  label: string;
  value: string;
  note?: string;
}

function detailRows(item: OrderItem, coilLabel: string | null): DetailRow[] {
  const rows: DetailRow[] = isAccessoryCategory(item.category)
    ? [{ label: 'Quantity', value: String(item.quantity ?? '—') }]
    : [{ label: 'Size', value: `${item.length_ft} ft × ${item.pieces} pcs`, note: `${runningFt(item).toLocaleString()} running ft` }];
  if (item.total_cuts) rows.push({ label: 'Cuts', value: String(item.total_cuts) });
  if (item.total_bends) rows.push({ label: 'Bends', value: String(item.total_bends) });
  if (coilLabel) rows.push({ label: 'Coil', value: coilLabel });
  if (item.remarks) rows.push({ label: 'Remarks', value: item.remarks });
  return rows;
}

const TAG = 'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide';

/** One item in the order form list, laid out like a job card sub-job (SubJobList). */
export function OrderItemRow({ item, coilLabel, price, materialName, isEditing, locked = false, advance, onAdvance, onEdit, onDuplicate, onRemove }: Props) {
  const custom = item.job_type === 'CUSTOMIZED';
  const customer = item.material_source === MaterialSource.CUSTOMER;
  const missing = !!price?.missing_rate;
  const rows = detailRows(item, coilLabel);

  return (
    <div
      className={`rounded-lg border bg-white shadow-sm transition-colors ${
        isEditing ? 'border-amber-400 ring-1 ring-amber-300' : missing ? 'border-amber-300' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      {/* Header: what, tags, price, actions */}
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="flex min-w-0 gap-3">
          {item.design_attachment_id && <DesignPhoto attachmentId={item.design_attachment_id} />}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-semibold text-slate-900">{roofingItemTitle(item)}</span>
              <span className={`${TAG} ${customer ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700'}`}>{customer ? 'Customer' : 'Branch'}</span>
              <span className={`${TAG} ${custom ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>{custom ? 'Customized' : 'Standard'}</span>
            </div>
            {price && !missing && <p className="mt-0.5 text-xs text-slate-500">{price.price_note}</p>}
            {customer && item.customer_material && (
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-600">
                <Icon name="packageOpen" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                {materialName ?? 'Gate pass material'} × {item.customer_material.quantity}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {price &&
            (missing ? (
              <span className={`${TAG} mr-2 bg-red-100 text-red-700`} title={`No rate for ${price.missing_rate}`}>
                No rate
              </span>
            ) : (
              <span className="mr-2 text-sm font-bold tabular-nums text-slate-900">{formatRs(price.line_total)}</span>
            ))}
          {!locked && (
            <>
              <button type="button" onClick={onEdit} className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" title="Edit">
                <Icon name="edit" className="h-4 w-4" />
              </button>
              <button type="button" onClick={onDuplicate} className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" title="Duplicate">
                <Icon name="copy" className="h-4 w-4" />
              </button>
              <button type="button" onClick={onRemove} className="rounded p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600" title="Remove">
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Details: one line each, same columns on every card */}
      <dl className="mx-4 mb-3 mt-2.5 divide-y divide-slate-100 rounded-md border border-slate-100 bg-slate-50/70 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline gap-3 px-3 py-1.5">
            <dt className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">{r.label}</dt>
            <dd className="min-w-0 flex-1 truncate">
              <span className="font-semibold tabular-nums text-slate-900">{r.value}</span>
              {r.note && <span className="ml-2 text-slate-500">{r.note}</span>}
            </dd>
          </div>
        ))}
      </dl>

      {price && !missing && advance && (
        <AdvanceStrip typed={item.advance_text ?? ''} advance={advance} locked={locked} onChange={onAdvance} what="item" fixedNote={custom ? undefined : 'Standard item'} />
      )}

      {missing && (
        <div className="mx-4 mb-3 flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          <Icon name="alertTriangle" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>No rate set for {price?.missing_rate}. Ask the branch manager to add it in Order Settings.</span>
        </div>
      )}
    </div>
  );
}
