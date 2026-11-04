import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { BranchId, CurrentUser, RequirePermissions } from '../../common/decorators';
import { toActor } from '../../common/actor';
import { RequestUser } from '../../common/types';
import { UuidPipe } from '../../common/uuid.pipe';
import { ZodPipe } from '../../common/zod.pipe';
import {
  CreateBranchSchema,
  UpdateBranchConfigSchema,
  UpdateBranchSchema,
  type CreateBranchDto,
  type UpdateBranchConfigDto,
  type UpdateBranchDto,
} from '@erp/shared';
import { BranchesService } from './branches.service';

@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  /** Branch summaries for lists and pickers (all for global roles, own branch otherwise). */
  @Get()
  listBranches(@CurrentUser() actor: RequestUser) {
    return this.branchesService.listBranches(actor.branch_id);
  }

  @Get('current')
  getCurrent(@CurrentUser() user: RequestUser, @BranchId() branchId: string | null) {
    return this.branchesService.getCurrent(toActor(user, branchId).branch_id);
  }

  @Get('transfer-targets')
  @RequirePermissions('request:stock')
  listTransferTargets(@CurrentUser() user: RequestUser, @BranchId() branchId: string | null) {
    return this.branchesService.listTransferTargets(toActor(user, branchId).branch_id);
  }

  @Post()
  @RequirePermissions('manage:branches')
  createBranch(@Body(new ZodPipe(CreateBranchSchema)) dto: CreateBranchDto, @CurrentUser() actor: RequestUser) {
    return this.branchesService.createBranch(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('manage:branches')
  updateBranch(
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(UpdateBranchSchema)) dto: UpdateBranchDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.branchesService.updateBranch(id, dto, actor);
  }

  @Get(':id/config')
  getConfig(@Param('id', UuidPipe) id: string, @CurrentUser() actor: RequestUser) {
    return this.branchesService.getConfig(id, actor);
  }

  @Patch(':id/config')
  @RequirePermissions('configure:branch')
  updateConfig(
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(UpdateBranchConfigSchema)) dto: UpdateBranchConfigDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.branchesService.updateConfig(id, dto, actor);
  }
}
