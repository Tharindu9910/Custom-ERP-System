import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { typeHasRoofing, typeHasWorkshop } from '@erp/shared';
import { FEATURE_KEY, type FeatureRequirement } from '../common/decorators';
import { ERR } from '../common/errors';
import type { RequestUser } from '../common/types';
import { BranchContextService } from './branch-context.service';

/**
 * Enforces @RequireFeature on the server: the branch must have the optional
 * module switched on and, where given, the right branch type (roofing/workshop).
 * The sidebar mirrors this, but hiding a menu item is not access control.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly branches: BranchContextService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = this.reflector.getAllAndOverride<FeatureRequirement>(FEATURE_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!req) return true;

    const request = ctx.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;
    const branchId = user?.branch_id ?? (request.headers['x-branch-id'] as string | undefined);
    // No branch: the handler rejects with BRANCH_CONTEXT_REQUIRED
    if (!branchId) return true;

    const branch = await this.branches.get(branchId);
    if (req.feature && !branch.settings.features[req.feature]) throw new ForbiddenException(ERR.FEATURE_DISABLED);
    if (req.section === 'roofing' && !typeHasRoofing(branch.branch_type)) throw new ForbiddenException(ERR.FEATURE_DISABLED);
    if (req.section === 'workshop' && !typeHasWorkshop(branch.branch_type)) throw new ForbiddenException(ERR.FEATURE_DISABLED);
    return true;
  }
}
