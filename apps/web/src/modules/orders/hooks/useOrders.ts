import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateJobCardDto,
  OrderHistoryQuery,
  LineStatus,
  OrderPaymentState,
  OrderStatus,
  OrderType,
  PricedWorkshopLine,
  RecordPaymentDto,
  StockOverride,
  UpdateJobCardDto,
  WorkshopDisplayStatus,
  WorkshopLineInput,
  WorkshopQueueFilter,
} from '@erp/shared';
import { apiClient } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import { LIVE_QUERY_OPTIONS } from '@/shared/live/useLiveUpdates';

export interface WorkerRef {
  employee_id: string;
  full_name: string;
  employee_code: string;
}

export interface OrderLineDto {
  line_id: string;
  line_number: string;
  line_no: number;
  line_type: string;
  sub_type: string | null;
  status: LineStatus;
  status_label: string;
  material_source: 'BRANCH' | 'CUSTOMER';
  item_id: string | null;
  item_name: string | null;
  item_unit: string | null;
  spec: Record<string, unknown>;
  quantity: number | null;
  price_basis: string | null;
  unit_price: number;
  line_total: number;
  is_customized: boolean;
  customized_reason_code: string | null;
  work_info: string | null;
  notes: string | null;
  completed_at: string | null;
  version: number;
  workers: WorkerRef[];
  started_at: string | null;
  started_by: string | null;
  inspected_by: string | null;
}

export interface Milestone {
  at: string | null;
  by: string | null;
  note?: string | null;
}

export interface OrderMilestones {
  placed: Milestone;
  started: Milestone;
  completed: Milestone;
  released: Milestone;
  cancelled: Milestone | null;
}

export interface OrderDetailDto {
  order_id: string;
  order_number: string;
  order_type: OrderType;
  status: OrderStatus;
  display_status: string;
  display_label: string;
  version: number;
  customer: { customer_id: string; name: string; phone: string } | null;
  header: Record<string, string | undefined>;
  subtotal: number;
  discount: number;
  total: number;
  paid_amount: number;
  balance: number;
  payment_state: OrderPaymentState;
  min_advance: number;
  created_at: string;
  created_by: string;
  created_by_name: string | null;
  released_to: string | null;
  released_at: string | null;
  released_by_name: string | null;
  release_notes: string | null;
  can_edit: boolean;
  /** Roofing timeline; null for job cards */
  milestones: OrderMilestones | null;
  workers: WorkerRef[];
  lines: OrderLineDto[];
  gate_pass: { gate_pass_id: string; pass_number: string } | null;
  customer_materials: {
    gp_item_id: string;
    material_type: string;
    thickness: string | null;
    length: number | null;
    length_unit: string | null;
    color: string | null;
    quantity: number;
    pass_number: string;
  }[];
  payments: {
    payment_id: string;
    kind: string;
    mode: string;
    amount: number;
    reference_number: string | null;
    receipt_no: string;
    paid_at: string;
    received_by_name: string | null;
  }[];
  history: {
    history_id: string;
    line_id: string | null;
    line_number: string | null;
    event_type: string;
    from_status: string | null;
    to_status: string | null;
    result: string | null;
    note: string | null;
    actor_name: string | null;
    actor_role: string | null;
    created_at: string;
  }[];
}

export interface WorkshopQueueRow {
  order_id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  job_date: string;
  created_at: string;
  status: OrderStatus;
  display_status: WorkshopDisplayStatus;
  display_label: string;
  line_count: number;
  completed_count: number;
  total: number;
  paid_amount: number;
  min_advance: number;
  payment_state: OrderPaymentState;
  version: number;
  can_edit: boolean;
}

export interface QuoteResult {
  lines: PricedWorkshopLine[];
  subtotal: number;
  min_advance: number;
  missing_rates: { line_index: number; missing: string }[];
}

export interface CashierQueueRow {
  order_id: string;
  order_number: string;
  order_type: OrderType;
  status: OrderStatus;
  display_label: string;
  customer_name: string | null;
  customer_phone: string | null;
  total: number;
  paid_amount: number;
  balance: number;
  min_advance: number;
  advance_due: number;
  line_count: number;
  created_at: string;
  version: number;
}

export const invalidateOrders = (qc: ReturnType<typeof useQueryClient>) => {
  // order-history is only marked stale here; it refetches when the History popup is next open
  for (const key of [['orders'], ['workshop-queue'], ['roofing-queue'], ['cashier-queue'], ['gate-passes'], ['inventory'], ['stock-alerts'], ['order-history']]) {
    void qc.invalidateQueries({ queryKey: key });
  }
};

