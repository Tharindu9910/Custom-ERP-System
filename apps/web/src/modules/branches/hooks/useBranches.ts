import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import type { BranchConfig, BranchSummary, CreateBranchDto, UpdateBranchConfigDto, UpdateBranchDto } from '@erp/shared';

/** A row of GET /branches: details and module switches. Full settings: useBranchConfig. */
export type BranchDto = BranchSummary;
export type BranchConfigDto = BranchConfig;
export type UpdateBranchConfigPayload = UpdateBranchConfigDto;

export function useBranches() {
  return useQuery({
    queryKey: queryKeys.branches.all(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: BranchDto[] }>('/branches');
      return data.data;
    },
  });
}

/** Active branches for pickers, main first. Only global roles can list every branch. */
export function useBranchOptions(enabled = true) {
  return useQuery({
    queryKey: queryKeys.branches.all(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: BranchDto[] }>('/branches');
      return data.data;
    },
    select: (rows) => rows.filter((b) => b.is_active),
    enabled,
    staleTime: 60_000,
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
    onSuccess: () => invalidateBranch(qc, branchId),
  });
}

/** A branch edit can change the menus, so refresh its config, the list and the live branch context. */
function invalidateBranch(qc: ReturnType<typeof useQueryClient>, branchId: string) {
  void qc.invalidateQueries({ queryKey: queryKeys.branches.all() });
  void qc.invalidateQueries({ queryKey: queryKeys.branches.config(branchId) });
  void qc.invalidateQueries({ queryKey: queryKeys.branchContext(branchId) });
}

/** Moving the main flag changes two branches; refresh every branch context. */
function invalidateAllBranches(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: queryKeys.branches.all() });
  void qc.invalidateQueries({ queryKey: ['branch-context'] });
}

export type CreateBranchPayload = CreateBranchDto;
/** Send the version from the loaded branch; `is_main: true` moves the main flag here (Super Admin). */
export type UpdateBranchPayload = UpdateBranchDto;

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
    onSuccess: (_d, payload) => (payload.is_main ? invalidateAllBranches(qc) : invalidateBranch(qc, branchId)),
  });
}