import { Injectable, NotFoundException } from '@nestjs/common';
import { ERR } from '../../common/errors';
import { EmployeeEntity } from '../../database/entities/employee.entity';
import { WorkersRepository } from './workers.repository';

export class CreateWorkerDto {
  full_name: string;
  employee_code?: string;
  designation?: string;
  phone?: string;
}

export class UpdateWorkerDto {
  full_name?: string;
  designation?: string;
  phone?: string;
  is_active?: boolean;
}

@Injectable()
export class WorkersService {
  constructor(private readonly workersRepo: WorkersRepository) {}

  listWorkers(branchId: string): Promise<EmployeeEntity[]> {
    return this.workersRepo.findAllByBranch(branchId);
  }

  listActiveWorkers(branchId: string): Promise<EmployeeEntity[]> {
    return this.workersRepo.findActiveByBranch(branchId);
  }

  async createWorker(
    dto: CreateWorkerDto,
    branchId: string,
    actorId: string,
  ): Promise<EmployeeEntity> {
    return this.workersRepo.save({
      branch_id: branchId,
      // Omitted → DB generates EMP-#####
      ...(dto.employee_code ? { employee_code: dto.employee_code } : {}),
      full_name: dto.full_name,
      designation: dto.designation ?? null,
      phone: dto.phone ?? null,
      created_by: actorId,
      is_active: true,
    });
  }

  async updateWorker(
    workerId: string,
    dto: UpdateWorkerDto,
    branchId: string,
  ): Promise<EmployeeEntity> {
    const worker = await this.workersRepo.findById(workerId);
    if (!worker || worker.branch_id !== branchId) {
      throw new NotFoundException(ERR.WORKER_NOT_FOUND);
    }

    if (dto.full_name !== undefined) worker.full_name = dto.full_name;
    if (dto.designation !== undefined) worker.designation = dto.designation ?? null;
    if (dto.phone !== undefined) worker.phone = dto.phone ?? null;
    if (dto.is_active !== undefined) worker.is_active = dto.is_active;

    return this.workersRepo.save(worker);
  }

  async isInBranch(workerId: string, branchId: string): Promise<boolean> {
    const worker = await this.workersRepo.findById(workerId);
    return !!worker && worker.branch_id === branchId && worker.is_active;
  }
}