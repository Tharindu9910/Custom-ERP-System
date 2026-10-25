import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UpdateRolePermissionsSchema, type UpdateRolePermissionsDto } from '@erp/shared';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { RequestUser } from '../../common/types';
import { ZodPipe } from '../../common/zod.pipe';
import { PermissionsService } from './permissions.service';

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
    @Body(new ZodPipe(UpdateRolePermissionsSchema)) dto: UpdateRolePermissionsDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.permissionsService.updateRolePermissions(dto, actor);
  }
}
