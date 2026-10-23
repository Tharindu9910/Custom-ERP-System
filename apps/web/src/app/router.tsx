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
import { HomePage } from '@/routes/home';
import { CustomersPage } from '@/routes/customers';
import { WorkersPage } from '@/routes/workers';
import { UsersSettingsPage } from '@/routes/settings/users';
import { WorkersSettingsPage } from '@/routes/settings/workers';
import { PermissionsSettingsPage } from '@/routes/settings/permissions';
import { BranchConfigPage } from '@/routes/settings/branch-config';
import { GatePassPage } from '@/routes/gate-pass';
import { JobCardFormPage } from '@/routes/job-card-form';
import { WorkshopQueuePage } from '@/routes/workshop-queue';
import { OrderFormPage } from '@/routes/order-form';
import { OrderQueuePage } from '@/routes/order-queue';
import { InventoryPage } from '@/routes/inventory';
import { StockAlertsPage } from '@/routes/stock-alerts';
import { StockRequestsPage } from '@/routes/stock-requests';
import {
  validateGatePassSearch,
  validateJobCardSearch,
  validateOrderFormSearch,
  validateOrderQueueSearch,
  validateStockRequestSearch,
  validateWorkshopQueueSearch,
} from '@/app/search-params';
import { CashierQueuePage } from '@/routes/cashier-queue';
import { ChiefProfilePage } from '@/routes/chief-profile';
import { ChangePasswordPage } from '@/routes/change-password';
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

// Temporary password in use: nothing else is reachable until it is changed
const changePasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/change-password',
  component: ChangePasswordPage,
  beforeLoad: () => {
    if (!isAuthenticated()) throw redirect({ to: '/login' });
  },
});

// Pathless authenticated shell — all children inherit auth check
const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_layout',
  component: Layout,
  beforeLoad: () => {
    if (!isAuthenticated()) throw redirect({ to: '/login' });
    if (useAuthStore.getState().user?.must_change_password) throw redirect({ to: '/change-password' });
  },
});

// Dashboard for management roles; operational roles are sent to their first screen
const indexRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/',
  component: HomePage,
});

// ── Phase 3 operational routes ────────────────────────────────────────────────

const customersRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/customers',
  component: CustomersPage,
  beforeLoad: requirePermission('complete', 'customer_profile'),
});

const workersRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/workers',
  component: WorkersPage,
  beforeLoad: requirePermission('manage', 'workers'),
});

// ── Supervisor dashboard: workshop flow ───────────────────────────────────────

const gatePassRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/gate-pass',
  component: GatePassPage,
  validateSearch: validateGatePassSearch,
  beforeLoad: requirePermission('view', 'gate_pass'),
});

// ── Supervisor dashboard: roofing orders ──────────────────────────────────────

const orderNewRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/orders/new',
  component: OrderFormPage,
  validateSearch: validateOrderFormSearch,
  beforeLoad: requirePermission('create', 'roofing_order'),
});

// Cashier only (edit:order), while the order is still Placed
const orderEditRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/orders/$orderId/edit',
  component: OrderFormPage,
  validateSearch: validateOrderFormSearch,
  beforeLoad: requirePermission('edit', 'order'),
});

const orderQueueRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/order-queue',
  component: OrderQueuePage,
  validateSearch: validateOrderQueueSearch,
  beforeLoad: requirePermission('view', 'orders'),
});

const jobCardNewRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/job-cards/new',
  component: JobCardFormPage,
  validateSearch: validateJobCardSearch,
  beforeLoad: requirePermission('create', 'job_card'),
});

const jobCardEditRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/job-cards/$orderId/edit',
  component: JobCardFormPage,
  validateSearch: validateJobCardSearch,
  beforeLoad: requirePermission('create', 'job_card'),
});

const workshopQueueRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/workshop-queue',
  component: WorkshopQueuePage,
  validateSearch: validateWorkshopQueueSearch,
  beforeLoad: requirePermission('update', 'job_card_status'),
});

const cashierQueueRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/cashier-queue',
  component: CashierQueuePage,
  beforeLoad: requirePermission('process', 'payment'),
});

const chiefProfileRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/chiefs/new',
  component: ChiefProfilePage,
  beforeLoad: requirePermission('create', 'chief_profile'),
});

// ── Supervisor dashboard: inventory and stock requests ───────────────────────

const inventoryRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/inventory',
  component: InventoryPage,
  beforeLoad: requirePermission('view', 'inventory'),
});

const stockAlertsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/stock-alerts',
  component: StockAlertsPage,
  beforeLoad: requirePermission('view', 'stock_alerts'),
});

const stockRequestsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/stock-requests',
  component: StockRequestsPage,
  validateSearch: validateStockRequestSearch,
  beforeLoad: requirePermission('request', 'stock'),
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

// Old "All Branches" page — branches are now managed in Branch Config
const settingsBranchesRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: '/settings/branches',
  beforeLoad: () => {
    throw redirect({ to: '/settings/branch-config' });
  },
});

// ── Route tree ────────────────────────────────────────────────────────────────

export const routeTree = rootRoute.addChildren([
  loginRoute,
  changePasswordRoute,
  layoutRoute.addChildren([
    indexRoute,
    gatePassRoute,
    orderNewRoute,
    orderEditRoute,
    orderQueueRoute,
    jobCardNewRoute,
    jobCardEditRoute,
    workshopQueueRoute,
    cashierQueueRoute,
    chiefProfileRoute,
    inventoryRoute,
    stockAlertsRoute,
    stockRequestsRoute,
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