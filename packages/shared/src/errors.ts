// Single source of truth for API error codes and messages.
// The API throws these (apps/api/src/common/errors.ts re-exports them) and the
// web switches on `code` to offer the right follow-up (e.g. stock override).

export const ERR = {
  // ── Auth ────────────────────────────────────────────────────────────────
  AUTH_INVALID_CREDENTIALS: { code: 'AUTH_001', message: 'Invalid username or password' },
  AUTH_TOKEN_EXPIRED: { code: 'AUTH_002', message: 'Token has expired' },
  AUTH_REFRESH_TOKEN_INVALID: { code: 'AUTH_003', message: 'Refresh token is invalid or expired' },
  AUTH_INSUFFICIENT_PERMISSION: { code: 'AUTH_004', message: 'You do not have permission for this action' },
  AUTH_USER_INACTIVE: { code: 'AUTH_005', message: 'This account has been deactivated' },
  AUTH_PASSWORD_CHANGE_REQUIRED: { code: 'AUTH_006', message: 'Change your password to continue' },
  AUTH_TEMP_PASSWORD_EXPIRED: {
    code: 'AUTH_007',
    message: 'Your temporary password has expired — ask your supervisor for a new one',
  },
  AUTH_CURRENT_PASSWORD_WRONG: { code: 'AUTH_008', message: 'Current password is incorrect' },
  AUTH_SSE_TICKET_INVALID: { code: 'AUTH_009', message: 'Live updates ticket is invalid or expired' },

  // ── Validation & generic ────────────────────────────────────────────────
  VALIDATION_FAILED: { code: 'VAL_001', message: 'Some fields are invalid' },
  BRANCH_CONTEXT_REQUIRED: { code: 'CTX_001', message: 'Select a branch first' },
  FEATURE_DISABLED: { code: 'CTX_002', message: 'This feature is turned off for this branch' },
  GLOBAL_VIEW_ONLY: { code: 'CTX_003', message: 'Head-office accounts can view branch work but not change it — branch staff make changes' },
  GLOBAL_ROLE_REQUIRED: { code: 'CTX_004', message: 'Only head-office accounts can see all branches' },
  RATE_LIMIT_EXCEEDED: { code: 'RATE_001', message: 'Too many requests — please slow down' },

  // ── Orders (job cards & roofing) ────────────────────────────────────────
  ORDER_NOT_FOUND: { code: 'ORD_001', message: 'Order not found' },
  ORDER_INVALID_TRANSITION: { code: 'ORD_002', message: 'This status change is not allowed' },
  ORDER_VERSION_CONFLICT: { code: 'ORD_003', message: 'This order was changed by someone else — refresh and try again' },
  ORDER_LOCKED: { code: 'ORD_004', message: 'Work has started on this order, so it can no longer be edited' },
  ORDER_NOT_PAID: { code: 'ORD_005', message: 'The minimum advance has not been paid yet' },
  ORDER_BALANCE_DUE: { code: 'ORD_006', message: 'There is still a balance due — collect it at the cashier first' },
  ORDER_SUPERVISOR_ACTIVE: { code: 'ORD_007', message: 'A Supervisor is active. Coordinate with them to modify this record.' },
  ORDER_GATE_PASS_REQUIRED: { code: 'ORD_008', message: 'This branch requires a gate pass for customer-supplied material' },
  ORDER_ITEM_INCOMPLETE: { code: 'ORD_009', message: 'An order item is incomplete' },
  ORDER_DISCOUNT_TOO_HIGH: { code: 'ORD_010', message: 'Discount is higher than the allowed limit' },
  ORDER_WRONG_TYPE: { code: 'ORD_011', message: 'This action does not apply to this kind of order' },
  LINE_NOT_FOUND: { code: 'ORD_012', message: 'Order line not found' },
  ORDER_CUSTOMER_MATERIAL_DISABLED: { code: 'ORD_013', message: 'This branch does not accept customer-supplied material' },
  WORKER_NOT_IN_BRANCH: { code: 'ORD_014', message: 'A selected worker is inactive or belongs to another branch' },
  ORDER_EDIT_DISABLED: { code: 'ORD_015', message: 'The branch manager has turned off editing placed orders' },
  ORDER_COIL_INVALID: { code: 'ORD_016', message: 'The selected coil is not available at this branch' },
  ORDER_NOT_READY: { code: 'ORD_017', message: 'The order is not ready yet — complete the work first' },

  // ── Pricing ─────────────────────────────────────────────────────────────
  PRICE_MISSING_RATE: { code: 'PRC_001', message: 'No standard rate found — enter a custom price' },
  PRICE_ROOFING_RATE_MISSING: { code: 'PRC_002', message: 'A rate is missing — ask the branch manager to add it in Order Settings' },

  // ── Payments ────────────────────────────────────────────────────────────
  PAYMENT_OFFLINE_BLOCKED: { code: 'PAY_001', message: 'Payments cannot be processed offline' },
  PAYMENT_BELOW_MINIMUM: { code: 'PAY_002', message: 'The payment is below the minimum required' },
  PAYMENT_ABOVE_BALANCE: { code: 'PAY_003', message: 'The payment is more than the balance due' },
  PAYMENT_REFERENCE_REQUIRED: { code: 'PAY_004', message: 'A reference number is required for card and transfer payments' },
  PAYMENT_MODE_NOT_ALLOWED: { code: 'PAY_005', message: 'This payment method is not enabled for the branch' },
  PAYMENT_ORDER_CLOSED: { code: 'PAY_006', message: 'Payments cannot be recorded on a released or cancelled order' },

  // ── Gate passes & allocations ───────────────────────────────────────────
  GATE_PASS_NOT_FOUND: { code: 'GP_001', message: 'Gate pass not found' },
  GATE_PASS_ITEM_NOT_FOUND: { code: 'GP_002', message: 'Gate pass item not found' },
  GATE_PASS_CUSTOMER_MISMATCH: { code: 'GP_003', message: 'This gate pass belongs to a different customer' },
  ALLOCATION_INSUFFICIENT: { code: 'ALC_001', message: 'Not enough material left on the gate pass' },
  ALLOCATION_EXPIRED: { code: 'ALC_002', message: 'The material reservation expired — allocate again' },

  // ── Inventory ───────────────────────────────────────────────────────────
  STOCK_INSUFFICIENT: { code: 'STK_001', message: 'Not enough stock for this operation' },
  STOCK_OVERRIDE_PASSWORD_WRONG: { code: 'STK_002', message: 'The stock override password is incorrect' },
  STOCK_ITEM_NOT_FOUND: { code: 'STK_003', message: 'Item not found' },
  STOCK_OVERRIDE_DISABLED: { code: 'STK_004', message: 'Stock override is not enabled for this branch' },

  // ── Stock transfers ─────────────────────────────────────────────────────
  TRANSFER_NOT_FOUND: { code: 'TRF_001', message: 'Stock request not found' },
  TRANSFER_INVALID_STATE: { code: 'TRF_002', message: 'This stock request can no longer be changed' },
  TRANSFER_DUPLICATE_ITEM: { code: 'TRF_003', message: 'An item already has an open request from this branch' },
  TRANSFER_QTY_OVER: { code: 'TRF_004', message: 'A quantity is more than allowed' },
  TRANSFER_NOTHING_SENT: { code: 'TRF_005', message: 'Send at least one item' },
  TRANSFER_SAME_BRANCH: { code: 'TRF_006', message: 'Choose a different branch to ask' },
  TRANSFER_DATE_PAST: { code: 'TRF_007', message: 'The needed-by date cannot be in the past' },
  TRANSFER_LINE_UNKNOWN: { code: 'TRF_008', message: 'A line does not belong to this stock request' },
  TRANSFER_BRANCH_UNAVAILABLE: { code: 'TRF_009', message: 'That branch is not taking stock requests' },
  TRANSFER_WRONG_BRANCH: { code: 'TRF_010', message: 'Only the other branch on this request can do that' },

  // ── Customers ───────────────────────────────────────────────────────────
  CUSTOMER_PHONE_EXISTS: { code: 'CUS_001', message: 'A customer with this phone number already exists' },
  CUSTOMER_NOT_FOUND: { code: 'CUS_002', message: 'Customer not found' },
  CUSTOMER_COMPANY_REQUIRED: { code: 'CUS_003', message: 'Company name is required for business customers' },

  // ── Workers / employees ─────────────────────────────────────────────────
  WORKER_NOT_FOUND: { code: 'WRK_001', message: 'Worker not found' },
  WORKER_INACTIVE: { code: 'WRK_002', message: 'Worker is inactive and cannot be assigned' },
  EMPLOYEE_HAS_ACCOUNT: { code: 'WRK_003', message: 'This employee already has a login' },

  // ── Users ───────────────────────────────────────────────────────────────
  USER_NOT_FOUND: { code: 'USR_001', message: 'User not found' },
  USER_ROLE_CONFLICT: { code: 'USR_002', message: 'User already has an active role — deactivate it first' },
  USER_USERNAME_EXISTS: { code: 'USR_003', message: 'A user with this username already exists' },
  USER_ROLE_BRANCH_REQUIRED: { code: 'USR_004', message: 'This role must be assigned to a branch' },
  USER_ROLE_BRANCH_FORBIDDEN: { code: 'USR_006', message: 'Head-office roles are not tied to a branch — leave the branch empty' },
  USER_EMAIL_EXISTS: { code: 'USR_005', message: 'A user with this email already exists' },

  // ── Branches ────────────────────────────────────────────────────────────
  BRANCH_NOT_FOUND: { code: 'BR_001', message: 'Branch not found' },
  BRANCH_CODE_EXISTS: { code: 'BR_002', message: 'A branch with this code already exists' },
  BRANCH_SETTINGS_INVALID: { code: 'BR_003', message: 'Branch settings are invalid' },
  BRANCH_MAIN_REQUIRED: { code: 'BR_004', message: 'There must always be a main branch — make another branch main instead' },
  BRANCH_MAIN_INACTIVE: { code: 'BR_005', message: 'The main branch must be active' },

  // ── Permissions ─────────────────────────────────────────────────────────
  PERMISSION_NOT_FOUND: { code: 'PRM_001', message: 'Permission not found' },

  // ── Attachments ─────────────────────────────────────────────────────────
  ATTACHMENT_NOT_FOUND: { code: 'ATT_001', message: 'Attachment not found' },
  ATTACHMENT_INVALID: { code: 'ATT_002', message: 'Upload a JPEG, PNG or WebP image under 5 MB' },

  // ── Offline sync ────────────────────────────────────────────────────────
  SYNC_EVENT_TOO_OLD: { code: 'SYNC_001', message: 'Event is too old to sync — please re-enter manually' },
  SYNC_PAYMENT_BLOCKED: { code: 'SYNC_002', message: 'Payment events cannot be queued offline' },
} as const;

export type ErrKey = keyof typeof ERR;
export type ErrPayload = { code: string; message: string; details?: unknown };
export type ErrCode = (typeof ERR)[ErrKey]['code'];

/** Codes only, for switch statements on the client. */
export const ERR_CODES = Object.fromEntries(Object.entries(ERR).map(([k, v]) => [k, v.code])) as {
  [K in ErrKey]: (typeof ERR)[K]['code'];
};

/** Attach details (e.g. available qty, override_allowed) to an error payload. */
export const errWith = (err: { code: string; message: string }, details: unknown, message?: string): ErrPayload => ({
  code: err.code,
  message: message ?? err.message,
  details,
});
