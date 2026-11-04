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
import { ZodPipe } from '../../common/zod.pipe';
import { UuidPipe } from '../../common/uuid.pipe';
import { WorkerCreateBodySchema, WorkerListQuerySchema, WorkerUpdateBodySchema } from '@erp/shared';
import { WorkersService, CreateWorkerDto, UpdateWorkerDto } from './workers.service';

@Controller('workers')
export class WorkersController {
  constructor(private readonly workersService: WorkersService) {}

  @Get()
  listWorkers(@BranchId() branchId: string | null, @Query(new ZodPipe(WorkerListQuerySchema)) { active }: { active?: string }) {
    if (!branchId) throw new BadRequestException('Branch context required');
    // ?active=true feeds assignment pickers: deactivated workers are hidden (BR20)
    return active === 'true' ? this.workersService.listActiveWorkers(branchId) : this.workersService.listWorkers(branchId);
  }

  @Post()
  @RequirePermissions('manage:workers')
  createWorker(
    @Body(new ZodPipe(WorkerCreateBodySchema)) dto: CreateWorkerDto,
    @BranchId() branchId: string | null,
    @CurrentUser() actor: RequestUser,
  ) {
    if (!branchId) throw new BadRequestException('Branch context required');
    return this.workersService.createWorker(dto, branchId, actor);
  }

  @Patch(':id')
  @RequirePermissions('manage:workers')
  updateWorker(
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(WorkerUpdateBodySchema)) dto: UpdateWorkerDto,
    @BranchId() branchId: string | null,
    @CurrentUser() actor: RequestUser,
  ) {
    if (!branchId) throw new BadRequestException('Branch context required');
    return this.workersService.updateWorker(id, dto, branchId, actor);
  }
}