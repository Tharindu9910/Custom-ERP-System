import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Role } from '@erp/shared';

/**
 * What each role is granted on the Role Permissions page, cached per role.
 * The one lookup used by the permission guard, /auth/me and in-service checks
 * (e.g. the stock override), so they can never disagree.
 */
@Injectable()
export class RolePermissionsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Inject(CACHE_MANAGER) private readonly cache: any,
  ) {}

  async granted(role: Role): Promise<string[]> {
    const cacheKey = this.key(role);
    const cached = (await this.cache.get(cacheKey)) as string[] | undefined;
    if (cached) return cached;

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
    return actions;
  }

  /** SUPER_ADMIN passes every check — its grants are never stored. */
  async has(role: Role, action: string): Promise<boolean> {
    if (role === Role.SUPER_ADMIN) return true;
    return (await this.granted(role)).includes(action);
  }

  async invalidate(role: Role): Promise<void> {
    await this.cache.del(this.key(role));
  }

  private key(role: Role): string {
    return `permissions:${role}`;
  }
}
