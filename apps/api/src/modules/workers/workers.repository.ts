import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkerEntity } from '../../database/entities/worker.entity';

@Injectable()
export class WorkersRepository {
  constructor(
    @InjectRepository(WorkerEntity)
    private readonly repo: Repository<WorkerEntity>,
  ) {}

  findActiveByBranch(branchId: string): Promise<WorkerEntity[]> {
    return this.repo.find({
      where: { branch_id: branchId, is_active: true },
      order: { full_name: 'ASC' },
    });
  }

  findAllByBranch(branchId: string): Promise<WorkerEntity[]> {
    return this.repo.find({
      where: { branch_id: branchId },
      order: { is_active: 'DESC', full_name: 'ASC' },
    });
  }

  findById(workerId: string): Promise<WorkerEntity | null> {
    return this.repo.findOne({ where: { worker_id: workerId } });
  }

  save(worker: Partial<WorkerEntity>): Promise<WorkerEntity> {
    return this.repo.save(worker as WorkerEntity);
  }
}