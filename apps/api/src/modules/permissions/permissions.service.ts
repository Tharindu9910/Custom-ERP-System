import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, permissionGrantBlock, type UpdateRolePermissionsDto } from '@erp/shared';
import { ERR } from '../../common/errors';
import type { RequestUser } from '../../common/types';
import { AuditService } from '../../core/audit.service';
import { EventsService } from '../../core/events.service';
import { RolePermissionsService } from '../../core/role-permissions.service';
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

@Injectable()
export class PermissionsService {
  constructor(
    private readonly permissionsRepo: PermissionsRepository,
    private readonly rolePermissions: RolePermissionsService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
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

  /**
   * Saves one role's grants. Refuses Super-Admin-only permissions and branch writes for
   * head-office roles (they would have no effect: Docs/decisions/0002). Only real changes
   * are written and audited; every open screen is told to refresh its permissions.
   */
  async updateRolePermissions(dto: UpdateRolePermissionsDto, actor: RequestUser): Promise<{ changed: number }> {
    const ids = [...new Set(dto.updates.map((u) => u.permission_id))];
    const perms = new Map((await this.permissionsRepo.findPermissionsByIds(ids)).map((p) => [p.permission_id, p]));
    if (perms.size !== ids.length) throw new NotFoundException(ERR.PERMISSION_NOT_FOUND);

    const current = await this.permissionsRepo.findGrantsForRole(dto.role);
    const changes = dto.updates.filter((u) => (current.get(u.permission_id) ?? false) !== u.granted);
    for (const c of changes) {
      if (!c.granted) continue;
      const block = permissionGrantBlock(dto.role, perms.get(c.permission_id)!.action);
      if (block === 'SUPER_ADMIN_ONLY') throw new BadRequestException(ERR.PERMISSION_SUPER_ADMIN_ONLY);
      if (block === 'GLOBAL_VIEW_ONLY') throw new BadRequestException(ERR.PERMISSION_GLOBAL_VIEW_ONLY);
    }
    if (changes.length === 0) return { changed: 0 };

    await this.permissionsRepo.saveRoleGrants(dto.role, changes, actor.user_id);
    await this.rolePermissions.invalidate(dto.role);

    const actions = (granted: boolean) => changes.filter((c) => c.granted === granted).map((c) => perms.get(c.permission_id)!.action);
    this.audit.record(actor, { type: 'role_permission' }, 'UPDATE_ROLE_PERMISSIONS', {
      after: { role: dto.role, granted: actions(true), revoked: actions(false) },
    });
    // Signed-in users of that role refetch /auth/me, so their menu changes at once
    this.events.changedEverywhere('permissions');
    return { changed: changes.length };
  }

  getGrantedPermissions(role: Role): Promise<string[]> {
    return this.rolePermissions.granted(role);
  }
}
