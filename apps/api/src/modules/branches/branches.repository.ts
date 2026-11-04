import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { BranchEntity } from '../../database/entities/branch.entity';

@Injectable()
export class BranchesRepository {
  constructor(
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
  ) {}

  /** Runs `fn` in one transaction; pass the manager on to the methods below. */
  transaction<T>(fn: (em: EntityManager) => Promise<T>): Promise<T> {
    return this.branchRepo.manager.transaction(fn);
  }

  /** Main branch first, then by name — the order every branch list uses. */
  findAll(): Promise<BranchEntity[]> {
    return this.branchRepo.find({ order: { is_main: 'DESC', name: 'ASC' } });
  }

  findById(branchId: string, em?: EntityManager): Promise<BranchEntity | null> {
    return this.repo(em).findOne({ where: { branch_id: branchId } });
  }

  findMain(em?: EntityManager): Promise<BranchEntity | null> {
    return this.repo(em).findOne({ where: { is_main: true } });
  }

  findByCode(code: string): Promise<BranchEntity | null> {
    return this.branchRepo.findOne({ where: { code } });
  }

  /**
   * Moves the main flag; uq_branch_single_main allows only one, so clear first. Call inside
   * a transaction. The old main's version moves too, so a stale copy of it is refused.
   */
  async setMain(em: EntityManager, branchId: string): Promise<void> {
    await em.query(`UPDATE branch SET is_main = false, version = version + 1 WHERE is_main AND branch_id <> $1`, [branchId]);
    await em.query(`UPDATE branch SET is_main = true WHERE branch_id = $1`, [branchId]);
  }

  save(branch: Partial<BranchEntity>, em?: EntityManager): Promise<BranchEntity> {
    return this.repo(em).save(branch as BranchEntity);
  }

  private repo(em?: EntityManager): Repository<BranchEntity> {
    return em ? em.getRepository(BranchEntity) : this.branchRepo;
  }
}
