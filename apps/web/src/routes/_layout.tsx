import { Fragment, type ReactNode } from 'react';
import { Outlet, Link, Navigate, useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import { Role, isGlobalRole } from '@erp/shared';
import { SUPER_ADMIN_NAV, isNavItemActive, pageRunsAt, useVisibleNav, type NavItem } from '@/app/navigation';
import { useAuthStore } from '@/shared/stores/auth.store';
import { useMe } from '@/shared/hooks/useMe';
import { useBranchContext } from '@/shared/hooks/useBranchContext';
import { usePageScope } from '@/shared/hooks/usePageScope';
import { useLiveUpdates, type LiveState } from '@/shared/live/useLiveUpdates';
import { apiClient } from '@/shared/api/client';
import { queryClient } from '@/app/query-client';
import { useBranchOptions } from '@/modules/branches/hooks/useBranches';
import { useStockAlertCount } from '@/modules/inventory/hooks/useInventory';
import { useStockRequestCount } from '@/modules/stock-transfers/hooks/useStockTransfers';
import { useItemRequestCount } from '@/modules/items/hooks/useItemRequests';
import { usePermission } from '@/shared/hooks/usePermission';
import { EmptyState } from '@/shared/components/EmptyState';
import { Icon } from '@/shared/components/Icon';
import { branchOptionLabel } from '@/shared/lib/branch';
import { OfflineBanner } from '@/shared/components/OfflineBanner';
import { cn } from '@/shared/lib/utils';
import { env } from '@/env';

const BRANCH_TYPE_LABEL: Record<string, string> = {
  ROOFING: 'Roofing',
  WORKSHOP: 'Workshop',
  ROOFING_WORKSHOP: 'Roofing + Workshop',
};

const BADGE_TITLE = {
  stockAlerts: (n: number) => `${n} item(s) to restock`,
  stockRequests: (n: number) => `${n} request(s) to send or receive`,
  itemRequests: (n: number) => `${n} new item request(s) waiting for approval`,
} as const;

/** Count for a menu item's bubble: loaded once, refreshed by live nudges only. */
function useNavBadge(item: NavItem): number {
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const user = useAuthStore((s) => s.user);
  const { branch } = useBranchContext();
  const { can } = usePermission();
  const global = !!user && isGlobalRole(user.role);
  const network = global && !activeBranchId;
  const runsHere = !!branch && pageRunsAt(item, branch);
  const alerts = item.badge === 'stockAlerts' && (network || runsHere);
  // Requests to act on are branch work: head office only watches, so it gets no to-do bubble
  const requests = item.badge === 'stockRequests' && !global && runsHere;
  // New products waiting for this branch's manager (Docs/decisions/0013)
  const items = item.badge === 'itemRequests' && !global && runsHere && can('approve', 'item_request');
  const alertCount = useStockAlertCount(alerts, network, activeBranchId).data;
  const requestCount = useStockRequestCount(requests, activeBranchId).data;
  const itemCount = useItemRequestCount(items, activeBranchId).data;
  // Every link shares the cached counts (a disabled query still returns cached data): only badge items show them
  return alerts ? (alertCount ?? 0) : requests ? (requestCount ?? 0) : items ? (itemCount ?? 0) : 0;
}

function NavLink({ item }: { item: NavItem }) {
  const badge = useNavBadge(item);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = isNavItemActive(item, pathname);
  // Menu items whose page is not built yet get a red cross
  const routesByPath = useRouter().routesByPath as Record<string, unknown>;
  const notBuilt = item.comingSoon || !(item.to in routesByPath);
  // No route at all: show the entry, but don't link to a not-found page
  if (!(item.to in routesByPath)) {
    return (
      <div
        aria-disabled="true"
        title="Coming soon"
        className="flex w-full cursor-not-allowed items-center rounded-md px-3 py-2.5 text-sm font-medium text-slate-500"
      >
        <Icon name={item.icon} className="mr-3 h-5 w-5 text-slate-600" />
        <span className="flex-1">{item.label}</span>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">Coming soon</span>
      </div>
    );
  }
  return (
    <Link
      to={item.to}
      // The router's own active marks must agree with isNavItemActive (it spreads aria-current last)
      activeOptions={{ exact: true, includeSearch: false }}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex w-full items-center rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
        isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white',
      )}
    >
      <Icon name={item.icon} className={cn('mr-3 h-5 w-5', isActive ? 'text-white' : 'text-slate-400')} />
      <span className="flex-1">{item.label}</span>
      {badge > 0 && (
        <span
          title={item.badge ? BADGE_TITLE[item.badge](badge) : undefined}
          className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {notBuilt && (
        <span title="Not built yet" aria-label="Not built yet">
          <Icon name="x" className="h-4 w-4 text-red-500" strokeWidth={3} />
        </span>
      )}
    </Link>
  );
}

function LiveDot({ state }: { state: LiveState }) {
  const map = {
    live: { dot: 'bg-emerald-500', label: 'Live' },
    connecting: { dot: 'bg-amber-400', label: 'Connecting…' },
    offline: { dot: 'bg-red-500', label: 'Live updates off — retrying' },
  } as const;
  const s = map[state];
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-500" title={s.label}>
      <span className={cn('h-2 w-2 rounded-full', s.dot)} />
      {s.label}
    </span>
  );
}

