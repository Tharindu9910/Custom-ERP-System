import { useMemo } from 'react';
import { Role } from '@erp/shared';
import { useAuthStore } from '@/shared/stores/auth.store';
import { buildAbility } from '@/app/ability';

const EMPTY: string[] = [];

export function usePermission() {
  const user = useAuthStore((s) => s.user);
  const permissions = user?.permissions ?? EMPTY;
  const ability = useMemo(() => buildAbility(permissions), [permissions]);
  // SUPER_ADMIN bypasses all permission checks in code (mirrors backend PermissionsGuard)
  const isSuperAdmin = user?.role === Role.SUPER_ADMIN;

  return {
    can: (action: string, subject: string) => isSuperAdmin || ability.can(action, subject),
    cannot: (action: string, subject: string) => !isSuperAdmin && ability.cannot(action, subject),
    ability,
  };
}