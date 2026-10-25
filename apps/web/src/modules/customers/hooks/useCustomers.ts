import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import type { CustomerType } from '@erp/shared';

export interface CustomerDto {
  customer_id: string;
  home_branch_id: string | null;
  name: string;
  phone: string;
  customer_type: CustomerType;
  company_name: string | null;
  contact_person: string | null;
  email: string | null;
  address: string | null;
  created_by: string | null;
  completed_by: string | null;
  created_at: string;
  completed_at: string | null;
}

/** Newest customers in the user's branch; `term` filters by name or phone. */
export function useCustomers(term: string) {
  return useQuery({
    queryKey: queryKeys.customers.all({ q: term }),
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: CustomerDto[] }>('/customers', { params: { q: term || undefined } });
      return data.data;
    },
    placeholderData: keepPreviousData,
  });
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

/** Phone autocomplete for intake forms: kicks in once 3 digits are typed. */
export function useCustomerPhoneSuggestions(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return useQuery({
    queryKey: queryKeys.customers.all({ phone: digits, limit: 8 }),
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: CustomerDto[] }>('/customers', {
        params: { phone: digits, limit: 8 },
      });
      return data.data;
    },
    enabled: digits.length >= 3,
    placeholderData: keepPreviousData,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; phone: string }) => {
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
      name?: string;
      email?: string;
      address?: string;
      customer_type?: CustomerType;
      company_name?: string | null;
      contact_person?: string | null;
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