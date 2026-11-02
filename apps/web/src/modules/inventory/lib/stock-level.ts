import type { StockLevel } from '@erp/shared';

/** Free-stock text colour by level (numbers in the stock tables and popups). */
export const LEVEL_TEXT: Record<StockLevel, string> = { OUT: 'text-red-600', LOW: 'text-amber-600', HEALTHY: 'text-slate-900' };
