import { useEffect, useRef } from 'react';
import { useOfflineStore } from '@/shared/stores/offline.store';
import { useOnlineStatus } from './useOnlineStatus';
import { apiClient } from '@/shared/api/client';

export function useOfflineSync(): { isSyncing: boolean; queueLength: number } {
  const isOnline = useOnlineStatus();
  const isSyncing = useOfflineStore((s) => s.isSyncing);
  const queueLength = useOfflineStore((s) => s.queue.length);
  const prevOnlineRef = useRef(isOnline);

  useEffect(() => {
    const cameOnline = !prevOnlineRef.current && isOnline;
    prevOnlineRef.current = isOnline;

    if (!cameOnline) return;

    const { queue, dequeue, incrementRetry, setIsSyncing } =
      useOfflineStore.getState();
    if (queue.length === 0) return;

    const flush = async () => {
      setIsSyncing(true);
      try {
        const { data } = await apiClient.post<{
          data: { accepted: string[] };
        }>('/offline-sync/flush', { events: queue });

        (data.data?.accepted ?? []).forEach(dequeue);
      } catch {
        queue.forEach((e) => incrementRetry(e.event_id));
      } finally {
        setIsSyncing(false);
      }
    };

    void flush();
  }, [isOnline]);

  return { isSyncing, queueLength };
}