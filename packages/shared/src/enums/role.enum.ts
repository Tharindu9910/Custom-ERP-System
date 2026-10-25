export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  AUDITOR = 'AUDITOR',
  SUPERVISOR = 'SUPERVISOR',
  CHIEF = 'CHIEF',
  CASHIER = 'CASHIER',
  MANAGER = 'MANAGER',
}

/**
 * Head-office roles: no home branch, see every branch, and are view-only on
 * branch transactions (Docs/decisions/0002). Every other role is bound to one branch.
 */
export const GLOBAL_ROLES: readonly Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.AUDITOR];

export const isGlobalRole = (role: Role | string): boolean => (GLOBAL_ROLES as readonly string[]).includes(role);
