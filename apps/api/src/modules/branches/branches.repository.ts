import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchEntity } from '../../database/entities/branch.entity';
import { BranchConfigEntity } from '../../database/entities/branch-config.entity';

@Injectable()
export class BranchesRepository {
  constructor(
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
    @InjectRepository(BranchConfigEntity)
    private readonly configRepo: Repository<BranchConfigEntity>,
  ) {}

  findAll(): Promise<BranchEntity[]> {
    return this.branchRepo.find({ order: { created_at: 'ASC' } });
  }

  findById(branchId: string): Promise<BranchEntity | null> {
    return this.branchRepo.findOne({ where: { branch_id: branchId } });
  }

  findByName(name: string): Promise<BranchEntity | null> {
    return this.branchRepo.findOne({ where: { name } });
  }

  save(branch: Partial<BranchEntity>): Promise<BranchEntity> {
    return this.branchRepo.save(branch as BranchEntity);
  }

  findConfig(branchId: string): Promise<BranchConfigEntity | null> {
    return this.configRepo.findOne({ where: { branch_id: branchId } });
  }

  saveConfig(config: Partial<BranchConfigEntity>): Promise<BranchConfigEntity> {
    return this.configRepo.save(config as BranchConfigEntity);
  }
}