import { Modal } from '@/shared/components/Modal';
import { OrderHistoryPanel } from './OrderHistoryPanel';

/** History popup on Create Order / Order Queue (Create Job Card shows the same panel as a tab). */
export function OrderHistoryModal({
  type,
  hidden = false,
  onClose,
  onOpenOrder,
}: {
  type: 'job-cards' | 'roofing-orders';
  /** Hidden while an order's details are open on top; filters and the loaded page are kept */
  hidden?: boolean;
  onClose: () => void;
  onOpenOrder: (orderId: string) => void;
}) {
  const noun = type === 'job-cards' ? 'job card' : 'order';
  return (
    <Modal
      open={!hidden}
      size="xl"
      fixedHeight
      onClose={onClose}
      title={type === 'job-cards' ? 'Job Card History' : 'Order History'}
      subtitle={`Every ${noun} at this branch by its ${type === 'job-cards' ? 'job' : 'order'} date. Click one to see its details.`}
    >
      <OrderHistoryPanel type={type} onOpenOrder={onOpenOrder} />
    </Modal>
  );
}