export interface OrderHistoryRowDto {
  order_id: string;
  order_number: string;
  date: string;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  created_by_name: string | null;
  item_count: number;
  total: number;
  paid_amount: number;
  balance: number;
  status: OrderStatus;
  display_label: string;
}

export interface OrderHistoryPage {
  rows: OrderHistoryRowDto[];
  total: number;
  page: number;
  page_size: number;
}

/**
 * One page of job cards / roofing orders for the History popup. Fetches only while
 * the popup is open, keeps the last page on screen while the next loads, and does
 * not poll or refetch on focus: one request per filter or page change.
 */
export function useOrderHistory(type: 'job-cards' | 'roofing-orders', query: OrderHistoryQuery, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.orderHistory(type, query),
    queryFn: async () => (await apiClient.get<{ data: OrderHistoryPage }>(`/${type}/history`, { params: query })).data.data,
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useOrderDetail(orderId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.orders.detail(orderId ?? ''),
    queryFn: async () => (await apiClient.get<{ data: OrderDetailDto }>(`/orders/${orderId}`)).data.data,
    enabled: !!orderId,
    ...LIVE_QUERY_OPTIONS,
  });
}

/** Live price preview for the job card form (same pricing as the save). */
export function useJobCardQuote(lines: WorkshopLineInput[]) {
  return useQuery({
    queryKey: queryKeys.orders.quote({ type: 'job-card', lines }),
    queryFn: async () => (await apiClient.post<{ data: QuoteResult }>('/job-cards/quote', { lines })).data.data,
    enabled: lines.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useCreateJobCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateJobCardDto) => (await apiClient.post<{ data: OrderDetailDto }>('/job-cards', dto)).data.data,
    onSuccess: () => invalidateOrders(qc),
  });
}

export function useUpdateJobCard(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: UpdateJobCardDto) =>
      (await apiClient.put<{ data: OrderDetailDto & { advance_shortfall: number } }>(`/job-cards/${orderId}`, dto)).data.data,
    onSuccess: () => invalidateOrders(qc),
  });
}

export function useVoidJobCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) =>
      (await apiClient.post<{ data: OrderDetailDto }>(`/job-cards/${orderId}/void`, { reason })).data.data,
    onSuccess: () => invalidateOrders(qc),
  });
}

export function useWorkshopQueue(params: { status: WorkshopQueueFilter; date?: string; search?: string }) {
  return useQuery({
    queryKey: queryKeys.workshopQueue(params),
    queryFn: async () =>
      (
        await apiClient.get<{
          data: { rows: WorkshopQueueRow[]; counts: { total: number; awaiting_payment: number; pending: number; in_progress: number; completed: number } };
        }>('/workshop-queue', { params })
      ).data.data,
    placeholderData: keepPreviousData,
    ...LIVE_QUERY_OPTIONS,
  });
}

export function useLineAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { lineId: string; action: 'start' | 'complete'; version: number; override?: StockOverride }) =>
      (
        await apiClient.post<{ data: OrderDetailDto }>(`/order-lines/${p.lineId}/${p.action}`, {
          version: p.version,
          ...(p.override ? { override: p.override } : {}),
        })
      ).data.data,
    onSuccess: (detail) => {
      qc.setQueryData(queryKeys.orders.detail(detail.order_id), detail);
      invalidateOrders(qc);
    },
  });
}

export function useCashierQueue() {
  return useQuery({
    queryKey: queryKeys.cashierQueue(),
    queryFn: async () => (await apiClient.get<{ data: CashierQueueRow[] }>('/cashier-queue')).data.data,
    ...LIVE_QUERY_OPTIONS,
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, dto }: { orderId: string; dto: RecordPaymentDto }) =>
      (await apiClient.post<{ data: OrderDetailDto }>(`/orders/${orderId}/payments`, dto)).data.data,
    onSuccess: () => invalidateOrders(qc),
  });
}

export function useActiveWorkers() {
  return useQuery({
    queryKey: queryKeys.employees.active(),
    queryFn: async () =>
      (await apiClient.get<{ data: { employee_id: string; full_name: string; employee_code: string; designation: string | null }[] }>('/workers', {
        params: { active: 'true' },
      })).data.data,
    staleTime: 60_000,
  });
}
