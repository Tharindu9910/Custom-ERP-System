export const ERR = {

  // ── Auth ────────────────────────────────────────────────────────────────
  AUTH_INVALID_CREDENTIALS:     { code: 'AUTH_001', message: 'Invalid username or password' },
  AUTH_TOKEN_EXPIRED:           { code: 'AUTH_002', message: 'Token has expired' },
  AUTH_REFRESH_TOKEN_INVALID:   { code: 'AUTH_003', message: 'Refresh token is invalid or expired' },
  AUTH_INSUFFICIENT_PERMISSION: { code: 'AUTH_004', message: 'You do not have permission for this action' },
  AUTH_USER_INACTIVE:           { code: 'AUTH_005', message: 'This account has been deactivated' },

  // ── Rate limiting ────────────────────────────────────────────────────────
  RATE_LIMIT_EXCEEDED:          { code: 'RATE_001', message: 'Too many requests — please slow down' },

  // ── Job Cards ────────────────────────────────────────────────────────────
  // JOB_CARD_NOT_FOUND, JOB_CARD_INVALID_TRANSITION, JOB_CARD_BALANCE_NOT_ZERO,
  // JOB_CARD_VERSION_CONFLICT — defined when job-cards module is built

  // ── Work Orders ──────────────────────────────────────────────────────────
  // WORK_ORDER_NOT_FOUND, WORK_ORDER_NO_WORKER, WORK_ORDER_WORKER_BRANCH,
  // WORK_ORDER_INVALID_SPEC, WORK_ORDER_INVALID_TRANSITION — defined later

  // ── Payments ─────────────────────────────────────────────────────────────
  // PAYMENT_OFFLINE_BLOCKED, PAYMENT_ADVANCE_TOO_LOW — defined later

  // ── Inventory ────────────────────────────────────────────────────────────
  // STOCK_INSUFFICIENT — defined later

  // ── Customers ────────────────────────────────────────────────────────────
  // CUSTOMER_PHONE_EXISTS, CUSTOMER_NOT_FOUND — defined later

  // ── Workers ──────────────────────────────────────────────────────────────
  // WORKER_NOT_FOUND, WORKER_INACTIVE — defined later

  // ── Price List ───────────────────────────────────────────────────────────
  // PRICE_NOT_FOUND — defined later

  // ── Offline Sync ─────────────────────────────────────────────────────────
  // SYNC_EVENT_TOO_OLD, SYNC_PAYMENT_BLOCKED — defined later

} as const

export type ErrPayload = { code: string; message: string }