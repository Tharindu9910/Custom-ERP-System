import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

export interface BranchDto {
  branch_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

export interface BranchConfigDto {
  config_id: string;
  branch_id: string;
  min_advance_pct_customized: number;
  min_advance_pct_standard: number;
  stock_override_enabled: boolean;
  updated_at: string;
}

export interface UpdateBranchConfigPayload {
  min_advance_pct_customized?: number;
  min_advance_pct_standard?: number;
  stock_override_enabled?: boolean;
  stock_override_password?: string;
}

export function useBranches() {
  return useQuery({
    queryKey: queryKeys.branches.all(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: BranchDto[] }>('/branches');
      return data.data;
    },
  });
}

export function useBranchConfig(branchId: string) {
  return useQuery({
    queryKey: queryKeys.branches.config(branchId),
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: BranchConfigDto }>(`/branches/${branchId}/config`);
      return data.data;
    },
    enabled: !!branchId,
  });
}

export function useUpdateBranchConfig(branchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateBranchConfigPayload) => {
      const { data } = await apiClient.patch<{ data: BranchConfigDto }>(
        `/branches/${branchId}/config`,
        payload,
      );
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.branches.config(branchId) }),
  });
}

export interface CreateBranchPayload {
  name: string;
  address?: string;
  phone?: string;
}

export interface UpdateBranchPayload {
  name?: string;
  address?: string;
  phone?: string;
  is_active?: boolean;
}

export function useCreateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateBranchPayload) => {
      const { data } = await apiClient.post<{ data: BranchDto }>('/branches', payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.branches.all() }),
  });
}

export function useUpdateBranch(branchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateBranchPayload) => {
      const { data } = await apiClient.patch<{ data: BranchDto }>(`/branches/${branchId}`, payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.branches.all() }),
  });
}