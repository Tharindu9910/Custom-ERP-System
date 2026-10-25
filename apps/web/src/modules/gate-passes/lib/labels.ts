const LABEL: Record<string, string> = {
  OPEN: 'Open',
  RESERVED: 'Reserved',
  PARTIALLY_ASSIGNED: 'Partially Assigned',
  FULLY_ASSIGNED: 'Fully Assigned',
  CLOSED: 'Closed',
};

export const gatePassStatusLabel = (s: string) => LABEL[s] ?? s;