/**
 * Top bar for global roles (Docs/decisions/0002). Each page declares its scope:
 * global pages show a chip (no picker), network pages offer "All branches",
 * branch pages pick one branch where the page runs and are view-only.
 */
function ScopeBar() {
  const { scope, item, isGlobal } = usePageScope();
  const { activeBranchId, setActiveBranchId } = useAuthStore();
  const { data: branches = [] } = useBranchOptions(isGlobal);
  if (!isGlobal) return <div />;

  if (scope === 'global') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
        <Icon name="building" className="h-3.5 w-3.5" />
        Global · applies to all branches
      </span>
    );
  }

  const options = branches.filter((b) => pageRunsAt(item, b));
  const onChange = (id: string) => {
    setActiveBranchId(id || null);
    // Branch-scoped queries aren't keyed by branch, so drop the cache to load the new one fresh
    queryClient.clear();
  };
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="scope-branch" className="text-xs font-medium text-gray-500">
        {scope === 'network' ? 'Showing' : 'Viewing branch'}
      </label>
      <select
        id="scope-branch"
        value={activeBranchId ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400"
      >
        {scope === 'network' ? (
          <option value="">All branches</option>
        ) : (
          <option value="" disabled>
            Choose a branch…
          </option>
        )}
        {options.map((b) => (
          <option key={b.branch_id} value={b.branch_id}>
            {branchOptionLabel(b)}
          </option>
        ))}
      </select>
      {(scope === 'branch' || activeBranchId) && (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700" title="Head-office accounts view branch work; branch staff make changes">
          View only
        </span>
      )}
    </div>
  );
}

/**
 * Branch staff: a page their branch doesn't run (module off, wrong branch type) says so instead of failing.
 * Global roles: branch pages need a branch where they run; create forms are for branch staff.
 */
