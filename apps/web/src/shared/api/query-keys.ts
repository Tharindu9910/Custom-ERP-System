/**
 * Appends params only when given, so `x.all()` is the bare root and prefix-matches
 * every cached variant on invalidation (a trailing `undefined` would match none).
 */
const withParams = <R extends readonly unknown[]>(root: R, params?: object): R | readonly [...R, object] =>
  params === undefined ? root : [...root, params];

export const queryKeys = {
  auth: {
    me: () => ['auth', 'me'] as const,
    permissions: () => ['auth', 'permissions'] as const,
  },
  users: {
    all: (params?: object) => withParams(['users'] as const, params),
    detail: (id: string) => ['users', id] as const,
  },
  permissions: {
    all: () => ['permissions'] as const,
    matrix: () => ['permissions', 'matrix'] as const,
  },
  branches: {
    all: () => ['branches'] as const,
    detail: (id: string) => ['branches', id] as const,
    config: (id: string) => ['branches', id, 'config'] as const,
  },
  customers: {
    all: (params?: object) => withParams(['customers'] as const, params),
    detail: (id: string) => ['customers', id] as const,
  },
  workers: {
    all: (params?: object) => withParams(['workers'] as const, params),
    detail: (id: string) => ['workers', id] as const,
  },
  branchContext: (branchId: string | null) => ['branch-context', branchId] as const,
  employees: {
    active: (params?: object) => withParams(['employees', 'active'] as const, params),
    withoutAccount: (params?: object) => withParams(['employees', 'without-account'] as const, params),
  },
  gatePasses: {
    list: (params?: object) => withParams(['gate-passes', 'list'] as const, params),
    detail: (id: string) => ['gate-passes', 'detail', id] as const,
    available: (phone: string) => ['gate-passes', 'available', phone] as const,
    materials: () => ['gate-passes', 'materials'] as const,
  },
  orders: {
    detail: (id: string) => ['orders', 'detail', id] as const,
    quote: (body: object) => ['orders', 'quote', body] as const,
  },
  /** History popup on the Create pages. Not a live topic: it refetches only when opened or filtered. */
  orderHistory: (type: 'job-cards' | 'roofing-orders', params?: object) => withParams(['order-history', type] as const, params),
  workshopQueue: (params?: object) => withParams(['workshop-queue'] as const, params),
  roofingQueue: (params?: object) => withParams(['roofing-queue'] as const, params),
  cashierQueue: () => ['cashier-queue'] as const,
  /** Hardware sales (Docs/decisions/0006): the store's catalogue with one branch's stock, and the cashier board */
  hardwareStore: (branchId?: string) => withParams(['hardware-store'] as const, branchId ? { branchId } : undefined),
  hardwareQueue: () => ['hardware-queue'] as const,
  items: {
    coils: () => ['items', 'coils'] as const,
    search: (params?: object) => withParams(['items', 'search'] as const, params),
  },
  inventory: {
    list: (params?: object) => withParams(['inventory', 'list'] as const, params),
    item: (id: string, branchId?: string) => ['inventory', 'item', id, branchId ?? 'active'] as const,
  },
  /** Head-office (all branches) reads — Docs/decisions/0002 */
  network: {
    inventory: (params?: object) => withParams(['network', 'inventory'] as const, params),
    stockAlerts: (params?: object) => withParams(['network', 'stock-alerts'] as const, params),
    transfers: (params?: object) => withParams(['network', 'stock-transfers'] as const, params),
  },
  stockAlerts: (params?: object) => withParams(['stock-alerts'] as const, params),
  priceList: {
    rates: (params?: object) => withParams(['price-list', 'rates'] as const, params),
    items: (params?: object) => withParams(['price-list', 'items'] as const, params),
  },
  stockTransfers: {
    list: (params?: object) => withParams(['stock-transfers', 'list'] as const, params),
    detail: (id: string) => ['stock-transfers', 'detail', id] as const,
    targets: () => ['stock-transfers', 'targets'] as const,
  },
};

/** Live-update topic (from the API) → query roots to refetch. */
export const LIVE_TOPIC_KEYS: Record<string, readonly (readonly string[])[]> = {
  orders: [['orders'], ['workshop-queue'], ['roofing-queue'], ['cashier-queue'], ['hardware-queue'], ['gate-passes']],
  payments: [['orders'], ['workshop-queue'], ['roofing-queue'], ['cashier-queue'], ['hardware-queue']],
  gate_passes: [['gate-passes']],
  stock: [['inventory'], ['stock-alerts'], ['items'], ['network'], ['hardware-store']],
  transfers: [['stock-transfers'], ['inventory'], ['stock-alerts'], ['network']],
  // Role Permissions saved: refresh my grants (menu, route guards) and any open matrix
  permissions: [['auth', 'me'], ['permissions']],
  // Price List saved: refresh the list and re-quote any open order form
  prices: [['price-list'], ['orders', 'quote'], ['hardware-store']],
};
