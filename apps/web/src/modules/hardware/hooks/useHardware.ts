import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CancelHardwareSaleDto, CreateHardwareSaleDto, OrderStatus, PayHardwareSaleDto } from '@erp/shared';
import { apiClient } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { LIVE_QUERY_OPTIONS } from '@/shared/live/useLiveUpdates';
import { invalidateOrders, type OrderDetailDto } from '@/modules/orders/hooks/useOrders';

// Hardware Store and Hardware Queue (Docs/decisions/0006). Each screen loads with one
// request; live nudges (orders / payments / stock) refetch them.

export interface HardwareStoreItem {
  item_id: string;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  /** Cents */
  price: number;
  available: number;
  reorder_level: number;
}

export interface HardwareStoreBranch {
  branch_id: string;
  name: string;
  is_own: boolean;
}

export interface HardwareStoreView {
  branch: HardwareStoreBranch;
  branches: HardwareStoreBranch[];
  remote_min_advance_pct: number;
  items: HardwareStoreItem[];
}

export type HardwareColumn = 'AWAITING_PAYMENT' | 'PAID';

export interface HardwareQueueRow {
  order_id: string;
  order_number: string;
  column: HardwareColumn;
  status: OrderStatus;
  customer_name: string | null;
  customer_phone: string | null;
  origin_branch_name: string | null;
  total: number;
  paid_amount: number;
  balance: number;
  line_count: number;
  total_qty: number;
  first_item_name: string | null;
  first_item_qty: number | null;
  first_item_unit: string | null;
  item_skus: string[];
  item_names: string[];
  created_by_name: string | null;
  created_at: string;
  paid_at: string | null;
  version: number;
}

export interface HardwareQueue {
  rows: HardwareQueueRow[];
  counts: { awaiting_payment: number; paid_today: number; awaiting_balance: number; paid_today_total: number };
}

/** Catalogue with the chosen branch's available stock (own branch when omitted). */
export function useHardwareStore(branchId?: string) {
  return useQuery({
    queryKey: queryKeys.hardwareStore(branchId),
    queryFn: async () =>
      (await apiClient.get<{ data: HardwareStoreView }>('/hardware-store/items', { params: branchId ? { branch_id: branchId } : {} })).data.data,
    placeholderData: keepPreviousData,
    ...LIVE_QUERY_OPTIONS,
  });
}

export function useHardwareQueue() {
  return useQuery({
    queryKey: queryKeys.hardwareQueue(),
    queryFn: async () => (await apiClient.get<{ data: HardwareQueue }>('/hardware-queue')).data.data,
    ...LIVE_QUERY_OPTIONS,
  });
}

const onDetail = (qc: ReturnType<typeof useQueryClient>) => (detail: OrderDetailDto) => {
  qc.setQueryData(queryKeys.orders.detail(detail.order_id), detail);
  invalidateOrders(qc);
};

export function usePlaceHardwareSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateHardwareSaleDto) => (await apiClient.post<{ data: OrderDetailDto }>('/hardware-sales', dto)).data.data,
    onSuccess: onDetail(qc),
  });
}

export function usePayHardwareSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, dto }: { orderId: string; dto: PayHardwareSaleDto }) =>
      (await apiClient.post<{ data: OrderDetailDto }>(`/hardware-sales/${orderId}/pay`, dto)).data.data,
    onSuccess: onDetail(qc),
  });
}

export function useCancelHardwareSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, dto }: { orderId: string; dto: CancelHardwareSaleDto }) =>
      (await apiClient.post<{ data: OrderDetailDto }>(`/hardware-sales/${orderId}/cancel`, dto)).data.data,
    onSuccess: onDetail(qc),
  });
}
