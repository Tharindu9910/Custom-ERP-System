import { useEffect, useMemo } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateRoofingOrderDto,
  OrderPaymentState,
  OrderStatus,
  PricedRoofingLine,
  QuoteRoofingDto,
  RoofingDisplayStatus,
  RoofingQueueCounts,
  RoofingQueueTab,
  StockOverride,
  UpdateRoofingOrderDto,
} from '@erp/shared';
import { apiClient } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { LIVE_QUERY_OPTIONS } from '@/shared/live/useLiveUpdates';
import { invalidateOrders, type OrderDetailDto } from '@/modules/orders/hooks/useOrders';

export interface CoilOption {
  item_id: string;
  sku: string;
  thickness: string;
  color: string;
  origin: string;
  details: string;
  stock_ft: number;
}

export interface RoofingQuote {
  lines: PricedRoofingLine[];
  subtotal: number;
  discount: number;
  max_discount: number;
  total: number;
  min_to_place: number;
  missing_rates: { line_index: number; missing: string }[];
}

export interface RoofingQueueRow {
  order_id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  technician: string | null;
  created_at: string;
  released_at: string | null;
  status: OrderStatus;
  display_status: RoofingDisplayStatus;
  display_label: string;
  item_count: number;
  running_ft: number;
  has_customer_material: boolean;
  total: number;
  paid_amount: number;
  balance: number;
  payment_state: OrderPaymentState;
  version: number;
}

/** Coils this branch can use, with its own stock (BR06). */
export function useCoils(enabled = true) {
  return useQuery({
    queryKey: queryKeys.items.coils(),
    queryFn: async () => (await apiClient.get<{ data: CoilOption[] }>('/items/coils')).data.data,
    enabled,
    staleTime: 60_000,
  });
}

/** Live price preview — the same pricing the server uses when the order is placed. */
export function useRoofingQuote(body: QuoteRoofingDto) {
  return useQuery({
    queryKey: queryKeys.orders.quote({ type: 'roofing', ...body }),
    queryFn: async () => (await apiClient.post<{ data: RoofingQuote }>('/roofing-orders/quote', body)).data.data,
    enabled: body.lines.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function usePlaceRoofingOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateRoofingOrderDto) => (await apiClient.post<{ data: OrderDetailDto }>('/roofing-orders', dto)).data.data,
    onSuccess: () => invalidateOrders(qc),
  });
}

export function useUpdateRoofingOrder(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: UpdateRoofingOrderDto) =>
      (await apiClient.put<{ data: OrderDetailDto & { refund_due: number } }>(`/roofing-orders/${orderId}`, dto)).data.data,
    onSuccess: () => invalidateOrders(qc),
  });
}

export function useRoofingQueue(params: { tab: RoofingQueueTab; search?: string; placed_on?: string }) {
  return useQuery({
    queryKey: queryKeys.roofingQueue(params),
    queryFn: async () =>
      (await apiClient.get<{ data: { rows: RoofingQueueRow[]; counts: RoofingQueueCounts; has_more: boolean } }>('/roofing-queue', { params })).data
        .data,
    placeholderData: keepPreviousData,
    ...LIVE_QUERY_OPTIONS,
  });
}

export type RoofingAction =
  | { action: 'start'; version: number; override?: StockOverride }
  | { action: 'complete'; version: number }
  | { action: 'release'; version: number; released_to: string; note?: string }
  | { action: 'cancel'; reason: string };

/** Start / complete / release / cancel; the returned detail replaces the cached one. */
export function useRoofingAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, ...body }: RoofingAction & { orderId: string }) => {
      const { action, ...payload } = body;
      return (await apiClient.post<{ data: OrderDetailDto }>(`/roofing-orders/${orderId}/${action}`, payload)).data.data;
    },
    onSuccess: (detail) => {
      qc.setQueryData(queryKeys.orders.detail(detail.order_id), detail);
      invalidateOrders(qc);
    },
  });
}

export function useUploadDesignPhoto() {
  return useMutation({
    mutationFn: async (file: Blob) => {
      const form = new FormData();
      form.append('purpose', 'DESIGN_PHOTO');
      form.append('file', file, 'design.jpg');
      return (
        await apiClient.post<{ data: { attachment_id: string } }>('/attachments', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60_000,
        })
      ).data.data;
    },
  });
}

/**
 * Object URL for an attachment. Files need the auth header, so they are fetched
 * as a blob instead of being linked directly from <img src>.
 */
export function useAttachmentUrl(attachmentId: string | null | undefined): string | null {
  const { data } = useQuery({
    queryKey: ['attachments', attachmentId],
    queryFn: async () => (await apiClient.get<Blob>(`/attachments/${attachmentId}/file`, { responseType: 'blob' })).data,
    enabled: !!attachmentId,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  });
  const url = useMemo(() => (data ? URL.createObjectURL(data) : null), [data]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}
