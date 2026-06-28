import { useMemo } from 'react';
import { useAuthStore } from '@/shared/stores/auth.store';
import { buildAbility } from '@/app/ability';

export function usePermission() {
  const permissions = useAuthStore((s) => s.user?.permissions ?? []);
  const ability = useMemo(() => buildAbility(permissions), [permissions]);

  return {
    can: (action: string, subject: string) => ability.can(action, subject),
    cannot: (action: string, subject: string) => ability.cannot(action, subject),
    ability,
  };
}