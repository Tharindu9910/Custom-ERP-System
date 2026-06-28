import { useEffect, useRef } from 'react';
import { env } from '@/env';
import { useAuthStore } from '@/shared/stores/auth.store';

interface UseSSEOptions<T> {
  path: string;
  onMessage: (data: T) => void;
  onError?: (err: Event) => void;
  enabled?: boolean;
  params?: Record<string, string>;
}

export function useSSE<T = unknown>({
  path,
  onMessage,
  onError,
  enabled = true,
  params,
}: UseSSEOptions<T>): void {
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onMessageRef.current = onMessage;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    if (!enabled) return;

    const token = useAuthStore.getState().accessToken;
    const base = path.startsWith('http') ? path : `${env.API_URL}${path}`;
    const search = new URLSearchParams(params);
    if (token) search.set('token', token);
    const url = `${base}?${search.toString()}`;

    const source = new EventSource(url);

    source.onmessage = (e: MessageEvent<string>) => {
      try {
        onMessageRef.current(JSON.parse(e.data) as T);
      } catch {
        // ignore malformed events
      }
    };

    source.onerror = (e) => {
      onErrorRef.current?.(e);
    };

    return () => source.close();
  }, [path, enabled, params]);
}