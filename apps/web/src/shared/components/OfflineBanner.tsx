import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import { Icon } from './Icon';

/** Offline intake is deferred (Docs/decisions/0001): say clearly that actions need a connection. */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="flex items-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white no-print">
      <Icon name="wifiOff" className="h-4 w-4" />
      You are offline. Saving and payments need a connection — the screen may show old data until you reconnect.
    </div>
  );
}
