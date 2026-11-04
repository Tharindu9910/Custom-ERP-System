import { Injectable, NotFoundException } from '@nestjs/common';
import { ERR } from '../../common/errors';
import type { Actor } from '../../common/actor';
import { AuditService } from '../../core/audit.service';
import { EmployeeEntity } from '../../database/entities/employee.entity';
import { WorkersRepository } from './workers.repository';

export class CreateWorkerDto {
  full_name: string;
  employee_code?: string;
  designation?: string | null;
  phone?: string | null;
}

export class UpdateWorkerDto {
  full_name?: string;
  designation?: string | null;
  phone?: string | null;
  is_active?: boolean;
}

@Injectable()
export class WorkersService {
  constructor(
    private readonly workersRepo: WorkersRepository,
    private readonly audit: AuditService,
  ) {}

  listWorkers(branchId: string): Promise<EmployeeEntity[]> {
    return this.workersRepo.findAllByBranch(branchId);
  }

  listActiveWorkers(branchId: string): Promise<EmployeeEntity[]> {
    return this.workersRepo.findActiveByBranch(branchId);
  }

  async createWorker(
    dto: CreateWorkerDto,
    branchId: string,
    actor: Pick<Actor, 'user_id' | 'role'>,
  ): Promise<EmployeeEntity> {
    const saved = await this.workersRepo.save({
      branch_id: branchId,
      // Omitted → DB generates EMP-#####
      ...(dto.employee_code ? { employee_code: dto.employee_code } : {}),
      full_name: dto.full_name,
      designation: dto.designation ?? null,
      phone: dto.phone ?? null,
      created_by: actor.user_id,
      is_active: true,
    });
    this.audit.record({ ...actor, branch_id: branchId }, { type: 'employee', id: saved.employee_id }, 'CREATE', {
      after: { full_name: saved.full_name, designation: saved.designation, phone: saved.phone },
    });
    return saved;
  }

  async updateWorker(
    workerId: string,
    dto: UpdateWorkerDto,
    branchId: string,
    actor: Pick<Actor, 'user_id' | 'role'>,
  ): Promise<EmployeeEntity> {
    const worker = await this.workersRepo.findById(workerId);
    if (!worker || worker.branch_id !== branchId) {
      throw new NotFoundException(ERR.WORKER_NOT_FOUND);
    }

    const snapshot = (w: EmployeeEntity) => ({ full_name: w.full_name, designation: w.designation, phone: w.phone, is_active: w.is_active });
    const before = snapshot(worker);
    if (dto.full_name !== undefined) worker.full_name = dto.full_name;
    if (dto.designation !== undefined) worker.designation = dto.designation ?? null;
    if (dto.phone !== undefined) worker.phone = dto.phone ?? null;
    if (dto.is_active !== undefined) worker.is_active = dto.is_active;

    const saved = await this.workersRepo.save(worker);
    this.audit.record({ ...actor, branch_id: branchId }, { type: 'employee', id: workerId }, 'UPDATE', { before, after: snapshot(saved) });
    return saved;
  }

  async isInBranch(workerId: string, branchId: string): Promise<boolean> {
    const worker = await this.workersRepo.findById(workerId);
    return !!worker && worker.branch_id === branchId && worker.is_active;
  }
}