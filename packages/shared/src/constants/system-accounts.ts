export const SYSTEM_ACCOUNTS = {
  ACCOUNTS_RECEIVABLE: { code: '1100', name: 'Accounts Receivable' },
  CASH_ON_HAND: { code: '1200', name: 'Cash on Hand' },
  ADVANCE_PAYMENTS_RECEIVED: { code: '2100', name: 'Advance Payments Received' },
  SERVICE_REVENUE: { code: '4000', name: 'Service Revenue' },
  MATERIAL_REVENUE: { code: '4100', name: 'Material Revenue' },
  MATERIAL_COST: { code: '5100', name: 'Material Cost' },
  CANCELLED_JOB_LOSS: { code: '5200', name: 'Cancelled Job Loss' },
} as const;

export type SystemAccountCode =
  (typeof SYSTEM_ACCOUNTS)[keyof typeof SYSTEM_ACCOUNTS]['code'];
