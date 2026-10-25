import { useCallback, useEffect, useRef } from 'react';
import { useAuthStore } from '@/shared/stores/auth.store';

/**
 * Unfinished Create Job Card / Create Order forms are kept in sessionStorage, so
 * moving to another page (or refreshing) doesn't lose what was typed. Closing the
 * browser tab drops them. Keys are per user and branch, so a draft never shows up
 * for another login on a shared counter PC, and logout removes them all.
 * Passwords are never part of a draft.
 */
export type DraftForm = 'jobCard' | 'order';

const PREFIX = 'formDraft:';

function draftKey(form: DraftForm): string | null {
  const { user, activeBranchId } = useAuthStore.getState();
  return user ? `${PREFIX}${form}:${user.user_id}:${activeBranchId ?? 'none'}` : null;
}

export function readFormDraft<T>(form: DraftForm): T | null {
  const key = draftKey(form);
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearFormDraft(form: DraftForm): void {
  const key = draftKey(form);
  if (!key) return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* storage blocked: nothing was saved */
  }
}

/** Removes every saved form draft (logout). */
export function clearAllFormDrafts(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Saves `value` as the form's draft shortly after each change; an empty form removes
 * it. Returns `clear()`, which also stops a pending save from writing the old values back.
 */
export function useFormDraft<T>(form: DraftForm, value: T, opts: { enabled: boolean; isEmpty: (v: T) => boolean }): () => void {
  const { enabled } = opts;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Serialized once per render: the effect re-runs only when what would be saved changed
  const serialized = enabled && !opts.isEmpty(value) ? JSON.stringify(value) : null;
  const latest = useRef(serialized);

  const write = useCallback(() => {
    timer.current = null;
    const key = draftKey(form);
    if (!key) return;
    try {
      if (latest.current === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, latest.current);
    } catch {
      /* storage full or blocked: the form still works, it just isn't kept */
    }
  }, [form]);

  useEffect(() => {
    latest.current = serialized;
    if (!enabled) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(write, 300);
  }, [enabled, serialized, write]);

  // Leaving the page within the debounce window still keeps the latest values
  useEffect(
    () => () => {
      if (enabled && timer.current) {
        clearTimeout(timer.current);
        write();
      }
    },
    [enabled, write],
  );

  return useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    clearFormDraft(form);
  }, [form]);
}
