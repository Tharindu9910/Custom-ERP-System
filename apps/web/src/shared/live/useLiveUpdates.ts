import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isGlobalRole } from '@erp/shared';
import { env } from '@/env';
import { apiClient } from '@/shared/api/client';
import { LIVE_TOPIC_KEYS } from '@/shared/api/query-keys';
import { useAuthStore } from '@/shared/stores/auth.store';

export type LiveState = 'connecting' | 'live' | 'offline';

/**
 * One live-updates stream per tab (mounted in Layout). The server sends a small
 * "changed" nudge; we refetch the matching queries. The token never goes in the
 * URL — we swap it for a single-use ticket first. Reconnects with backoff, and
 * refetches everything live on reconnect so nothing stale is shown as current.
 */
export function useLiveUpdates(): LiveState {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const branchId = useAuthStore((s) => s.activeBranchId);
  const [state, setState] = useState<LiveState>('connecting');

  // Head office on "All branches" streams every branch (the server sends all when no branch is given)
  const global = !!user && isGlobalRole(user.role);

  useEffect(() => {
    if (!user || (!branchId && !global)) return;
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let cancelled = false;

    const refetchAll = () => {
      for (const keys of Object.values(LIVE_TOPIC_KEYS)) keys.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
    };

    const connect = async () => {
      if (cancelled) return;
      setState('connecting');
      try {
        const { data } = await apiClient.post<{ data: { ticket: string } }>('/events/ticket');
        if (cancelled) return;
        source = new EventSource(`${env.API_URL}/events/stream?ticket=${encodeURIComponent(data.data.ticket)}`);
        source.onopen = () => {
          if (attempt > 0) refetchAll();
          attempt = 0;
          setState('live');
        };
        source.addEventListener('changed', (e) => {
          try {
            const { topic } = JSON.parse((e as MessageEvent<string>).data) as { topic: string };
            (LIVE_TOPIC_KEYS[topic] ?? []).forEach((k) => void qc.invalidateQueries({ queryKey: k }));
          } catch {
            // ignore malformed events
          }
        });
        source.onerror = () => {
          source?.close();
          retry();
        };
      } catch {
        retry();
      }
    };

    const retry = () => {
      if (cancelled) return;
      setState('offline');
      attempt += 1;
      timer = setTimeout(connect, Math.min(30_000, 1_000 * 2 ** attempt));
    };

    void connect();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      source?.close();
    };
  }, [user, branchId, global, qc]);

  return state;
}

/** Fallback polling for live screens — slow on purpose; SSE does the fast path. */
export const LIVE_QUERY_OPTIONS = {
  refetchInterval: 60_000,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  staleTime: 5_000,
} as const;
