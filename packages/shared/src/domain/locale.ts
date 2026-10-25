// "Today" means the branch's local day, never a UTC date (instructions §2.6).
export const BRANCH_TIMEZONE = 'Asia/Colombo';

/** Calendar date (YYYY-MM-DD) of an instant in the branch timezone. */
export function toBranchDate(date: Date | string = new Date(), timeZone: string = BRANCH_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(date),
  );
}

/** Digits only. */
export const phoneDigits = (phone: string) => phone.replace(/\D/g, '');

/**
 * Key used to match a customer's phone however it was typed (prototype rule):
 * the last 9 digits, so "077 123 4567" and "+94771234567" match.
 */
export const phoneKey = (phone: string) => phoneDigits(phone).slice(-9);

/** Searching by phone only starts once enough digits are typed to be meaningful. */
export const isSearchablePhone = (phone: string) => phoneDigits(phone).length >= 7;
