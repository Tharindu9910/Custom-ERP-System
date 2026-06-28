import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Role } from '@erp/shared';
import { apiClient } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

export interface PermissionDef {
  permission_id: string;
  action: string;
  module: string;
  description: string | null;
  is_system: boolean;
}

export interface RolePermissionsDto {
  role: Role;
  permissions: {
    permission_id: string;
    action: string;
    module: string;
    granted: boolean;
  }[];
}

export interface UpdateRolePermissionsPayload {
  role: Role;
  updates: { permission_id: string; granted: boolean }[];
}

export function useAllPermissions() {
  return useQuery({
    queryKey: queryKeys.permissions.all(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: PermissionDef[] }>('/permissions');
      return data.data;
    },
  });
}

export function usePermissionsMatrix() {
  return useQuery({
    queryKey: queryKeys.permissions.matrix(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: RolePermissionsDto[] }>('/permissions/roles');
      return data.data;
    },
  });
}

export function useUpdateRolePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateRolePermissionsPayload) => {
      await apiClient.patch('/permissions/roles', payload);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.permissions.matrix() }),
  });
}