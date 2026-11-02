import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApproveItemRequestDto,
  CreateItemDto,
  CreateItemRequestDto,
  ItemRequestQuery,
  ItemRequestStatus,
  ItemType,
} from '@erp/shared';
import { apiClient } from '@/shared/api/client';
import { LIVE_TOPIC_KEYS, queryKeys } from '@/shared/api/query-keys';
import { LIVE_QUERY_OPTIONS } from '@/shared/live/useLiveUpdates';

/** A branch's request for a new catalogue product (Docs/decisions/0013). */
export interface ItemRequestDto {
  request_id: string;
  status: ItemRequestStatus;
  name: string;
  item_type: ItemType;
  category: string;
  unit: string;
  attributes: Record<string, string>;
  suggested_price: number | null;
  suggested_cost: number | null;
  note: string | null;
  requested_by: string;
  requested_by_name: string | null;
  created_at: string;
  decided_by_name: string | null;
  decided_at: string | null;
  reject_reason: string | null;
  item: { item_id: string; sku: string; price: number } | null;
}

export function useItemRequests(query: ItemRequestQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.itemRequests.list(query),
    queryFn: async () => (await apiClient.get<{ data: { rows: ItemRequestDto[]; pending: number } }>('/item-requests', { params: query })).data.data,
    placeholderData: keepPreviousData,
    enabled,
    ...LIVE_QUERY_OPTIONS,
  });
}

/** Requests waiting at this branch, for the manager's sidebar badge. Fetched once; the live topic refetches it. */
export function useItemRequestCount(enabled: boolean, branchId: string | null) {
  return useQuery({
    queryKey: queryKeys.itemRequests.count(branchId ?? ''),
    queryFn: async () => (await apiClient.get<{ data: { pending: number } }>('/item-requests/count')).data.data.pending,
    enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/** Categories and units already in the catalogue, per item type. Under ['items'], so a new item refreshes it. */
export function useCatalogOptions() {
  return useQuery({
    queryKey: queryKeys.items.options(),
    queryFn: async () => (await apiClient.get<{ data: Partial<Record<ItemType, { categories: string[]; units: string[] }>> }>('/items/options')).data.data,
    staleTime: 10 * 60_000,
  });
}

/** A new item touches requests, the catalogue (prices) and stock lists. */
function useInvalidateCatalog() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [...LIVE_TOPIC_KEYS.item_requests, ...LIVE_TOPIC_KEYS.prices, ...LIVE_TOPIC_KEYS.stock].map((key) => qc.invalidateQueries({ queryKey: key })),
    );
}

export function useCreateItemRequest() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (dto: CreateItemRequestDto) => (await apiClient.post<{ data: ItemRequestDto }>('/item-requests', dto)).data.data,
    onSuccess: invalidate,
  });
}

export type ItemRequestAction =
  | { action: 'approve'; id: string; body: ApproveItemRequestDto }
  | { action: 'reject'; id: string; body: { reason: string } }
  | { action: 'cancel'; id: string };

export function useItemRequestAction() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (a: ItemRequestAction) =>
      (await apiClient.post<{ data: ItemRequestDto }>(`/item-requests/${a.id}/${a.action}`, 'body' in a ? a.body : {})).data.data,
    onSuccess: invalidate,
  });
}

/** Head office adds a product directly (Price List). */
export function useCreateItem() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: async (dto: CreateItemDto) => (await apiClient.post<{ data: { item_id: string; sku: string } }>('/items', dto)).data.data,
    onSuccess: invalidate,
  });
}
