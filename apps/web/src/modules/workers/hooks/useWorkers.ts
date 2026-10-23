import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { useAuthStore } from '@/shared/stores/auth.store';

export interface WorkerDto {
  employee_id: string;
  branch_id: string;
  employee_code: string;
  full_name: string;
  designation: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

export function useWorkers() {
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  return useQuery({
    queryKey: queryKeys.workers.all({ branchId: activeBranchId }),
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: WorkerDto[] }>('/workers');
      return data.data;
    },
    enabled: !!activeBranchId,
  });
}

export function useCreateWorker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { full_name: string; designation?: string; phone?: string }) => {
      const { data } = await apiClient.post<{ data: WorkerDto }>('/workers', payload);
      return data.data;
    },
    onSuccess: () => invalidateWorkers(qc),
  });
}

export function useUpdateWorker(workerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      full_name?: string;
      designation?: string;
      phone?: string;
      is_active?: boolean;
    }) => {
      const { data } = await apiClient.patch<{ data: WorkerDto }>(`/workers/${workerId}`, payload);
      return data.data;
    },
    onSuccess: () => invalidateWorkers(qc),
  });
}

/** Workers are employees: also refresh the job-card worker picker and chief candidates. */
function invalidateWorkers(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: queryKeys.workers.all() });
  void qc.invalidateQueries({ queryKey: ['employees'] });
}
