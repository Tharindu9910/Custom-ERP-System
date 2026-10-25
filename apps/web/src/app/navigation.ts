import { Role, isGlobalRole, typeHasRoofing, typeHasWorkshop, type BranchSettings, type BranchType, type FeatureKey } from '@erp/shared';
import type { IconName } from '@/shared/components/Icon';
import { useBranchContext } from '@/shared/hooks/useBranchContext';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAuthStore } from '@/shared/stores/auth.store';

export interface NavItem {
  label: string;
  to: string;
  icon: IconName;
  permission?: { action: string; subject: string };
  /** Optional branch module that must be switched on */
  feature?: FeatureKey;
  /** Branch type must include this section */
  section?: 'roofing' | 'workshop';
  /** Hide for these roles (they have an operational landing page instead) */
  hideFor?: Role[];
  /** The route exists but the page is still a placeholder */
  comingSoon?: boolean;
  /** What the page works on — drives the top-bar branch picker for global roles (Docs/decisions/0002) */
  scope: PageScope;
  /** The page exists to make branch changes (create forms). Hidden for global roles: they only view. */
  transact?: boolean;
  /** Permission a global role needs instead of `permission` (the branch one is a write, e.g. request:stock) */
  globalPermission?: { action: string; subject: string };
}

/**
 * - global:  applies to every branch (settings, users) — no branch picker
 * - network: can show all branches at once (stock) — picker with "All branches"
 * - branch:  one branch's work — global roles pick a branch and only view
 */
export type PageScope = 'global' | 'network' | 'branch';

export const OPERATIONAL_ROLES = [Role.SUPERVISOR, Role.CHIEF, Role.CASHIER];

// Order follows the approved prototype sidebar
export const MAIN_NAV: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: 'barChart', scope: 'global', hideFor: OPERATIONAL_ROLES, comingSoon: true },
  { label: 'Cashier Queue', to: '/cashier-queue', icon: 'creditCard', scope: 'branch', permission: { action: 'process', subject: 'payment' } },
  { label: 'Gate Pass', to: '/gate-pass', icon: 'fileText', scope: 'branch', permission: { action: 'view', subject: 'gate_pass' }, feature: 'gatePass' },
  { label: 'Create Order', to: '/orders/new', icon: 'plusSquare', scope: 'branch', transact: true, permission: { action: 'create', subject: 'roofing_order' }, section: 'roofing' },
  { label: 'Order Queue', to: '/order-queue', icon: 'listOrdered', scope: 'branch', permission: { action: 'view', subject: 'orders' }, section: 'roofing' },
  { label: 'Create Job Card', to: '/job-cards/new', icon: 'plusSquare', scope: 'branch', transact: true, permission: { action: 'create', subject: 'job_card' }, section: 'workshop' },
  { label: 'Workshop Queue', to: '/workshop-queue', icon: 'clipboardList', scope: 'branch', permission: { action: 'view', subject: 'job_cards' }, section: 'workshop' },
  { label: 'Inventory', to: '/inventory', icon: 'package', scope: 'network', permission: { action: 'view', subject: 'inventory' }, feature: 'inventory' },
  { label: 'Stock Alerts', to: '/stock-alerts', icon: 'packageOpen', scope: 'network', permission: { action: 'view', subject: 'stock_alerts' }, feature: 'stockAlerts' },
  { label: 'Stock Request', to: '/stock-requests', icon: 'arrowRightLeft', scope: 'network', permission: { action: 'request', subject: 'stock' }, globalPermission: { action: 'view', subject: 'inventory' }, feature: 'stockRequest' },
  { label: 'Create Chief Profile', to: '/chiefs/new', icon: 'userCircle', scope: 'branch', transact: true, permission: { action: 'create', subject: 'chief_profile' }, feature: 'chiefProfiles' },
  { label: 'Customers', to: '/customers', icon: 'users', scope: 'global', permission: { action: 'complete', subject: 'customer_profile' } },
  { label: 'Finance', to: '/ledger', icon: 'barChart', scope: 'global', permission: { action: 'view', subject: 'financial_report' } },
  { label: 'Audit Log', to: '/audit-log', icon: 'history', scope: 'global', permission: { action: 'view', subject: 'audit_log' } },
];

