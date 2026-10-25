import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateStockTransferDto,
  OpenRequestInfo,
  ReceiveStockTransferDto,
  SendStockTransferDto,
  TransferDisplayStatus,
  TransferStatus,
} from '@erp/shared';
import { apiClient } from '@/shared/api/client';
import { LIVE_TOPIC_KEYS, queryKeys } from '@/shared/api/query-keys';
import { LIVE_QUERY_OPTIONS } from '@/shared/live/useLiveUpdates';

export interface TransferLineDto {
  transfer_line_id: string;
  item_id: string;
  name: string;
  sku: string;
  unit: string;
  category: string;
  qty_requested: number;
  qty_sent: number | null;
  qty_received: number | null;
  /** Our own stock of the item (BR06: never the other branch's) */
  own_stock: number;
  /** Own stock minus what open orders hold: the most we can send */
  own_available: number;
}

export interface TransferDto {
  transfer_id: string;
  transfer_number: string;
  status: TransferStatus;
  display_status: TransferDisplayStatus;
  side: 'INCOMING' | 'OUTGOING';
  requesting_branch: { branch_id: string; name: string };
  supplying_branch: { branch_id: string; name: string };
  needed_before: string | null;
  is_urgent: boolean;
  notes: string | null;
  reject_reason: string | null;
  receive_notes: string | null;
  requested_by_name: string | null;
  sent_by_name: string | null;
  received_by_name: string | null;
  closed_by_name: string | null;
  created_at: string;
  sent_at: string | null;
  received_at: string | null;
  closed_at: string | null;
  late: boolean;
  needs_action: boolean;
  lines: TransferLineDto[];
}

export interface TransferCounts {
  to_us: number;
  ours: number;
  to_send: number;
  to_receive: number;
}

export interface TransferItemOption {
  item_id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  stock: number;
  reorder_level: number;
  open_request: OpenRequestInfo | null;
}

export interface TransferListQuery {
  direction: 'INCOMING' | 'OUTGOING';
  open: 'true' | 'false';
  q?: string;
}

export function useTransferTargets() {
  return useQuery({
    queryKey: queryKeys.stockTransfers.targets(),
    queryFn: async () => (await apiClient.get<{ data: { branch_id: string; name: string; is_main: boolean }[] }>('/stock-transfers/targets')).data.data,
    staleTime: 5 * 60_000,
  });
}

/** Item picker results; `ids` loads items handed over from Inventory / Stock Alerts. */
export function useTransferItems(params: { q?: string; ids?: string[] }, enabled = true) {
  const query = { q: params.q || undefined, ids: params.ids?.length ? params.ids.join(',') : undefined };
  return useQuery({
    queryKey: queryKeys.items.search({ scope: 'transfer', ...query }),
    queryFn: async () => (await apiClient.get<{ data: TransferItemOption[] }>('/stock-transfers/items', { params: query })).data.data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useStockTransfers(query: TransferListQuery) {
  return useQuery({
    queryKey: queryKeys.stockTransfers.list(query),
    queryFn: async () =>
      (await apiClient.get<{ data: { rows: TransferDto[]; counts: TransferCounts; has_more: boolean } }>('/stock-transfers', { params: query })).data.data,
    placeholderData: keepPreviousData,
    ...LIVE_QUERY_OPTIONS,
  });
}

function useInvalidateTransfers() {
  const qc = useQueryClient();
  return () => Promise.all(LIVE_TOPIC_KEYS.transfers.map((key) => qc.invalidateQueries({ queryKey: key })));
}

export function useCreateTransfer() {
  const invalidate = useInvalidateTransfers();
  return useMutation({
    mutationFn: async (dto: CreateStockTransferDto) => (await apiClient.post<{ data: TransferDto }>('/stock-transfers', dto)).data.data,
    onSuccess: invalidate,
  });
}

export type TransferAction =
  | { action: 'send'; id: string; body: SendStockTransferDto }
  | { action: 'receive'; id: string; body: ReceiveStockTransferDto }
  | { action: 'reject'; id: string; body: { reason: string } }
  | { action: 'cancel'; id: string };

export function useTransferAction() {
  const invalidate = useInvalidateTransfers();
  return useMutation({
    mutationFn: async (a: TransferAction) =>
      (await apiClient.post<{ data: TransferDto }>(`/stock-transfers/${a.id}/${a.action}`, 'body' in a ? a.body : {})).data.data,
    onSuccess: invalidate,
  });
}

/** Head office: every request between branches, read-only (global roles only). */
export function useNetworkTransfers(query: { open: 'true' | 'false'; q?: string }) {
  return useQuery({
    queryKey: queryKeys.network.transfers(query),
    queryFn: async () =>
      (await apiClient.get<{ data: { rows: TransferDto[]; counts: { waiting: number; sent: number; late: number }; has_more: boolean } }>('/network/stock-transfers', { params: query }))
        .data.data,
    placeholderData: keepPreviousData,
    ...LIVE_QUERY_OPTIONS,
  });
}
