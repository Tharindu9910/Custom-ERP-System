import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
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

  @Post()
  @RequirePermissions('manage:users')
  createUser(@Body() dto: CreateUserDto, @CurrentUser() actor: RequestUser) {
    return this.usersService.createUser(dto, actor.user_id);
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
    return this.usersService.assignRole(id, dto, actor.user_id);
  }
}