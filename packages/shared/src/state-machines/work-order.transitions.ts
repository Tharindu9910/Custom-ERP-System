import { WorkOrderStatus } from '../enums/work-order-status.enum';
import { Role } from '../enums/role.enum';

const ADMIN_ROLES = [Role.SUPER_ADMIN, Role.ADMIN] as const;

type Transition = {
  from: WorkOrderStatus;
  to: WorkOrderStatus;
  allowedRoles: readonly Role[];
};

const TERMINAL = [WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED];

const TRANSITIONS: Transition[] = [
  // Worker assigned
  {
    from: WorkOrderStatus.PENDING,
    to: WorkOrderStatus.ASSIGNED,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.SUPERVISOR, Role.CHIEF],
  },
  // Stock check passes (or Admin override)
  {
    from: WorkOrderStatus.ASSIGNED,
    to: WorkOrderStatus.IN_PROGRESS,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.SUPERVISOR, Role.CHIEF],
  },
  // Supervisor/Chief marks complete after inspection
  {
    from: WorkOrderStatus.IN_PROGRESS,
    to: WorkOrderStatus.COMPLETED,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.SUPERVISOR, Role.CHIEF],
  },
];

export function canTransitionWorkOrder(
  from: WorkOrderStatus,
  to: WorkOrderStatus,
  actorRole: Role,
): boolean {
  // Admin can cancel any non-terminal status
  if (to === WorkOrderStatus.CANCELLED) {
    return (
      !TERMINAL.includes(from) &&
      (ADMIN_ROLES as readonly Role[]).includes(actorRole)
    );
  }

  return TRANSITIONS.some(
    (t) =>
      t.from === from &&
      t.to === to &&
      (t.allowedRoles as readonly Role[]).includes(actorRole),
  );
}