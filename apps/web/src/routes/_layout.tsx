import { Outlet, Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Role } from '@erp/shared';
import { useAuthStore } from '@/shared/stores/auth.store';
import { usePermission } from '@/shared/hooks/usePermission';
import { useMe } from '@/shared/hooks/useMe';
import { apiClient } from '@/shared/api/client';
import { queryClient } from '@/app/query-client';
import { queryKeys } from '@/shared/api/query-keys';
import { env } from '@/env';

interface NavItem {
  label: string;
  to: string;
  icon: string;
  permission?: { action: string; subject: string };
}

interface BranchOption {
  branch_id: string;
  name: string;
  is_active: boolean;
}

const MAIN_NAV: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: '⊞' },
  { label: 'Cashier Queue', to: '/cashier-queue', icon: '🎫', permission: { action: 'process', subject: 'payment' } },
  { label: 'Job Cards', to: '/job-cards', icon: '📋', permission: { action: 'update', subject: 'job_card_status' } },
  { label: 'Customers', to: '/customers', icon: '👤', permission: { action: 'create', subject: 'job_card' } },
  { label: 'Inventory', to: '/inventory', icon: '📦', permission: { action: 'override', subject: 'stock' } },
  { label: 'Finance', to: '/ledger', icon: '💰', permission: { action: 'view', subject: 'financial_report' } },
  { label: 'Audit Log', to: '/audit-log', icon: '🔍', permission: { action: 'view', subject: 'audit_log' } },
];

const SETTINGS_NAV: NavItem[] = [
  { label: 'Branch Config', to: '/settings/branch-config', icon: '🏢', permission: { action: 'configure', subject: 'branch' } },
  { label: 'Users', to: '/settings/users', icon: '👥', permission: { action: 'manage', subject: 'users' } },
  { label: 'Workers', to: '/settings/workers', icon: '🪪', permission: { action: 'manage', subject: 'workers' } },
];

// Items exclusive to Super Admin — rendered in a separate sidebar section
const SUPER_ADMIN_NAV: NavItem[] = [
  { label: 'All Branches', to: '/settings/branches', icon: '🏬' },
  { label: 'Role Permissions', to: '/settings/permissions', icon: '🔐' },
];

const CROSS_BRANCH_ROLES: Role[] = [Role.SUPER_ADMIN, Role.MANAGER];

function NavLink({ item }: { item: NavItem }) {
  return (
    <Link
      to={item.to}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white [&.active]:bg-gray-700 [&.active]:text-white"
    >
      <span className="w-4 text-center">{item.icon}</span>
      {item.label}
    </Link>
  );
}

export function Layout() {
  const navigate = useNavigate();
  const { user, logout, activeBranchId, setActiveBranchId } = useAuthStore();
  const { can } = usePermission();
  const isSuperAdmin = user?.role === Role.SUPER_ADMIN;
  const isCrossBranchRole = user ? CROSS_BRANCH_ROLES.includes(user.role) : false;

  // Keeps permissions in Zustand fresh: re-fetches GET /auth/me on window focus
  // so sidebar updates without re-login after SA grants/revokes permissions.
  useMe();

  const { data: branches = [] } = useQuery<BranchOption[]>({
    queryKey: queryKeys.branches.all(),
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: BranchOption[] }>('/branches');
      return data.data;
    },
    enabled: isCrossBranchRole,
  });

  const handleBranchChange = (branchId: string) => {
    setActiveBranchId(branchId);
    // Clear all cached branch-scoped data so the new branch loads fresh
    queryClient.clear();
  };

  const handleLogout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // best-effort
    }
    logout();
    void navigate({ to: '/login' });
  };

  const visibleMain = MAIN_NAV.filter((item) =>
    !item.permission || can(item.permission.action, item.permission.subject),
  );

  const visibleSettings = SETTINGS_NAV.filter((item) =>
    !item.permission || can(item.permission.action, item.permission.subject),
  );

  return (
    <div className="flex h-screen bg-gray-100 no-print">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col bg-gray-900 text-gray-200 no-print">
        <div className="px-4 py-5">
          <span className="text-base font-semibold text-white">{env.APP_NAME}</span>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
          {visibleMain.map((item) => (
            <NavLink key={item.to} item={item} />
          ))}

          {visibleSettings.length > 0 && (
            <>
              <div className="mt-4 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Settings
              </div>
              {visibleSettings.map((item) => (
                <NavLink key={item.to} item={item} />
              ))}
            </>
          )}

          {isSuperAdmin && (
            <>
              <div className="mt-4 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Super Admin
              </div>
              {SUPER_ADMIN_NAV.map((item) => (
                <NavLink key={item.to} item={item} />
              ))}
            </>
          )}
        </nav>

        <div className="border-t border-gray-700 px-4 py-3">
          <p className="truncate text-xs font-medium text-gray-200">{user?.name}</p>
          <p className="truncate text-xs text-gray-500">{user?.username}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-300">
              {user?.role?.replace('_', ' ')}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="mt-2 text-xs text-gray-400 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b bg-white px-6 py-3 no-print">
          {/* Branch picker — only for cross-branch roles (SUPER_ADMIN, MANAGER) */}
          {isCrossBranchRole ? (
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500">Branch</label>
              <select
                value={activeBranchId ?? ''}
                onChange={(e) => handleBranchChange(e.target.value)}
                className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400"
              >
                <option value="" disabled>Select branch…</option>
                {branches.filter((b) => b.is_active).map((b) => (
                  <option key={b.branch_id} value={b.branch_id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3 text-sm text-gray-600">
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium">
              {user?.role?.replace('_', ' ')}
            </span>
            <span>{user?.name}</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}