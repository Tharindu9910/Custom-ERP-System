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
  /** Create Job Card page tab (default: create) */
  tab?: 'create' | 'history';
}

export const validateJobCardSearch = (s: Record<string, unknown>): JobCardSearch => ({
  gatePass: typeof s.gatePass === 'string' ? s.gatePass : undefined,
  tab: s.tab === 'history' ? 'history' : undefined,
});

export interface WorkshopQueueSearch {
  notice?: string;
  /** Job card open on the in-page Check & Hand Over */
  handover?: string;
}

export const validateWorkshopQueueSearch = (s: Record<string, unknown>): WorkshopQueueSearch => ({
  notice: typeof s.notice === 'string' ? s.notice : undefined,
  handover: typeof s.handover === 'string' ? s.handover : undefined,
});

export interface CashierQueueSearch {
  /** Order open on the in-page checkout */
  checkout?: string;
}

export const validateCashierQueueSearch = (s: Record<string, unknown>): CashierQueueSearch => ({
  checkout: typeof s.checkout === 'string' ? s.checkout : undefined,
});

export interface OrderFormSearch {
  /** Gate pass to allocate from (from the Gate Pass screen) */
  gatePass?: string;
  /** Create Order page tab (default: create) */
  tab?: 'create' | 'history';
  /** Shown after an unpaid order was edited from History */
  notice?: string;
}

export const validateOrderFormSearch = (s: Record<string, unknown>): OrderFormSearch => ({
  gatePass: typeof s.gatePass === 'string' ? s.gatePass : undefined,
  tab: s.tab === 'history' ? 'history' : undefined,
  notice: typeof s.notice === 'string' ? s.notice : undefined,
});

export interface OrderQueueSearch {
  notice?: string;
  /** Order open on the in-page Check & Release */
  release?: string;
}

export const validateOrderQueueSearch = (s: Record<string, unknown>): OrderQueueSearch => ({
  release: typeof s.release === 'string' ? s.release : undefined,
  notice: typeof s.notice === 'string' ? s.notice : undefined,
});

/** Stock Requests status cards (Docs/decisions/0012). */
export type StockRequestTab = 'toSend' | 'toReceive' | 'shortages' | 'waiting' | 'history';

export interface StockRequestSearch {
  tab?: StockRequestTab;
  /** Opens the New Request popup */
  new?: boolean;
  /** Items handed over from Restock ("More options"), "itemId:qty,…" */
  items?: string;
}

// Links from before the status cards keep working
const OLD_TABS: Record<string, StockRequestTab> = { todo: 'toSend', toUs: 'toSend', ours: 'waiting' };
const TABS: StockRequestTab[] = ['toSend', 'toReceive', 'shortages', 'waiting', 'history'];

export const validateStockRequestSearch = (s: Record<string, unknown>): StockRequestSearch => ({
  tab: typeof s.tab === 'string' ? (TABS.includes(s.tab as StockRequestTab) ? (s.tab as StockRequestTab) : OLD_TABS[s.tab]) : undefined,
  new: s.new === true || s.new === 1 || s.new === '1' || s.tab === 'create' || undefined,
  items: typeof s.items === 'string' ? s.items : undefined,
});
