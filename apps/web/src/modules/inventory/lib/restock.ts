import type { StatusStep } from '@/shared/components/StatusBoard';
import { TONES } from '@/shared/lib/status-tones';
import type { AlertRowDto } from '../hooks/useInventory';

export type RestockStep = 'TODO' | 'REQUESTED' | 'ON_THE_WAY';

// Odoo Replenishment's flow for one branch: below minimum → asked for → on the way (Docs/decisions/0012)
export const RESTOCK_STEPS: StatusStep<RestockStep>[] = [
  { key: 'TODO', title: 'To restock', icon: 'alertTriangle', empty: 'Every item is above its minimum, or already asked for.', tone: TONES.amber },
  { key: 'REQUESTED', title: 'Requested', icon: 'clock', empty: 'No request is waiting for the other branch.', tone: TONES.slate },
  { key: 'ON_THE_WAY', title: 'On the way', icon: 'truck', empty: 'Nothing is on the way.', tone: TONES.blue },
];

/** Splits Restock's rows into its three steps. */
export function restockLists<T extends AlertRowDto>(rows: T[], requested: T[]): Record<RestockStep, T[]> {
  return {
    TODO: rows,
    REQUESTED: requested.filter((r) => r.open_request?.status !== 'SENT'),
    ON_THE_WAY: requested.filter((r) => r.open_request?.status === 'SENT'),
  };
}

export const outNote = (rows: AlertRowDto[]) => {
  const out = rows.filter((r) => r.severity === 'CRITICAL').length;
  return out > 0 ? `${out} out of stock` : undefined;
};
