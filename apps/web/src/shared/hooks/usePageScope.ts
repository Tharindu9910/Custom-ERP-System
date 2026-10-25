import { useRouterState } from '@tanstack/react-router';
import { isGlobalRole } from '@erp/shared';
import { pageInfo } from '@/app/navigation';
import { useAuthStore } from '@/shared/stores/auth.store';

/** The current page's scope (global / network / branch) and whether the user is head office. */
export function usePageScope() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const user = useAuthStore((s) => s.user);
  return { ...pageInfo(pathname), isGlobal: !!user && isGlobalRole(user.role) };
}
