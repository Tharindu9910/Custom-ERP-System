import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async getGrantedActionsForRole(role: Role): Promise<string[]> {
    const rows: { action: string }[] = await this.rpRepo
      .createQueryBuilder('rp')
      .innerJoin(PermissionEntity, 'p', 'p.permission_id = rp.permission_id')
      .select('p.action', 'action')
      .where('rp.role = :role', { role })
      .andWhere('rp.granted = true')
      .getRawMany();
    return rows.map((r) => r.action);
  }

  async findRolePermission(
    role: Role,
    permissionId: string,
  ): Promise<RolePermissionEntity | null> {
    return this.rpRepo.findOne({ where: { role, permission_id: permissionId } });
  }

  async upsertRolePermission(
    role: Role,
    permissionId: string,
    granted: boolean,
    setBy: string,
  ): Promise<void> {
    const existing = await this.findRolePermission(role, permissionId);
    if (existing) {
      existing.granted = granted;
      existing.set_by = setBy;
      await this.rpRepo.save(existing);
    } else {
      const row = this.rpRepo.create({ role, permission_id: permissionId, granted, set_by: setBy });
      await this.rpRepo.save(row);
    }
  }
}