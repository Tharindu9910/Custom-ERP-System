import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_PASSWORD_CHANGE_KEY, IS_PUBLIC_KEY } from '../decorators';
import { ERR } from '../errors';
import type { RequestUser } from '../types';

/** A user signed in with a temporary password can only change it (or sign out). */
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_KEY, targets)) return true;
    const user = ctx.switchToHttp().getRequest().user as RequestUser | undefined;
    if (user?.must_change_password) throw new ForbiddenException(ERR.AUTH_PASSWORD_CHANGE_REQUIRED);
    return true;
  }
}
