import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { RequestUser } from '../../common/types';
import { BranchesService, CreateBranchDto, UpdateBranchDto, UpdateBranchConfigDto } from './branches.service';

@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  listBranches(@CurrentUser() actor: RequestUser) {
    return this.branchesService.listBranches(actor.branch_id);
  }

  @Post()
  @RequirePermissions('configure:branch')
  createBranch(@Body() dto: CreateBranchDto) {
    return this.branchesService.createBranch(dto);
  }

  @Patch(':id')
  @RequirePermissions('configure:branch')
  updateBranch(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.branchesService.updateBranch(id, dto);
  }

  @Get(':id/config')
  getConfig(@Param('id') id: string) {
    return this.branchesService.getConfig(id);
  }

  @Patch(':id/config')
  @RequirePermissions('configure:branch')
  updateConfig(
    @Param('id') id: string,
    @Body() dto: UpdateBranchConfigDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.branchesService.updateConfig(id, dto, actor.user_id);
  }
}