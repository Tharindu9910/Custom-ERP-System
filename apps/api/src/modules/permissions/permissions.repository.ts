import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Role } from '@erp/shared';
import { PermissionEntity } from '../../database/entities/permission.entity';
import { RolePermissionEntity } from '../../database/entities/role-permission.entity';

export interface RolePermissionRow {
  role: Role;
  permission_id: string;
  action: string;
  module: string;
  granted: boolean;
}

@Injectable()
export class PermissionsRepository {
  constructor(
    @InjectRepository(PermissionEntity)
    private readonly permRepo: Repository<PermissionEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rpRepo: Repository<RolePermissionEntity>,
  ) {}

  findAllPermissions(): Promise<PermissionEntity[]> {
    return this.permRepo.find({ order: { module: 'ASC', action: 'ASC' } });
  }

  findPermissionById(permissionId: string): Promise<PermissionEntity | null> {
    return this.permRepo.findOne({ where: { permission_id: permissionId } });
  }

  findPermissionByAction(action: string): Promise<PermissionEntity | null> {
    return this.permRepo.findOne({ where: { action } });
  }

  async getRolePermissionMatrix(): Promise<RolePermissionRow[]> {
    return this.rpRepo
      .createQueryBuilder('rp')
      .innerJoin(PermissionEntity, 'p', 'p.permission_id = rp.permission_id')
      .select([
        'rp.role AS role',
        'rp.permission_id AS permission_id',
        'p.action AS action',
        'p.module AS module',
        'rp.granted AS granted',
      ])
      .orderBy('rp.role')
      .addOrderBy('p.module')
      .addOrderBy('p.action')
      .getRawMany();
  }

  findPermissionsByIds(ids: string[]): Promise<PermissionEntity[]> {
    return this.permRepo.find({ where: { permission_id: In(ids) } });
  }

  async findGrantsForRole(role: Role): Promise<Map<string, boolean>> {
    const rows = await this.rpRepo.find({ where: { role } });
    return new Map(rows.map((r) => [r.permission_id, r.granted]));
  }

  /** Writes every change for one role in one transaction. */
  async saveRoleGrants(role: Role, changes: { permission_id: string; granted: boolean }[], setBy: string): Promise<void> {
    await this.rpRepo.manager.transaction(async (em) => {
      for (const c of changes) {
        await em.query(
          `INSERT INTO role_permission (role, permission_id, granted, set_by, set_at)
           VALUES ($1::role_enum, $2, $3, $4, now())
           ON CONFLICT (role, permission_id) DO UPDATE SET granted = EXCLUDED.granted, set_by = EXCLUDED.set_by, set_at = now()`,
          [role, c.permission_id, c.granted, setBy],
        );
      }
    });
  }
}
