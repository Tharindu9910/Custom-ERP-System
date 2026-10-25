import { isAxiosError } from 'axios';

export interface ApiErrorInfo {
  status: number | null;
  code: string;
  message: string;
  details?: unknown;
}

/** Normalises any thrown value into the API's `{ error: { code, message, details } }` shape. */
export function apiError(err: unknown): ApiErrorInfo {
  if (isAxiosError(err)) {
    const body = err.response?.data as { error?: { code?: string; message?: string; details?: unknown } } | undefined;
    if (!err.response) {
      return { status: null, code: 'NETWORK', message: 'No connection to the server. Check the network and try again.' };
    }
    return {
      status: err.response.status,
      code: body?.error?.code ?? 'UNKNOWN',
      message: body?.error?.message ?? err.message,
      details: body?.error?.details,
    };
  }
  return { status: null, code: 'UNKNOWN', message: err instanceof Error ? err.message : 'Something went wrong' };
}

/** A client-generated id for idempotent creates (safe to retry). */
export const newRequestId = () => crypto.randomUUID();
