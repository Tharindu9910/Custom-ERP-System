export const ERR = {
  // ── Auth ────────────────────────────────────────────────────────────────
  AUTH_INVALID_CREDENTIALS: {
    code: 'AUTH_001',
    message: 'Invalid username or password',
  },
  AUTH_TOKEN_EXPIRED: {
    code: 'AUTH_002',
    message: 'Token has expired',
  },
  AUTH_REFRESH_TOKEN_INVALID: {
    code: 'AUTH_003',
    message: 'Refresh token is invalid or expired',
  },
  AUTH_INSUFFICIENT_PERMISSION: {
    code: 'AUTH_004',
    message: 'You do not have permission for this action',
  },
  AUTH_USER_INACTIVE: {
    code: 'AUTH_005',
    message: 'This account has been deactivated',
  },

  // ── Rate Limiting ────────────────────────────────────────────────────────
  RATE_LIMIT_EXCEEDED: {
    code: 'RATE_001',
    message: 'Too many requests — please slow down',
  },

  // ── Job Cards ────────────────────────────────────────────────────────────
  JOB_CARD_NOT_FOUND: {
    code: 'JC_001',
    message: 'Job card not found',
  },
  JOB_CARD_INVALID_TRANSITION: {
    code: 'JC_002',
    message: 'This status change is not allowed',
  },
  JOB_CARD_BALANCE_NOT_ZERO: {
    code: 'JC_003',
    message: 'Balance must be zero before closing',
  },
  JOB_CARD_VERSION_CONFLICT: {
    code: 'JC_004',
    message: 'Job card was modified by someone else — please refresh',
  },

  // ── Work Orders ──────────────────────────────────────────────────────────
  WORK_ORDER_NOT_FOUND: {
    code: 'WO_001',
    message: 'Work order not found',
  },
  WORK_ORDER_NO_WORKER: {
    code: 'WO_002',
    message: 'At least one worker must be assigned',
  },
  WORK_ORDER_WORKER_BRANCH: {
    code: 'WO_003',
    message: 'Worker does not belong to this branch',
  },
  WORK_ORDER_INVALID_SPEC: {
    code: 'WO_004',
    message: 'Work order spec is invalid for this type',
  },
  WORK_ORDER_INVALID_TRANSITION: {
    code: 'WO_005',
    message: 'This status change is not allowed',
  },

  // ── Payments ─────────────────────────────────────────────────────────────
  PAYMENT_OFFLINE_BLOCKED: {
    code: 'PAY_001',
    message: 'Payments cannot be processed offline',
  },
  PAYMENT_ADVANCE_TOO_LOW: {
    code: 'PAY_002',
    message: 'Advance does not meet the minimum requirement',
  },

  // ── Inventory ────────────────────────────────────────────────────────────
  STOCK_INSUFFICIENT: {
    code: 'INV_001',
    message: 'Insufficient stock for this operation',
  },

  // ── Price List ───────────────────────────────────────────────────────────
  PRICE_NOT_FOUND: {
    code: 'PL_001',
    message: 'No price entry found — work order set to customized',
  },

  // ── Customers ────────────────────────────────────────────────────────────
  CUSTOMER_PHONE_EXISTS: {
    code: 'CUS_001',
    message: 'A customer with this phone number already exists',
  },
  CUSTOMER_NOT_FOUND: {
    code: 'CUS_002',
    message: 'Customer not found',
  },

  // ── Workers ──────────────────────────────────────────────────────────────
  WORKER_NOT_FOUND: {
    code: 'WRK_001',
    message: 'Worker not found',
  },
  WORKER_INACTIVE: {
    code: 'WRK_002',
    message: 'Worker is inactive and cannot be assigned',
  },

  // ── Offline Sync ─────────────────────────────────────────────────────────
  SYNC_EVENT_TOO_OLD: {
    code: 'SYNC_001',
    message: 'Event is too old to sync — please re-enter manually',
  },
  SYNC_PAYMENT_BLOCKED: {
    code: 'SYNC_002',
    message: 'Payment events cannot be queued offline',
  },
} as const;

export type ErrPayload = {
  code: string;
  message: string;
};
