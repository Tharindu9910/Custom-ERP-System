import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERR, Role } from '@erp/shared';
import { ANY_PERMISSION_KEY, IS_PUBLIC_KEY, PERMISSIONS_KEY } from '../decorators';
import { RolePermissionsService } from '../../core/role-permissions.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rolePermissions: RolePermissionsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const targets = [ctx.getHandler(), ctx.getClass()];
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets) ?? [];
    const anyOf = this.reflector.getAllAndOverride<string[]>(ANY_PERMISSION_KEY, targets) ?? [];
    if (required.length === 0 && anyOf.length === 0) return true;

    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;

    // SUPER_ADMIN bypasses all permission checks — never stored in DB
    if (user.role === Role.SUPER_ADMIN) return true;

    const granted = new Set(await this.rolePermissions.granted(user.role as Role));
    // Throw the documented code; returning false gives Nest's bare "Forbidden resource"
    if (!required.every((action) => granted.has(action))) throw new ForbiddenException(ERR.AUTH_INSUFFICIENT_PERMISSION);
    if (anyOf.length > 0 && !anyOf.some((action) => granted.has(action))) throw new ForbiddenException(ERR.AUTH_INSUFFICIENT_PERMISSION);
    return true;
  }
}
