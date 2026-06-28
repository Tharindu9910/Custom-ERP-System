import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/api/client';
import { useAuthStore, type AuthUser } from '@/shared/stores/auth.store';
import { queryKeys } from '@/shared/api/query-keys';

/**
 * Keeps the Zustand auth store in sync with the server's permission state.
 *
 * Mounted in Layout (always active while authenticated). Re-fetches GET /auth/me
 * on window focus so that when a Super Admin grants or revokes a role's permissions,
 * affected users see the sidebar update without re-logging in.
 *
 * The 403 interceptor in client.ts also invalidates this query so revocations are
 * caught immediately when the user tries to call a now-forbidden endpoint.
 */
export function useMe() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const query = useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: AuthUser }>('/auth/me');
      return data.data;
    },
    enabled: !!user,
    // staleTime: 0 → data is always considered stale, so every window-focus
    // event triggers a re-fetch regardless of how recently we last fetched.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!query.data || !user) return;

    const fresh = query.data;

    const permsChanged =
      fresh.permissions.length !== user.permissions.length ||
      fresh.permissions.some((p) => !user.permissions.includes(p));

    const roleChanged = fresh.role !== user.role;
    const branchChanged = fresh.branch_id !== user.branch_id;

    if (permsChanged || roleChanged || branchChanged) {
      setUser(fresh);
    }
  }, [query.data, user, setUser]);

  return query;
}
