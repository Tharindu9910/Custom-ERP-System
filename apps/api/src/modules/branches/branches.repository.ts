import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchEntity } from '../../database/entities/branch.entity';

@Injectable()
export class BranchesRepository {
  constructor(
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
  ) {}

  /** Main branch first, then by name — the order every branch list uses. */
  findAll(): Promise<BranchEntity[]> {
    return this.branchRepo.find({ order: { is_main: 'DESC', name: 'ASC' } });
  }

  /** Moves the main flag in one transaction (uq_branch_single_main allows only one). */
  async setMain(branchId: string): Promise<void> {
    await this.branchRepo.manager.transaction(async (em) => {
      await em.query(`UPDATE branch SET is_main = false WHERE is_main AND branch_id <> $1`, [branchId]);
      await em.query(`UPDATE branch SET is_main = true WHERE branch_id = $1`, [branchId]);
    });
  }

  findById(branchId: string): Promise<BranchEntity | null> {
    return this.branchRepo.findOne({ where: { branch_id: branchId } });
  }

  findByCode(code: string): Promise<BranchEntity | null> {
    return this.branchRepo.findOne({ where: { code } });
  }

  save(branch: Partial<BranchEntity>): Promise<BranchEntity> {
    return this.branchRepo.save(branch as BranchEntity);
  }
}
