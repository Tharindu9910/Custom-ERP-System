import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateGatePassDto, GatePassDisplayStatus, GatePassFilter } from '@erp/shared';
import { apiClient } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { LIVE_QUERY_OPTIONS } from '@/shared/live/useLiveUpdates';

export interface GatePassItemDto {
  gp_item_id: string;
  material_type: string;
  thickness: string | null;
  length: number | null;
  length_unit: 'FT' | 'INCHES' | null;
  color: string | null;
  quantity: number;
  condition_note: string | null;
}

export interface ItemBalanceDto {
  gp_item_id: string;
  received: number;
  committed: number;
  reserved: number;
  available: number;
}

export interface LinkedDocumentDto {
  order_id: string | null;
  document_number: string;
  document_type: 'JOB_CARD' | 'ROOFING_ORDER' | 'DRAFT';
  status_label: string;
  allocated_at: string;
  closed_at: string | null;
  items: { material_type: string; quantity: number; specs: string }[];
}

export interface GatePassDto {
  gate_pass_id: string;
  pass_number: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  notes: string | null;
  issued_by_name: string | null;
  created_at: string;
  items: GatePassItemDto[];
  summary: {
    status: GatePassDisplayStatus;
    reservation_indicator: 'PARTIAL' | 'FULL' | null;
    total_received: number;
    total_committed: number;
    total_reserved: number;
    total_available: number;
    has_available: boolean;
    closed_at: string | null;
    item_balances: ItemBalanceDto[];
  };
  linked_documents: LinkedDocumentDto[];
}

export interface GatePassListQuery {
  search?: string;
  status?: GatePassFilter;
  from?: string;
  to?: string;
}

export function useGatePasses(query: GatePassListQuery) {
  return useQuery({
    queryKey: queryKeys.gatePasses.list(query),
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: { rows: GatePassDto[]; counts: { total: number; available: number } } }>(
        '/gate-passes',
        { params: query },
      );
      return data.data;
    },
    placeholderData: keepPreviousData,
    ...LIVE_QUERY_OPTIONS,
  });
}

export function useGatePass(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.gatePasses.detail(id ?? ''),
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: GatePassDto }>(`/gate-passes/${id}`);
      return data.data;
    },
    enabled: !!id,
    ...LIVE_QUERY_OPTIONS,
  });
}

/** The customer's passes with material still to allocate (order forms). */
export function useAvailableGatePasses(phone: string, include?: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.gatePasses.available(`${phone}|${include ?? ''}`),
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: GatePassDto[] }>('/gate-passes/available', {
        params: { phone, include: include || undefined },
      });
      return data.data;
    },
    enabled,
    ...LIVE_QUERY_OPTIONS,
  });
}

export function useCreateGatePass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateGatePassDto) => {
      const { data } = await apiClient.post<{ data: GatePassDto }>('/gate-passes', dto);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gate-passes'] }),
  });
}
