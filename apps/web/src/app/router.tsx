import {
  createRouter,
  createRootRoute,
  createRoute,
  redirect,
} from '@tanstack/react-router';
import { Role } from '@erp/shared';
import { Root } from '@/routes/__root';
import { LoginPage } from '@/routes/login';
import { Layout } from '@/routes/_layout';
import { CustomersPage } from '@/routes/customers';
import { WorkersPage } from '@/routes/workers';
import { UsersSettingsPage } from '@/routes/settings/users';
import { WorkersSettingsPage } from '@/routes/settings/workers';
import { PermissionsSettingsPage } from '@/routes/settings/permissions';
import { BranchConfigPage } from '@/routes/settings/branch-config';
import { BranchesSettingsPage } from '@/routes/settings/branches';
import { useAuthStore } from '@/shared/stores/auth.store';
import { buildAbility } from '@/app/ability';

// ── Auth helpers ──────────────────────────────────────────────────────────────

function isAuthenticated() {
  return !!useAuthStore.getState().user;
}

/**
 * Returns a beforeLoad guard that redirects to / if the logged-in user lacks
 * the given permission. SUPER_ADMIN always passes (mirrors backend guard).
 * Mirror of usePermission() but synchronous for router beforeLoad context.
 */
function requirePermission(action: string, subject: string) {
  return () => {
    const user = useAuthStore.getState().user;
    if (!user) throw redirect({ to: '/login' });
    if (user.role === Role.SUPER_ADMIN) return;
    const ability = buildAbility(user.permissions ?? []);
    if (ability.cannot(action, subject)) throw redirect({ to: '/' });
  };
}

/** Redirects to / for any role other than SUPER_ADMIN. */
function requireSuperAdmin() {
  return () => {
    const user = useAuthStore.getState().user;
    if (!user) throw redirect({ to: '/login' });
    if (user.role !== Role.SUPER_ADMIN) throw redirect({ to: '/' });
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

const rootRoute = createRootRoute({ component: Root });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
  beforeLoad: () => {
    if (isAuthenticated()) throw redirect({ to: '/' });
  },
});

// Pathless authenticated shell — all children inherit auth check
const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_layout',
  component: Layout,
  beforeLoad: () => {
    if (!isAuthenticated()) throw redirect({ to: '/login' });
  },
});

// Dashboard — all authenticated users
const indexRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/',
  component: () => (
    <div className="flex flex-col items-center justify-center py-24 text-gray-400">
      <span className="text-5xl">⊞</span>
      <p className="mt-4 text-lg font-medium text-gray-600">Dashboard — coming soon</p>
    </div>
  ),
});

// ── Phase 3 operational routes ────────────────────────────────────────────────

const customersRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/customers',
  component: CustomersPage,
  beforeLoad: requirePermission('create', 'job_card'),
});

const workersRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/workers',
  component: WorkersPage,
  beforeLoad: requirePermission('manage', 'workers'),
});

// ── Phase 3 settings routes ───────────────────────────────────────────────────

const settingsBranchConfigRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/settings/branch-config',
  component: BranchConfigPage,
  beforeLoad: requirePermission('configure', 'branch'),
});

const settingsUsersRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/settings/users',
  component: UsersSettingsPage,
  beforeLoad: requirePermission('manage', 'users'),
});

const settingsWorkersRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/settings/workers',
  component: WorkersSettingsPage,
  beforeLoad: requirePermission('manage', 'workers'),
});

// Super Admin only routes
const settingsPermissionsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/settings/permissions',
  component: PermissionsSettingsPage,
  beforeLoad: requireSuperAdmin(),
});

const settingsBranchesRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/settings/branches',
  component: BranchesSettingsPage,
  beforeLoad: requireSuperAdmin(),
});

// ── Route tree ────────────────────────────────────────────────────────────────

export const routeTree = rootRoute.addChildren([
  loginRoute,
  layoutRoute.addChildren([
    indexRoute,
    customersRoute,
    workersRoute,
    settingsBranchConfigRoute,
    settingsUsersRoute,
    settingsWorkersRoute,
    settingsPermissionsRoute,
    settingsBranchesRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}