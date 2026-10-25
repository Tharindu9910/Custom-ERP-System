import { Role, isGlobalRole } from '../enums/role.enum';

export interface PermissionDef {
  action: string;
  module: string;
  description: string;
  /** planned = seeded so grants are ready, but no screen or endpoint checks it yet */
  status: 'active' | 'planned';
  /** Changes one branch's work. Head-office roles are view-only there (Docs/decisions/0002), so it can't be granted to them. */
  branchWrite: boolean;
}

const p = (
  action: string,
  module: string,
  description: string,
  opts: { planned?: boolean; branchWrite?: boolean } = {},
): PermissionDef => ({ action, module, description, status: opts.planned ? 'planned' : 'active', branchWrite: !!opts.branchWrite });

/** Every permission the system knows. The seed, the migration and the Role Permissions page all read this list. */
export const PERMISSION_CATALOG: readonly PermissionDef[] = [
  // Job cards and work orders
  p('create:job_card', 'job-cards', 'Create and edit job cards', { branchWrite: true }),
  p('view:job_cards', 'job-cards', 'View the workshop queue'),
  p('update:job_card_status', 'job-cards', 'Start work on job card lines', { branchWrite: true }),
  p('cancel:job_card_draft', 'job-cards', 'Void an unpaid DRAFT job card', { branchWrite: true }),
  p('cancel:job_card_any', 'job-cards', 'Cancel a job card in any status', { planned: true, branchWrite: true }),
  p('create:work_order', 'work-orders', 'Add a work order to a job card', { planned: true, branchWrite: true }),
  p('complete:work_order', 'work-orders', 'Mark a work order as completed', { branchWrite: true }),
  p('assign:worker', 'work-orders', 'Assign workers to a work order', { planned: true, branchWrite: true }),
  p('enter_price:customized', 'work-orders', 'Enter customised price on work order', { planned: true, branchWrite: true }),
  p('enter_price:standard', 'work-orders', 'Enter standard price on work order', { planned: true, branchWrite: true }),
  p('verify_price:standard', 'work-orders', 'Verify standard price (Cashier)', { planned: true, branchWrite: true }),
  // Payments and invoices
  p('process:payment', 'payments', 'Use the cashier queue and record payments', { branchWrite: true }),
  p('generate:invoice', 'invoices', 'Generate invoice for a job card', { planned: true, branchWrite: true }),
  // Customers and workers (also open the page read-only for head office)
  p('complete:customer_profile', 'customers', 'Add and edit customer profiles'),
  p('manage:workers', 'workers', 'Create, edit and deactivate workers'),
  // Gate passes (Docs/decisions/0001)
  p('view:gate_pass', 'gate-passes', 'View gate passes and material balances'),
  p('create:gate_pass', 'gate-passes', 'Record customer material coming in', { branchWrite: true }),
  p('allocate:gate_pass_order', 'gate-passes', "Use a gate pass's material on a roofing order", { branchWrite: true }),
  // Roofing orders
  p('create:roofing_order', 'orders', 'Place roofing orders (with the placement payment)', { branchWrite: true }),
  p('view:orders', 'orders', 'View the order queue'),
  p('update:order_status', 'orders', 'Start and complete roofing orders', { branchWrite: true }),
  p('release:order', 'orders', 'Release a ready, fully paid order to the customer', { branchWrite: true }),
  p('edit:order', 'orders', 'Edit a placed roofing order before work starts', { branchWrite: true }),
  p('cancel:order', 'orders', 'Cancel a placed roofing order', { branchWrite: true }),
  // Inventory and stock transfers
  p('view:inventory', 'inventory', 'View branch stock levels'),
  p('view:stock_alerts', 'inventory', 'View low and out-of-stock alerts'),
  p('override:stock', 'inventory', 'Use the stock override password when stock is short', { branchWrite: true }),
  p('request:stock', 'stock-transfers', 'Request stock from another branch and receive it', { branchWrite: true }),
  p('send:stock', 'stock-transfers', 'Send or reject stock requested by another branch', { branchWrite: true }),
  // Branches
  p('configure:branch', 'branches', 'Change branch feature switches, policy and override password'),
  p('manage:branches', 'branches', 'Add branches and change name, code, type or active state'),
  p('view:all_branches', 'branches', 'View data across all branches', { planned: true }),
  // Price list — one list for every branch (Docs/decisions/0004)
  p('view:price_list', 'price-list', 'View the price list'),
  p('configure:price_list', 'price-list', 'Change, add and deactivate work rates'),
  p('configure:item_prices', 'price-list', 'Change catalogue item selling price and cost'),
  // Users
  p('manage:users', 'users', 'Create and manage system users'),
  p('create:chief_profile', 'users', 'Create chief logins for branch employees', { branchWrite: true }),
  // Reports (menu entries only until the pages exist)
  p('view:audit_log', 'audit-logs', 'View the audit log', { planned: true }),
  p('view:financial_report', 'ledger', 'View financial reports', { planned: true }),
  p('resolve:conflict_queue', 'offline-sync', 'Resolve offline sync conflicts', { planned: true }),
  // Super Admin only — never granted to a role
  p('configure:permissions', 'permissions', 'Manage role permissions (Super Admin)'),
];

export const PERMISSION_BY_ACTION: Readonly<Record<string, PermissionDef>> = Object.fromEntries(
  PERMISSION_CATALOG.map((d) => [d.action, d]),
);

/** Only SUPER_ADMIN holds these (by bypass); granting them to a role would let it edit its own access. */
export const SUPER_ADMIN_ONLY_PERMISSIONS: readonly string[] = ['configure:permissions'];

/** Why a role can't be granted an action, or null when it can. Shared by the API and the Role Permissions page. */
export function permissionGrantBlock(role: Role, action: string): 'SUPER_ADMIN_ONLY' | 'GLOBAL_VIEW_ONLY' | null {
  if (SUPER_ADMIN_ONLY_PERMISSIONS.includes(action)) return 'SUPER_ADMIN_ONLY';
  if (isGlobalRole(role) && PERMISSION_BY_ACTION[action]?.branchWrite) return 'GLOBAL_VIEW_ONLY';
  return null;
}
