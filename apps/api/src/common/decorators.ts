import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { RequestUser } from './types';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as RequestUser;
  },
);

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...actions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, actions);

/**
 * Resolves the effective branch ID for a request.
 * - Branch-scoped roles (Admin, Supervisor, etc.): always uses JWT branch_id — header is ignored.
 * - Cross-branch roles (SUPER_ADMIN, MANAGER): JWT branch_id is null, reads X-Branch-Id header.
 * Returns null if no branch context is available.
 */
export const BranchId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest();
    const actor = request.user as RequestUser;
    if (actor.branch_id) return actor.branch_id;
    return (request.headers['x-branch-id'] as string) ?? null;
  },
);