export const SETTINGS_NAV: NavItem[] = [
  { label: 'Branch Config', to: '/settings/branch-config', icon: 'settings', scope: 'global', permission: { action: 'configure', subject: 'branch' } },
  { label: 'Price List', to: '/settings/price-list', icon: 'banknote', scope: 'global', permission: { action: 'view', subject: 'price_list' } },
  { label: 'Users', to: '/settings/users', icon: 'users', scope: 'global', permission: { action: 'manage', subject: 'users' } },
  { label: 'Workers', to: '/settings/workers', icon: 'userCircle', scope: 'branch', permission: { action: 'manage', subject: 'workers' } },
];

/** Super Admin only — rendered in its own sidebar section */
export const SUPER_ADMIN_NAV: NavItem[] = [
  { label: 'Role Permissions', to: '/settings/permissions', icon: 'lock', scope: 'global' },
];

const ALL_NAV = [...MAIN_NAV, ...SETTINGS_NAV, ...SUPER_ADMIN_NAV];

// Edit forms and the old Workers path are not in the menu but still belong to one branch
const TRANSACT_PREFIXES = ['/orders/', '/job-cards/', '/chiefs/'];

export interface PageInfo {
  scope: PageScope;
  transact: boolean;
  /** The menu item for this page, when it has one (gives the branch rules for the picker) */
  item?: NavItem;
}

/** One definition of each page's scope, used by the top bar and the page gate. */
export function pageInfo(pathname: string): PageInfo {
  const item = ALL_NAV.find((i) => i.to === pathname);
  if (item) return { scope: item.scope, transact: !!item.transact, item };
  if (TRANSACT_PREFIXES.some((p) => pathname.startsWith(p))) return { scope: 'branch', transact: true };
  return { scope: 'branch', transact: false };
}

export interface BranchLike {
  branch_type: BranchType;
  settings: BranchSettings;
}

/** Does this page apply at this branch (module switched on, right branch type)? */
export function pageRunsAt(item: NavItem | undefined, branch: BranchLike): boolean {
  if (!item) return true;
  if (item.feature && !branch.settings.features?.[item.feature]) return false;
  if (item.section === 'roofing' && !typeHasRoofing(branch.branch_type)) return false;
  if (item.section === 'workshop' && !typeHasWorkshop(branch.branch_type)) return false;
  return true;
}

/** Visible main-nav items for the current user and branch (also used to pick the landing page). */
export function useVisibleNav() {
  const user = useAuthStore((s) => s.user);
  const { can } = usePermission();
  const { featureOn, hasRoofing, hasWorkshop, branch } = useBranchContext();
  const global = !!user && isGlobalRole(user.role);
  const visible = (item: NavItem) => {
    if (item.hideFor && user && item.hideFor.includes(user.role)) return false;
    // Global roles see every page they may view; the picker offers only the branches it runs at
    if (global) {
      const perm = item.globalPermission ?? item.permission;
      return !item.transact && (!perm || can(perm.action, perm.subject));
    }
    if (item.permission && !can(item.permission.action, item.permission.subject)) return false;
    // Branch-dependent items wait for the branch context before showing
    if ((item.feature || item.section) && !branch) return false;
    if (item.feature && !featureOn(item.feature)) return false;
    if (item.section === 'roofing' && !hasRoofing) return false;
    if (item.section === 'workshop' && !hasWorkshop) return false;
    return true;
  };
  return { main: MAIN_NAV.filter(visible), settings: SETTINGS_NAV.filter(visible), branchLoaded: global || !!branch };
}

