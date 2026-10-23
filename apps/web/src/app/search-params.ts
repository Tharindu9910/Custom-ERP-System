// Typed search params for routes (kept out of component files for fast refresh).

export interface GatePassSearch {
  tab?: 'create' | 'queue';
  /** Set when an order form sent the user here to record material first */
  return_to?: 'job-card' | 'order';
  phone?: string;
  name?: string;
}

export function validateGatePassSearch(s: Record<string, unknown>): GatePassSearch {
  return {
    tab: s.tab === 'queue' ? 'queue' : s.tab === 'create' ? 'create' : undefined,
    return_to: s.return_to === 'job-card' || s.return_to === 'order' ? s.return_to : undefined,
    phone: typeof s.phone === 'string' ? s.phone : undefined,
    name: typeof s.name === 'string' ? s.name : undefined,
  };
}

export interface JobCardSearch {
  /** Gate pass to allocate from (from the Gate Pass screen) */
  gatePass?: string;
}

export const validateJobCardSearch = (s: Record<string, unknown>): JobCardSearch => ({
  gatePass: typeof s.gatePass === 'string' ? s.gatePass : undefined,
});

export interface WorkshopQueueSearch {
  notice?: string;
}

export const validateWorkshopQueueSearch = (s: Record<string, unknown>): WorkshopQueueSearch => ({
  notice: typeof s.notice === 'string' ? s.notice : undefined,
});

export interface OrderFormSearch {
  /** Gate pass to allocate from (from the Gate Pass screen) */
  gatePass?: string;
}

export const validateOrderFormSearch = (s: Record<string, unknown>): OrderFormSearch => ({
  gatePass: typeof s.gatePass === 'string' ? s.gatePass : undefined,
});

export interface OrderQueueSearch {
  notice?: string;
}

export const validateOrderQueueSearch = (s: Record<string, unknown>): OrderQueueSearch => ({
  notice: typeof s.notice === 'string' ? s.notice : undefined,
});

export type StockRequestTab = 'create' | 'toUs' | 'ours';

export interface StockRequestSearch {
  tab?: StockRequestTab;
  /** Items handed over from Inventory / Stock Alerts, "itemId:qty,…" */
  items?: string;
}

export const validateStockRequestSearch = (s: Record<string, unknown>): StockRequestSearch => ({
  tab: s.tab === 'create' || s.tab === 'toUs' || s.tab === 'ours' ? s.tab : undefined,
  items: typeof s.items === 'string' ? s.items : undefined,
});
