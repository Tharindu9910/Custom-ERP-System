import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePriceRateDto,
  ItemPriceQuery,
  ItemPriceView,
  PriceRateQuery,
  PriceRateView,
  UpdateItemPriceDto,
  UpdatePriceRateDto,
} from '@erp/shared';
import { apiClient } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';

// One price list for every branch (Docs/decisions/0004) — no branch in any key.

export function usePriceRates(params: PriceRateQuery) {
  return useQuery({
    queryKey: queryKeys.priceList.rates(params),
    queryFn: async () => (await apiClient.get<{ data: PriceRateView[] }>('/price-list/rates', { params })).data.data,
    placeholderData: keepPreviousData,
  });
}

export function useItemPrices(params: ItemPriceQuery) {
  return useQuery({
    queryKey: queryKeys.priceList.items(params),
    queryFn: async () => (await apiClient.get<{ data: ItemPriceView[] }>('/price-list/items', { params })).data.data,
    placeholderData: keepPreviousData,
  });
}

export function useCreateRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreatePriceRateDto) =>
      (await apiClient.post<{ data: PriceRateView }>('/price-list/rates', payload)).data.data,
    onSuccess: () => invalidatePrices(qc),
  });
}

export function useUpdateRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: UpdatePriceRateDto & { id: string }) =>
      (await apiClient.patch<{ data: PriceRateView }>(`/price-list/rates/${id}`, payload)).data.data,
    onSuccess: () => invalidatePrices(qc),
  });
}

export function useUpdateItemPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: UpdateItemPriceDto & { id: string }) =>
      (await apiClient.patch<{ data: ItemPriceView }>(`/price-list/items/${id}`, payload)).data.data,
    onSuccess: () => invalidatePrices(qc),
  });
}

/** A price change also re-quotes any open order form. */
function invalidatePrices(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['price-list'] });
  void qc.invalidateQueries({ queryKey: ['orders', 'quote'] });
}
