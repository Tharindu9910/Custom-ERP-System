import { isGlobalRole } from '@erp/shared';
import { useAuthStore } from '@/shared/stores/auth.store';

/**
 * Global roles (Super Admin, Admin, Auditor) view branch work but never change it
 * (Docs/decisions/0002). Hides create / send / receive buttons; the API refuses them
 * anyway (GLOBAL_VIEW_ONLY).
 */
export function useCanTransact(): boolean {
  const user = useAuthStore((s) => s.user);
  return !!user && !isGlobalRole(user.role);
}
