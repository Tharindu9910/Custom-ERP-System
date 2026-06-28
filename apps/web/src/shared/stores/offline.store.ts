import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PendingEvent {
  event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  branch_id: string;
  queued_at: string;
  retries: number;
}

interface OfflineState {
  queue: PendingEvent[];
  isSyncing: boolean;
  enqueue: (event: PendingEvent) => void;
  dequeue: (eventId: string) => void;
  incrementRetry: (eventId: string) => void;
  clearAll: () => void;
  setIsSyncing: (v: boolean) => void;
}

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set) => ({
      queue: [],
      isSyncing: false,
      enqueue: (event) => set((s) => ({ queue: [...s.queue, event] })),
      dequeue: (eventId) =>
        set((s) => ({
          queue: s.queue.filter((e) => e.event_id !== eventId),
        })),
      incrementRetry: (eventId) =>
        set((s) => ({
          queue: s.queue.map((e) =>
            e.event_id === eventId ? { ...e, retries: e.retries + 1 } : e,
          ),
        })),
      clearAll: () => set({ queue: [] }),
      setIsSyncing: (isSyncing) => set({ isSyncing }),
    }),
    { name: 'erp-offline-queue' },
  ),
);