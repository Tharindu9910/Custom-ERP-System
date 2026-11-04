import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  AssignRoleSchema,
  ChiefCandidatesQuerySchema,
  CreateChiefSchema,
  CreateUserSchema,
  UpdateUserSchema,
  type AssignRoleDto,
  type CreateChiefDto,
  type CreateUserDto,
  type UpdateUserDto,
} from '@erp/shared';
import { toActor } from '../../common/actor';
import { BranchId, CurrentUser, RequireFeature, RequirePermissions } from '../../common/decorators';
import { UuidPipe } from '../../common/uuid.pipe';
import { ZodPipe } from '../../common/zod.pipe';
import { RequestUser } from '../../common/types';
import { UsersService } from './users.service';

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
  chiefCandidates(@Query(new ZodPipe(ChiefCandidatesQuerySchema)) { search }: { search?: string }, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
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
  createUser(@Body(new ZodPipe(CreateUserSchema)) dto: CreateUserDto, @CurrentUser() actor: RequestUser) {
    return this.usersService.createUser(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('manage:users')
  updateUser(
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(UpdateUserSchema)) dto: UpdateUserDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.usersService.updateUser(id, dto, actor);
  }

  @Patch(':id/role')
  @RequirePermissions('manage:users')
  assignRole(
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(AssignRoleSchema)) dto: AssignRoleDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.usersService.assignRole(id, dto, actor);
  }
}