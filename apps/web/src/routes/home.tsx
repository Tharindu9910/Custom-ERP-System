import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useVisibleNav, OPERATIONAL_ROLES } from '@/app/navigation';
import { Icon } from '@/shared/components/Icon';
import { useAuthStore } from '@/shared/stores/auth.store';

/** "/" for operational roles goes straight to their first screen (supervisor → Gate Pass). */
export function HomePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { main, branchLoaded } = useVisibleNav();
  const operational = !!user && OPERATIONAL_ROLES.includes(user.role);

  useEffect(() => {
    if (operational && branchLoaded && main.length > 0) void navigate({ to: main[0].to, replace: true });
  }, [operational, branchLoaded, main, navigate]);

  if (operational) return <div className="py-24 text-center text-sm text-slate-400">Loading…</div>;
  return (
    <div className="flex flex-col items-center justify-center py-24 text-gray-400">
      <Icon name="barChart" className="h-12 w-12" />
      <p className="mt-4 text-lg font-medium text-gray-600">Dashboard — coming soon</p>
    </div>
  );
}

