// Single source of truth for VITE_* variables.
// No other file may use import.meta.env directly.

const API_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;
const APP_NAME = import.meta.env.VITE_APP_NAME as string | undefined;
const SSE_URL = import.meta.env.VITE_SSE_URL as string | undefined;

if (!API_URL) {
  throw new Error('[env] VITE_API_BASE_URL is required. Add it to apps/web/.env');
}

export const env = {
  API_URL,
  APP_NAME: APP_NAME ?? 'Saniro ERP',
  SSE_URL: SSE_URL ?? API_URL,
  GATE_PASS_BASE_URL:
    (import.meta.env.VITE_GATE_PASS_BASE_URL as string | undefined) ??
    `${API_URL}/gate-pass`,
  MAX_UPLOAD_MB: Number(import.meta.env.VITE_MAX_UPLOAD_SIZE_MB ?? 10),
  features: {
    notifications: import.meta.env.VITE_FEATURE_NOTIFICATIONS !== 'false',
    auditLog: import.meta.env.VITE_FEATURE_AUDIT_LOG !== 'false',
    reports: import.meta.env.VITE_FEATURE_REPORTS === 'true',
    offline: import.meta.env.VITE_FEATURE_OFFLINE !== 'false',
  },
} as const;