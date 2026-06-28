import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Role } from '@erp/shared';
import { ERR } from '../../common/errors';
import { PermissionsRepository } from './permissions.repository';
import { PermissionEntity } from '../../database/entities/permission.entity';

export interface RolePermissionsDto {
  role: Role;
  permissions: {
    permission_id: string;
    action: string;
    module: string;
    granted: boolean;
  }[];
}

export class UpdateRolePermissionsDto {
  role: Role;
  updates: { permission_id: string; granted: boolean }[];
}

@Injectable()
export class PermissionsService {
  constructor(
    private readonly permissionsRepo: PermissionsRepository,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Inject(CACHE_MANAGER) private readonly cache: any,
  ) {}

  getAllPermissions(): Promise<PermissionEntity[]> {
    return this.permissionsRepo.findAllPermissions();
  }

  async getRolePermissionsMatrix(): Promise<RolePermissionsDto[]> {
    const rows = await this.permissionsRepo.getRolePermissionMatrix();
    const map = new Map<Role, RolePermissionsDto>();

    for (const row of rows) {
      if (!map.has(row.role)) {
        map.set(row.role, { role: row.role, permissions: [] });
      }
      map.get(row.role)!.permissions.push({
        permission_id: row.permission_id,
        action: row.action,
        module: row.module,
        granted: row.granted,
      });
    }

    return [...map.values()];
  }

  async updateRolePermissions(
    dto: UpdateRolePermissionsDto,
    actorId: string,
  ): Promise<void> {
    for (const update of dto.updates) {
      const perm = await this.permissionsRepo.findPermissionById(update.permission_id);
      if (!perm) throw new NotFoundException(ERR.PERMISSION_NOT_FOUND);

      await this.permissionsRepo.upsertRolePermission(
        dto.role,
        update.permission_id,
        update.granted,
        actorId,
      );
    }

    // Invalidate cache for this role so the next request repopulates
    await this.cache.del(`permissions:${dto.role}`);
  }

  async getGrantedPermissions(role: Role): Promise<string[]> {
    const cacheKey = `permissions:${role}`;
    const cached = (await this.cache.get(cacheKey)) as string[] | undefined;
    if (cached) return cached;

    const actions = await this.permissionsRepo.getGrantedActionsForRole(role);
    const ttl = parseInt(process.env.PERMISSION_CACHE_TTL_MS ?? '300000', 10);
    await this.cache.set(cacheKey, actions, ttl);
    return actions;
  }
}