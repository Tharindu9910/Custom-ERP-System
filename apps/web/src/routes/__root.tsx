import { Outlet } from '@tanstack/react-router';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';

export function Root() {
  const isOnline = useOnlineStatus();

  return (
    <>
      {!isOnline && (
        <div className="no-print fixed inset-x-0 top-0 z-50 bg-amber-500 py-1 text-center text-sm font-medium text-white">
          You are offline — changes will be queued and synced when reconnected.
        </div>
      )}
      <Outlet />
    </>
  );
}