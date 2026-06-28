import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { RequestUser } from '../../common/types';
import { PermissionsService, UpdateRolePermissionsDto } from './permissions.service';

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermissions('configure:permissions')
  getAllPermissions() {
    return this.permissionsService.getAllPermissions();
  }

  @Get('roles')
  @RequirePermissions('configure:permissions')
  getRolePermissionsMatrix() {
    return this.permissionsService.getRolePermissionsMatrix();
  }

  @Patch('roles')
  @RequirePermissions('configure:permissions')
  updateRolePermissions(
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.permissionsService.updateRolePermissions(dto, actor.user_id);
  }
}