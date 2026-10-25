import { useQuery } from '@tanstack/react-query';
import { typeHasRoofing, typeHasWorkshop, type BranchSettings, type BranchType, type FeatureKey } from '@erp/shared';
import { apiClient } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { useAuthStore } from '@/shared/stores/auth.store';

export interface BranchContextDto {
  branch_id: string;
  code: string;
  name: string;
  branch_type: BranchType;
  is_active: boolean;
  stock_override_configured: boolean;
  settings: BranchSettings;
}

/** The working branch's type and settings — drives menus, pick-lists and form rules. */
export function useBranchContext() {
  const branchId = useAuthStore((s) => s.activeBranchId);
  const query = useQuery({
    queryKey: queryKeys.branchContext(branchId),
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: BranchContextDto }>('/branches/current');
      return data.data;
    },
    enabled: !!branchId,
    staleTime: 60_000,
  });
  const branch = query.data;
  return {
    ...query,
    branch,
    settings: branch?.settings,
    hasRoofing: branch ? typeHasRoofing(branch.branch_type) : false,
    hasWorkshop: branch ? typeHasWorkshop(branch.branch_type) : false,
    featureOn: (key: FeatureKey) => !!branch?.settings.features[key],
  };
}
