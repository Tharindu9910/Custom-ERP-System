import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import type { CustomerType } from '@erp/shared';

export interface CustomerDto {
  customer_id: string;
  branch_id: string | null;
  full_name: string;
  phone: string;
  customer_type: CustomerType;
  company_name: string | null;
  contact_person: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
}

export function useCustomerSearch(phone: string) {
  return useQuery({
    queryKey: queryKeys.customers.all({ phone }),
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: CustomerDto[] }>('/customers', {
        params: { phone },
      });
      return data.data;
    },
    enabled: phone.length >= 3,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { full_name: string; phone: string }) => {
      const { data } = await apiClient.post<{ data: CustomerDto }>('/customers', payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.customers.all() }),
  });
}

export function useUpdateCustomer(customerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      full_name?: string;
      email?: string;
      address?: string;
      customer_type?: CustomerType;
      company_name?: string;
      contact_person?: string;
    }) => {
      const { data } = await apiClient.patch<{ data: CustomerDto }>(
        `/customers/${customerId}`,
        payload,
      );
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.customers.all() });
      qc.invalidateQueries({ queryKey: queryKeys.customers.detail(customerId) });
    },
  });
}