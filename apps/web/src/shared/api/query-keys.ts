export const queryKeys = {
  auth: {
    me: () => ['auth', 'me'] as const,
    permissions: () => ['auth', 'permissions'] as const,
  },
  customers: {
    all: (params?: object) => ['customers', params] as const,
    detail: (id: string) => ['customers', id] as const,
  },
  workers: {
    all: (params?: object) => ['workers', params] as const,
    detail: (id: string) => ['workers', id] as const,
  },
  jobCards: {
    all: (params?: object) => ['job-cards', params] as const,
    detail: (id: string) => ['job-cards', id] as const,
    statusLog: (id: string) => ['job-cards', id, 'status-log'] as const,
  },
  workOrders: {
    all: (params?: object) => ['work-orders', params] as const,
    detail: (id: string) => ['work-orders', id] as const,
    byJobCard: (jobCardId: string) =>
      ['work-orders', 'by-job-card', jobCardId] as const,
  },
  priceList: {
    all: (branchId?: string) => ['price-list', branchId] as const,
  },
  inventory: {
    items: (params?: object) => ['inventory', 'items', params] as const,
    item: (id: string) => ['inventory', 'items', id] as const,
    alerts: () => ['inventory', 'alerts'] as const,
  },
  payments: {
    byJobCard: (jobCardId: string) =>
      ['payments', 'by-job-card', jobCardId] as const,
  },
  branches: {
    all: () => ['branches'] as const,
    detail: (id: string) => ['branches', id] as const,
  },
  gatePass: {
    all: (params?: object) => ['gate-pass', params] as const,
    detail: (id: string) => ['gate-pass', id] as const,
  },
};