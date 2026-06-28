import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Role } from '@erp/shared';
import { apiClient } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

export interface UserDto {
  user_id: string;
  username: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  branch_id: string | null;
  role: Role | null;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface CreateUserPayload {
  username: string;
  password: string;
  full_name: string;
  email?: string;
  phone?: string;
  branch_id?: string;
  role: Role;
}

export interface UpdateUserPayload {
  full_name?: string;
  email?: string;
  phone?: string;
  is_active?: boolean;
}

export interface AssignRolePayload {
  role: Role;
  branch_id?: string;
}

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users.all(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: UserDto[] }>('/users');
      return data.data;
    },
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateUserPayload) => {
      const { data } = await apiClient.post<{ data: UserDto }>('/users', payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users.all() }),
  });
}

export function useUpdateUser(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateUserPayload) => {
      const { data } = await apiClient.patch<{ data: UserDto }>(`/users/${userId}`, payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users.all() }),
  });
}

export function useAssignRole(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AssignRolePayload) => {
      await apiClient.patch(`/users/${userId}/role`, payload);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users.all() }),
  });
}