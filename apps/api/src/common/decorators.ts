import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { ERR } from '@erp/shared';
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
 * - Branch-bound roles (Manager, Supervisor, etc.): always uses JWT branch_id — header is ignored.
 * - Global roles (SUPER_ADMIN, ADMIN, AUDITOR): JWT branch_id is null, reads X-Branch-Id header.
 *   They are view-only on branch work (Docs/decisions/0002), so any non-GET is refused here —
 *   every branch transaction resolves its branch through this decorator.
 * Returns null if no branch context is available.
 */
export const BranchId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest();
    const actor = request.user as RequestUser;
    if (actor.branch_id) return actor.branch_id;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      throw new ForbiddenException(ERR.GLOBAL_VIEW_ONLY);
    }
    return (request.headers['x-branch-id'] as string) ?? null;
  },
);

/**
 * Same branch resolution as @BranchId() but without the view-only check, for
 * non-GET routes that only read (e.g. the live-updates ticket). Never use it on a
 * route that changes branch data.
 */
export const ReadBranchId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest();
    const actor = request.user as RequestUser;
    return actor.branch_id ?? (request.headers['x-branch-id'] as string) ?? null;
  },
);

export const FEATURE_KEY = 'branchFeature';
export type FeatureRequirement = {
  feature?: import('@erp/shared').FeatureKey;
  /** Branch type must include roofing / workshop. */
  section?: 'roofing' | 'workshop';
};
/** Blocks the route (403 FEATURE_DISABLED) when the branch has the module turned off. */
export const RequireFeature = (req: FeatureRequirement) => SetMetadata(FEATURE_KEY, req);

export const ALLOW_PASSWORD_CHANGE_KEY = 'allowDuringPasswordChange';
/** Routes a user with a temporary password may still call (me, change password, logout). */
export const AllowDuringPasswordChange = () => SetMetadata(ALLOW_PASSWORD_CHANGE_KEY, true);
