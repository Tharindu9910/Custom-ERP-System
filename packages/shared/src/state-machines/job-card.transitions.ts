import { JobCardStatus } from '../enums/job-card-status.enum';
import { Role } from '../enums/role.enum';

const ADMIN_ROLES = [Role.SUPER_ADMIN, Role.ADMIN] as const;
const SUPERVISOR_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.SUPERVISOR, Role.CHIEF] as const;

type Transition = {
  from: JobCardStatus;
  to: JobCardStatus;
  allowedRoles: readonly Role[];
};

const TRANSITIONS: Transition[] = [
  // Payment recorded + invoice generated → moves to queue
  {
    from: JobCardStatus.DRAFT,
    to: JobCardStatus.IN_QUEUE,
    allowedRoles: [Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER],
  },
  // Void before any work starts
  {
    from: JobCardStatus.DRAFT,
    to: JobCardStatus.VOIDED,
    allowedRoles: SUPERVISOR_ROLES,
  },
  // First work order moves to IN_PROGRESS
  {
    from: JobCardStatus.IN_QUEUE,
    to: JobCardStatus.IN_PROGRESS,
    allowedRoles: SUPERVISOR_ROLES,
  },
  // Admin requests cancellation from queue
  {
    from: JobCardStatus.IN_QUEUE,
    to: JobCardStatus.CANCELLATION_PENDING,
    allowedRoles: ADMIN_ROLES,
  },
  // All work orders completed + balance = 0
  {
    from: JobCardStatus.IN_PROGRESS,
    to: JobCardStatus.CLOSED,
    allowedRoles: ADMIN_ROLES,
  },
  // Admin requests cancellation mid-job
  {
    from: JobCardStatus.IN_PROGRESS,
    to: JobCardStatus.CANCELLATION_PENDING,
    allowedRoles: ADMIN_ROLES,
  },
  // Admin approves cancellation
  {
    from: JobCardStatus.CANCELLATION_PENDING,
    to: JobCardStatus.VOIDED,
    allowedRoles: ADMIN_ROLES,
  },
];

export function canTransitionJobCard(
  from: JobCardStatus,
  to: JobCardStatus,
  actorRole: Role,
): boolean {
  return TRANSITIONS.some(
    (t) =>
      t.from === from &&
      t.to === to &&
      (t.allowedRoles as readonly Role[]).includes(actorRole),
  );
}

// Restoring previous status on cancellation rejection is handled in service logic,
// not as a state machine transition, because "previous status" is dynamic.