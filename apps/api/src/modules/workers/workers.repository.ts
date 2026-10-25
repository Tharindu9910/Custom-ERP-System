import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeEntity } from '../../database/entities/employee.entity';

@Injectable()
export class WorkersRepository {
  constructor(
    @InjectRepository(EmployeeEntity)
    private readonly repo: Repository<EmployeeEntity>,
  ) {}

  findActiveByBranch(branchId: string): Promise<EmployeeEntity[]> {
    return this.repo.find({
      where: { branch_id: branchId, is_active: true },
      order: { full_name: 'ASC' },
    });
  }

  findAllByBranch(branchId: string): Promise<EmployeeEntity[]> {
    return this.repo.find({
      where: { branch_id: branchId },
      order: { is_active: 'DESC', full_name: 'ASC' },
    });
  }

  findById(employeeId: string): Promise<EmployeeEntity | null> {
    return this.repo.findOne({ where: { employee_id: employeeId } });
  }

  save(employee: Partial<EmployeeEntity>): Promise<EmployeeEntity> {
    return this.repo.save(employee as EmployeeEntity);
  }
}
