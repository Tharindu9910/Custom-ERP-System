import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { AlertSeverity, InventoryQuery, ItemType, MovementType, OpenRequestInfo, StockAlertQuery, StockLevel } from '@erp/shared';
import { apiClient } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { LIVE_QUERY_OPTIONS } from '@/shared/live/useLiveUpdates';

export interface StockRowDto {
  item_id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  item_type: ItemType;
  /** On hand; health and alerts are based on this */
  stock: number;
  /** Held for open orders until their work starts */
  reserved: number;
  /** On hand minus reserved */
  available: number;
  reorder_level: number;
  level: StockLevel;
  open_request: OpenRequestInfo | null;
}

export interface MovementDto {
  movement_id: string;
  movement_type: MovementType;
  quantity: number;
  quantity_after: number;
  reason: string | null;
  document_number: string | null;
  created_by_name: string | null;
  moved_at: string;
}

export interface ReservationDto {
  reservation_id: string;
  order_id: string;
  order_number: string;
  line_number: string;
  quantity: number;
  shortfall: number;
  created_at: string;
}

export interface AlertRowDto extends StockRowDto {
  severity: AlertSeverity;
  deficit: number;
}

export interface InventoryList {
  rows: StockRowDto[];
  counts: { all: number; healthy: number; low: number; out: number };
  categories: string[];
}

export interface AlertList {
  rows: AlertRowDto[];
  counts: { needs_restock: number; critical: number; low: number; healthy: number };
  categories: string[];
}

export function useInventory(query: Partial<InventoryQuery>) {
  return useQuery({
    queryKey: queryKeys.inventory.list(query),
    queryFn: async () => (await apiClient.get<{ data: InventoryList }>('/inventory', { params: query })).data.data,
    placeholderData: keepPreviousData,
    ...LIVE_QUERY_OPTIONS,
  });
}

/**
 * Own-branch stock, open request and recent movements for the details popup.
 * `branchId` is for head office opening one branch's cell from the all-branches table.
 */
export function useInventoryItem(itemId: string | null, branchId?: string) {
  return useQuery({
    queryKey: queryKeys.inventory.item(itemId ?? '', branchId),
    queryFn: async () =>
      (
        await apiClient.get<{ data: StockRowDto & { movements: MovementDto[]; reservations: ReservationDto[] } }>(`/inventory/${itemId}`, {
          headers: branchId ? { 'X-Branch-Id': branchId } : undefined,
        })
      ).data.data,
    enabled: !!itemId,
  });
}

export function useStockAlerts(query: Partial<StockAlertQuery>) {
  return useQuery({
    queryKey: queryKeys.stockAlerts(query),
    queryFn: async () => (await apiClient.get<{ data: AlertList }>('/stock-alerts', { params: query })).data.data,
    placeholderData: keepPreviousData,
    ...LIVE_QUERY_OPTIONS,
  });
}

// ── Head office: all branches (global roles only) ─────────────────────────────

export interface NetworkBranchDto {
  branch_id: string;
  code: string;
  name: string;
  is_main: boolean;
}

export interface NetworkStockRowDto {
  item_id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  item_type: ItemType;
  total: number;
  /** Worst level at any branch */
  level: StockLevel;
  stocks: Record<string, { stock: number; reorder_level: number; level: StockLevel }>;
}

export interface NetworkInventoryList {
  branches: NetworkBranchDto[];
  rows: NetworkStockRowDto[];
  counts: InventoryList['counts'];
  categories: string[];
}

export interface NetworkAlertRowDto extends AlertRowDto {
  branch: NetworkBranchDto;
  /** What the main branch holds (null at the main branch itself) */
  main_stock: number | null;
}

export interface NetworkAlertList {
  branches: NetworkBranchDto[];
  rows: NetworkAlertRowDto[];
  counts: AlertList['counts'];
  categories: string[];
}

export function useNetworkInventory(query: Partial<InventoryQuery>) {
  return useQuery({
    queryKey: queryKeys.network.inventory(query),
    queryFn: async () => (await apiClient.get<{ data: NetworkInventoryList }>('/network/inventory', { params: query })).data.data,
    placeholderData: keepPreviousData,
    ...LIVE_QUERY_OPTIONS,
  });
}

export function useNetworkStockAlerts(query: Partial<StockAlertQuery>) {
  return useQuery({
    queryKey: queryKeys.network.stockAlerts(query),
    queryFn: async () => (await apiClient.get<{ data: NetworkAlertList }>('/network/stock-alerts', { params: query })).data.data,
    placeholderData: keepPreviousData,
    ...LIVE_QUERY_OPTIONS,
  });
}