function BranchGate({ children }: { children: ReactNode }) {
  const { scope, item, transact, isGlobal } = usePageScope();
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  const { data: branches } = useBranchOptions(isGlobal);
  const { branch: ownBranch } = useBranchContext();
  if (!isGlobal) {
    if (ownBranch && item && !pageRunsAt(item, ownBranch)) {
      return (
        <EmptyState
          icon="🔒"
          title={`${item.label} isn't used at ${ownBranch.name}`}
          message="It is turned off for this branch. Ask head office if you need it."
        />
      );
    }
    return <>{children}</>;
  }
  if (scope === 'global') return <>{children}</>;

  if (transact) {
    return (
      <EmptyState
        icon="🔒"
        title="This page is for branch staff"
        message="Head-office accounts can view branch work but not change it."
      />
    );
  }
  if (!activeBranchId) {
    if (scope === 'network') return <>{children}</>;
    return <EmptyState icon="🏢" title="Choose a branch to view" message="Pick a branch in the top bar." />;
  }
  const branch = branches?.find((b) => b.branch_id === activeBranchId);
  if (branches && (!branch || !pageRunsAt(item, branch))) {
    return (
      <EmptyState
        icon="🏢"
        title={`${item?.label ?? 'This page'} isn't used at ${branch?.name ?? 'that branch'}`}
        message={scope === 'network' ? 'Choose another branch, or All branches, in the top bar.' : 'Choose another branch in the top bar.'}
      />
    );
  }
  return <>{children}</>;
}

export function Layout() {
  const navigate = useNavigate();
  const { user, logout, activeBranchId } = useAuthStore();
  const isSuperAdmin = user?.role === Role.SUPER_ADMIN;
  const { scope, isGlobal } = usePageScope();
  const { branch } = useBranchContext();
  const { groups } = useVisibleNav();
  const live = useLiveUpdates();

  // Keeps permissions in Zustand fresh: re-fetches GET /auth/me on window focus
  // so sidebar updates without re-login after SA grants/revokes permissions.
  useMe();

  // The route guard only runs on navigation: a session that ends on this page (refresh token
  // expired → logout() in the API client) must leave the shell too, not show an empty one
  if (!user) return <Navigate to="/login" replace />;

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
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50 font-sans">
      <OfflineBanner />
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="flex h-full w-64 shrink-0 flex-col bg-slate-900 text-slate-300 no-print">
          <div className="border-b border-slate-800 p-6">
            <h1 className="text-xl font-bold tracking-tight text-white">{env.APP_NAME}</h1>
            <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">{user?.role?.replace('_', ' ')}</p>
            {isGlobal ? (
              <p className="mt-1 text-xs text-slate-400">Head office · all branches</p>
            ) : (
              branch && (
                <p className="mt-1 text-xs text-slate-400">
                  {branch.name} · {BRANCH_TYPE_LABEL[branch.branch_type]}
                </p>
              )
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col justify-between py-4">
            <nav className="space-y-1 overflow-y-auto px-3">
              {groups.map((group, i) => (
                <Fragment key={group.label ?? i}>
                  {group.label && (
                    <div className={`${i > 0 ? 'mt-4 ' : ''}px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-500`}>{group.label}</div>
                  )}
                  {group.items.map((item) => (
                    <NavLink key={item.to} item={item} />
                  ))}
                </Fragment>
              ))}

              {isSuperAdmin && (
                <>
                  <div className="mt-4 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Super Admin</div>
                  {SUPER_ADMIN_NAV.map((item) => (
                    <NavLink key={item.to} item={item} />
                  ))}
                </>
              )}
            </nav>

            <div className="px-3 pb-2 pt-4">
              <div className="mb-2 px-3">
                <p className="truncate text-xs font-medium text-slate-200">{user?.name}</p>
                <p className="truncate text-xs text-slate-500">{user?.username}</p>
              </div>
              <Link
                to="/change-password"
                className="flex w-full items-center rounded-md px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                <Icon name="key" className="mr-3 h-5 w-5 text-slate-400" />
                Change password
              </Link>
              <button
                onClick={handleLogout}
                className="flex w-full items-center rounded-md px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-red-900/50 hover:text-red-300"
              >
                <Icon name="logOut" className="mr-3 h-5 w-5 text-red-400" />
                Logout
              </button>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-8 no-print">
            <ScopeBar />
            {(isGlobal ? scope !== 'global' : !!activeBranchId) && <LiveDot state={live} />}
          </header>

          <main className="flex-1 overflow-y-auto p-8">
            <BranchGate>
              <Outlet />
            </BranchGate>
          </main>
        </div>
      </div>
    </div>
  );
}
