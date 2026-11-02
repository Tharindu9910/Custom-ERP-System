import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useVisibleNav, OPERATIONAL_ROLES } from '@/app/navigation';
import { Icon } from '@/shared/components/Icon';
import { useAuthStore } from '@/shared/stores/auth.store';

/** "/" for operational roles goes straight to their first screen (supervisor → Gate Pass). */
export function HomePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { items, branchLoaded } = useVisibleNav();
  const operational = !!user && OPERATIONAL_ROLES.includes(user.role);
  const first = items[0];

  useEffect(() => {
    if (operational && branchLoaded && first) void navigate({ to: first.to, replace: true });
  }, [operational, branchLoaded, first, navigate]);

  if (operational) return <div className="py-24 text-center text-sm text-slate-400">Loading…</div>;
  return (
    <div className="flex flex-col items-center justify-center py-24 text-gray-400">
      <Icon name="barChart" className="h-12 w-12" />
      <p className="mt-4 text-lg font-medium text-gray-600">Dashboard — coming soon</p>
    </div>
  );
}

