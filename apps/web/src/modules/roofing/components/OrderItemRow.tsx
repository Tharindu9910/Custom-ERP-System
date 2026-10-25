import { MaterialSource, isAccessoryCategory, roofingItemTitle, runningFt, type PricedRoofingLine } from '@erp/shared';
import { Icon } from '@/shared/components/Icon';
import { formatRs } from '@/shared/lib/format';
import type { OrderItem } from '../lib/order-items';
import { DesignPhoto } from './DesignPhoto';

interface Props {
  item: OrderItem;
  /** Coil label to show (the order coil when one is used), or null */
  coilLabel: string | null;
  price?: PricedRoofingLine;
  isEditing: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

/** One item in the order form list (prototype OrderItemRow). */
export function OrderItemRow({ item, coilLabel, price, isEditing, onEdit, onDuplicate, onRemove }: Props) {
  const accessory = isAccessoryCategory(item.category);
  const custom = item.job_type === 'CUSTOMIZED';
  const customer = item.material_source === MaterialSource.CUSTOMER;
  const ft = runningFt(item);

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-lg border bg-white p-3 shadow-sm ${isEditing ? 'border-amber-400 ring-1 ring-amber-300' : 'border-gray-200 hover:border-blue-300'}`}
    >
      <div className="flex min-w-0 gap-3">
        {item.design_attachment_id && <DesignPhoto attachmentId={item.design_attachment_id} />}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-bold text-gray-900">{roofingItemTitle(item)}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${customer ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
              {customer ? 'Customer' : 'Branch'}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${custom ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-700'}`}>
              {custom ? 'Customized' : 'Standard'}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-gray-600">
            {accessory ? (
              <span>
                <strong className="font-medium text-gray-700">Qty:</strong> {item.quantity}
              </span>
            ) : (
              <span>
                <strong className="font-medium text-gray-700">Size:</strong> {item.length_ft} ft × {item.pieces} pcs ({ft.toLocaleString()} ft)
              </span>
            )}
            {!!item.total_cuts && (
              <span>
                <strong className="font-medium text-gray-700">Cuts:</strong> {item.total_cuts}
              </span>
            )}
            {!!item.total_bends && (
              <span>
                <strong className="font-medium text-gray-700">Bends:</strong> {item.total_bends}
              </span>
            )}
            {coilLabel && (
              <span className="truncate">
                <strong className="font-medium text-gray-700">Coil:</strong> {coilLabel}
              </span>
            )}
            {item.remarks && (
              <span>
                <strong className="font-medium text-gray-700">Remarks:</strong> {item.remarks}
              </span>
            )}
          </div>
          {price && !price.missing_rate && <p className="mt-1 text-xs text-gray-500">{price.price_note}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {price &&
          (price.missing_rate ? (
            <span className="mr-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700" title={`No rate for ${price.missing_rate}`}>
              No rate
            </span>
          ) : (
            <span className="mr-2 text-sm font-bold tabular-nums text-gray-900">{formatRs(price.line_total)}</span>
          ))}
        <button type="button" onClick={onEdit} className="p-2 text-gray-400 transition-colors hover:text-blue-600" title="Edit">
          <Icon name="edit" className="h-4 w-4" />
        </button>
        <button type="button" onClick={onDuplicate} className="p-2 text-gray-400 transition-colors hover:text-blue-600" title="Duplicate">
          <Icon name="copy" className="h-4 w-4" />
        </button>
        <button type="button" onClick={onRemove} className="p-2 text-gray-400 transition-colors hover:text-red-500" title="Remove">
          <Icon name="trash" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
