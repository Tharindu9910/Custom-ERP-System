import { Injectable, NotFoundException } from '@nestjs/common';
import { ERR } from '../../common/errors';
import { WorkerEntity } from '../../database/entities/worker.entity';
import { WorkersRepository } from './workers.repository';

export class CreateWorkerDto {
  full_name: string;
  phone?: string;
}

export class UpdateWorkerDto {
  full_name?: string;
  phone?: string;
  is_active?: boolean;
}

@Injectable()
export class WorkersService {
  constructor(private readonly workersRepo: WorkersRepository) {}

  listWorkers(branchId: string): Promise<WorkerEntity[]> {
    return this.workersRepo.findAllByBranch(branchId);
  }

  async createWorker(
    dto: CreateWorkerDto,
    branchId: string,
    actorId: string,
  ): Promise<WorkerEntity> {
    return this.workersRepo.save({
      branch_id: branchId,
      full_name: dto.full_name,
      phone: dto.phone ?? null,
      created_by: actorId,
      is_active: true,
    });
  }

  async updateWorker(
    workerId: string,
    dto: UpdateWorkerDto,
    branchId: string,
  ): Promise<WorkerEntity> {
    const worker = await this.workersRepo.findById(workerId);
    if (!worker || worker.branch_id !== branchId) {
      throw new NotFoundException(ERR.WORKER_NOT_FOUND);
    }

    if (dto.full_name !== undefined) worker.full_name = dto.full_name;
    if (dto.phone !== undefined) worker.phone = dto.phone ?? null;
    if (dto.is_active !== undefined) worker.is_active = dto.is_active;

    return this.workersRepo.save(worker);
  }

  async isInBranch(workerId: string, branchId: string): Promise<boolean> {
    const worker = await this.workersRepo.findById(workerId);
    return !!worker && worker.branch_id === branchId && worker.is_active;
  }
}