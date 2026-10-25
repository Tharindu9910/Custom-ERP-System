import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { isGlobalRole, type Role } from '@erp/shared';
import { ERR } from './errors';
import type { RequestUser } from './types';

/** The acting user plus the branch the request works in. */
export interface Actor {
  user_id: string;
  role: Role;
  branch_id: string;
  username: string;
}

/** Combines the JWT user with the resolved branch; branch-scoped work needs a branch. */
export function toActor(user: RequestUser, branchId: string | null): Actor {
  if (!branchId) throw new BadRequestException(ERR.BRANCH_CONTEXT_REQUIRED);
  return { user_id: user.user_id, role: user.role, branch_id: branchId, username: user.username };
}

/** Network (all-branches) reads are for head-office roles only; branch staff keep BR06. */
export function requireGlobal(user: RequestUser): void {
  if (!isGlobalRole(user.role)) throw new ForbiddenException(ERR.GLOBAL_ROLE_REQUIRED);
}
