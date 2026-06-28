import { Outlet, Link, useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '@/shared/stores/auth.store';
import { apiClient } from '@/shared/api/client';
import { env } from '@/env';

const NAV_ITEMS = [
  { label: 'Dashboard', to: '/', icon: '⊞' },
  { label: 'Job Cards', to: '/job-cards', icon: '📋' },
  { label: 'Work Orders', to: '/work-orders', icon: '🔧' },
  { label: 'Customers', to: '/customers', icon: '👤' },
  { label: 'Workers', to: '/workers', icon: '👷' },
  { label: 'Inventory', to: '/inventory', icon: '📦' },
  { label: 'Gate Pass', to: '/gate-pass', icon: '🚪' },
  { label: 'Finance', to: '/finance', icon: '💰' },
  { label: 'Reports', to: '/reports', icon: '📊' },
] as const;

export function Layout() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // best-effort
    }
    logout();
    void navigate({ to: '/login' });
  };

  return (
    <div className="flex h-screen bg-gray-100 no-print">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col bg-gray-900 text-gray-200 no-print">
        <div className="px-4 py-5">
          <span className="text-base font-semibold text-white">
            {env.APP_NAME}
          </span>
        </div>

        <nav className="flex-1 space-y-0.5 px-2 py-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white [&.active]:bg-gray-700 [&.active]:text-white"
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-gray-700 px-4 py-3">
          <p className="truncate text-xs font-medium text-gray-200">
            {user?.name}
          </p>
          <p className="truncate text-xs text-gray-500">{user?.username}</p>
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
          <div />
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize">
              {user?.role}
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