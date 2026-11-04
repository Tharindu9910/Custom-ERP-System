// One definition of stock health, used by Stock Levels, Restock and the
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

/**
 * Stock still free for new work: on hand, minus what open orders hold, minus what they
 * booked beyond stock with an override. Alerts and levels use this, so a job card that
 * books the sheets raises the alert on save, not when work starts (Docs/decisions/0009).
 */
export function freeStock(quantity: number, reserved: number, shortfall = 0): number {
  return Math.round((quantity - reserved - shortfall) * 1000) / 1000;
}

export type AlertSeverity = 'CRITICAL' | 'LOW' | 'NORMAL';

/**
 * Restock view: severity plus how much is needed to get back to the reorder level.
 * Free stock can be below zero (booked beyond stock with an override); that gap is needed too.
 */
export function stockAlertInfo(quantity: number, reorderLevel: number): { severity: AlertSeverity; deficit: number } {
  const level = stockLevel(quantity, reorderLevel);
  if (level === 'OUT') return { severity: 'CRITICAL', deficit: Math.round((reorderLevel - Math.min(0, quantity)) * 1000) / 1000 };
  if (level === 'LOW') return { severity: 'LOW', deficit: Math.round(Math.max(0, reorderLevel - quantity) * 1000) / 1000 };
  return { severity: 'NORMAL', deficit: 0 };
}

/** Quantity suggested when requesting an item. */
export const suggestedRequestQty = (quantity: number, reorderLevel: number) => Math.max(1, reorderLevel - quantity);
