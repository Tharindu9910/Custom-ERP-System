import { useState } from 'react';
import { Modal } from '@/shared/components/Modal';
import { SegmentedTabs } from '@/shared/components/SegmentedTabs';
import { OrderHistoryPanel } from './OrderHistoryPanel';

export type HistoryType = 'job-cards' | 'roofing-orders';

const TAB_LABEL: Record<HistoryType, string> = { 'job-cards': 'Job cards', 'roofing-orders': 'Roofing orders' };

/**
 * History popup on Create Order and the Order, Workshop and Cashier Queues (Create Job Card
 * shows the same panel as a tab). More than one type (the Cashier Queue) adds a tab per type.
 */
export function OrderHistoryModal({
  types,
  hidden = false,
  onClose,
  onOpenOrder,
}: {
  /** In tab order; one type shows no tabs */
  types: HistoryType[];
  /** Hidden while an order's details are open on top; filters and the loaded page are kept */
  hidden?: boolean;
  onClose: () => void;
  onOpenOrder: (orderId: string, type: HistoryType) => void;
}) {
  const [picked, setPicked] = useState<HistoryType>(types[0]);
  const type = types.includes(picked) ? picked : types[0];
  const mixed = types.length > 1;
  const noun = mixed ? 'job card and roofing order' : type === 'job-cards' ? 'job card' : 'order';
  return (
    <Modal
      open={!hidden}
      size="xl"
      fixedHeight
      onClose={onClose}
      title={mixed ? 'Payment History' : type === 'job-cards' ? 'Job Card History' : 'Order History'}
      subtitle={`Every ${noun} at this branch by its ${mixed ? '' : type === 'job-cards' ? 'job ' : 'order '}date. Click one to see its details.`}
    >
      {mixed && (
        <div className="mb-4">
          <SegmentedTabs tabs={types.map((t) => ({ key: t, label: TAB_LABEL[t] }))} value={type} onChange={setPicked} />
        </div>
      )}
      <OrderHistoryPanel key={type} type={type} onOpenOrder={(id) => onOpenOrder(id, type)} />
    </Modal>
  );
}
