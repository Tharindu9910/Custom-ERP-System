import { BRANCH_TIMEZONE } from '@erp/shared';

// All money formatting lives here. Money is stored as integer cents everywhere else.
// NEVER divide by 100 outside this file.

export function formatMoney(cents: number, currency = 'LKR'): string {
  return new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function parseMoney(value: string): number {
  const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''));
  return isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-LK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

/** A calendar date stored as YYYY-MM-DD, shown without any timezone shift. */
export function formatLocalDate(ymd: string | null | undefined): string {
  if (!ymd) return '—';
  return formatDate(new Date(`${ymd}T00:00:00`));
}

/** A moment (e.g. created_at) as date + time in branch time, whatever the PC clock is set to. */
export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-LK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BRANCH_TIMEZONE,
  }).format(new Date(date));
}

export function formatRelativeTime(date: string | Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatDate(date);
}

export function formatWeight(grams: number): string {
  return grams >= 1000
    ? `${(grams / 1000).toFixed(2)} kg`
    : `${grams} g`;
}
/** Cents → plain rupee string for an editable input (e.g. 12550 → "125.5"). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return String(cents / 100);
}

/** Short rupee amount used across the supervisor screens, e.g. "Rs 1,250.00". */
export function formatRs(cents: number): string {
  return `Rs ${(cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
