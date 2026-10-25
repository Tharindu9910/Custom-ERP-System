import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateChiefSchema, type CreateChiefDto } from '@erp/shared';
import { toActor } from '../../common/actor';
import { BranchId, CurrentUser, RequireFeature, RequirePermissions } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { RequestUser } from '../../common/types';
import { UsersService, CreateUserDto, UpdateUserDto, AssignRoleDto } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('manage:users')
  listUsers(@CurrentUser() actor: RequestUser) {
    return this.usersService.listUsers(actor.branch_id);
  }

  @Get('chief-candidates')
  @RequirePermissions('create:chief_profile')
  @RequireFeature({ feature: 'chiefProfiles' })
  chiefCandidates(@Query('search') search: string | undefined, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.usersService.chiefCandidates(toActor(u, b).branch_id, search);
  }

  @Post('chief')
  @RequirePermissions('create:chief_profile')
  @RequireFeature({ feature: 'chiefProfiles' })
  createChief(@Body(new ZodPipe(CreateChiefSchema)) dto: CreateChiefDto, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.usersService.createChief(dto, toActor(u, b));
  }

  @Post()
  @RequirePermissions('manage:users')
  createUser(@Body() dto: CreateUserDto, @CurrentUser() actor: RequestUser) {
    return this.usersService.createUser(dto, actor.user_id, actor.role);
  }

  @Patch(':id')
  @RequirePermissions('manage:users')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateUser(id, dto);
  }

  @Patch(':id/role')
  @RequirePermissions('manage:users')
  assignRole(
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.usersService.assignRole(id, dto, actor.user_id, actor.role);
  }
}