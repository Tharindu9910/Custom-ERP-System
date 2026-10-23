import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { BranchId, CurrentUser, RequirePermissions } from '../../common/decorators';
import { RequestUser } from '../../common/types';
import { WorkersService, CreateWorkerDto, UpdateWorkerDto } from './workers.service';

@Controller('workers')
export class WorkersController {
  constructor(private readonly workersService: WorkersService) {}

  @Get()
  listWorkers(@BranchId() branchId: string | null, @Query('active') active?: string) {
    if (!branchId) throw new BadRequestException('Branch context required');
    // ?active=true feeds assignment pickers: deactivated workers are hidden (BR20)
    return active === 'true' ? this.workersService.listActiveWorkers(branchId) : this.workersService.listWorkers(branchId);
  }

  @Post()
  @RequirePermissions('manage:workers')
  createWorker(
    @Body() dto: CreateWorkerDto,
    @BranchId() branchId: string | null,
    @CurrentUser() actor: RequestUser,
  ) {
    if (!branchId) throw new BadRequestException('Branch context required');
    return this.workersService.createWorker(dto, branchId, actor.user_id);
  }

  @Patch(':id')
  @RequirePermissions('manage:workers')
  updateWorker(
    @Param('id') id: string,
    @Body() dto: UpdateWorkerDto,
    @BranchId() branchId: string | null,
  ) {
    if (!branchId) throw new BadRequestException('Branch context required');
    return this.workersService.updateWorker(id, dto, branchId);
  }
}