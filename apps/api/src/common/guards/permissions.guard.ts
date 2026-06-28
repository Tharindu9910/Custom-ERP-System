import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Role } from '@erp/shared';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY } from '../decorators';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectDataSource() private readonly ds: DataSource,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Inject(CACHE_MANAGER) private readonly cache: any,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;

    // SUPER_ADMIN bypasses all permission checks — never stored in DB
    if (user.role === Role.SUPER_ADMIN) return true;

    const granted = await this.getGrantedPermissions(user.role as Role);
    return required.every((action) => granted.has(action));
  }

  private async getGrantedPermissions(role: Role): Promise<Set<string>> {
    const cacheKey = `permissions:${role}`;
    const cached = (await this.cache.get(cacheKey)) as string[] | undefined;
    if (cached) return new Set(cached);

    const rows: { action: string }[] = await this.ds.query(
      `SELECT p.action
       FROM role_permission rp
       JOIN permission p ON p.permission_id = rp.permission_id
       WHERE rp.role = $1 AND rp.granted = true`,
      [role],
    );

    const actions = rows.map((r) => r.action);
    const ttl = parseInt(process.env.PERMISSION_CACHE_TTL_MS ?? '300000', 10);
    await this.cache.set(cacheKey, actions, ttl);
    return new Set(actions);
  }
}
