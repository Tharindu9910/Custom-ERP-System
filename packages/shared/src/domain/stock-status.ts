// One definition of stock health, used by Inventory, Stock Alerts and the
// stock_alert maintenance in StockService.

export type StockLevel = 'OUT' | 'LOW' | 'HEALTHY';

export const STOCK_LEVEL_LABEL: Record<StockLevel, string> = {
  OUT: 'Out of Stock',
  LOW: 'Low Stock',
  HEALTHY: 'Healthy',
};

/** Out = nothing left; Low = at or below the reorder level (inclusive). */
export function stockLevel(quantity: number, reorderLevel: number): StockLevel {
  if (quantity <= 0) return 'OUT';
  if (quantity <= reorderLevel) return 'LOW';
  return 'HEALTHY';
}

export type AlertSeverity = 'CRITICAL' | 'LOW' | 'NORMAL';

/** Stock Alerts view: severity plus how much is needed to get back to the reorder level. */
export function stockAlertInfo(quantity: number, reorderLevel: number): { severity: AlertSeverity; deficit: number } {
  const level = stockLevel(quantity, reorderLevel);
  if (level === 'OUT') return { severity: 'CRITICAL', deficit: reorderLevel };
  if (level === 'LOW') return { severity: 'LOW', deficit: Math.max(0, reorderLevel - quantity) };
  return { severity: 'NORMAL', deficit: 0 };
}

/** Quantity suggested when requesting an item from Inventory. */
export const suggestedRequestQty = (quantity: number, reorderLevel: number) => Math.max(1, reorderLevel - quantity);
