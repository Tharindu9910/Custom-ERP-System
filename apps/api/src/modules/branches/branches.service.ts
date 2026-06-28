import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ERR } from '../../common/errors';
import { BranchEntity } from '../../database/entities/branch.entity';
import { BranchConfigEntity } from '../../database/entities/branch-config.entity';
import { BranchesRepository } from './branches.repository';

export class CreateBranchDto {
  name: string;
  address?: string;
  phone?: string;
}

export class UpdateBranchDto {
  name?: string;
  address?: string;
  phone?: string;
  is_active?: boolean;
}

export class UpdateBranchConfigDto {
  min_advance_pct_customized?: number;
  min_advance_pct_standard?: number;
  stock_override_enabled?: boolean;
  stock_override_password?: string;
}

@Injectable()
export class BranchesService {
  constructor(private readonly branchesRepo: BranchesRepository) {}

  async listBranches(actorBranchId: string | null): Promise<BranchEntity[]> {
    const all = await this.branchesRepo.findAll();
    // SUPER_ADMIN and MANAGER have null branch_id → see all
    if (actorBranchId === null) return all;
    return all.filter((b) => b.branch_id === actorBranchId);
  }

  async createBranch(dto: CreateBranchDto): Promise<BranchEntity> {
    const existing = await this.branchesRepo.findByName(dto.name);
    if (existing) throw new ConflictException(ERR.BRANCH_NAME_EXISTS);

    const branch = await this.branchesRepo.save({
      name: dto.name,
      address: dto.address ?? null,
      phone: dto.phone ?? null,
    });

    // Create default config 1:1 with branch
    await this.branchesRepo.saveConfig({
      branch_id: branch.branch_id,
      min_advance_pct_customized: 30,
      min_advance_pct_standard: 0,
      stock_override_enabled: false,
      stock_override_password_hash: null,
    });

    return branch;
  }

  async updateBranch(branchId: string, dto: UpdateBranchDto): Promise<BranchEntity> {
    const branch = await this.branchesRepo.findById(branchId);
    if (!branch) throw new NotFoundException(ERR.BRANCH_NOT_FOUND);

    if (dto.name && dto.name !== branch.name) {
      const existing = await this.branchesRepo.findByName(dto.name);
      if (existing) throw new ConflictException(ERR.BRANCH_NAME_EXISTS);
      branch.name = dto.name;
    }
    if (dto.address !== undefined) branch.address = dto.address ?? null;
    if (dto.phone !== undefined) branch.phone = dto.phone ?? null;
    if (dto.is_active !== undefined) branch.is_active = dto.is_active;

    return this.branchesRepo.save(branch);
  }

  async getConfig(branchId: string): Promise<BranchConfigEntity> {
    const branch = await this.branchesRepo.findById(branchId);
    if (!branch) throw new NotFoundException(ERR.BRANCH_NOT_FOUND);

    let config = await this.branchesRepo.findConfig(branchId);
    if (!config) {
      // Auto-create missing config (defensive — seed should provide it)
      config = await this.branchesRepo.saveConfig({
        branch_id: branchId,
        min_advance_pct_customized: 30,
        min_advance_pct_standard: 0,
        stock_override_enabled: false,
        stock_override_password_hash: null,
      });
    }
    return config;
  }

  async updateConfig(
    branchId: string,
    dto: UpdateBranchConfigDto,
    actorId: string,
  ): Promise<BranchConfigEntity> {
    const config = await this.getConfig(branchId);

    if (dto.min_advance_pct_customized !== undefined)
      config.min_advance_pct_customized = dto.min_advance_pct_customized;
    if (dto.min_advance_pct_standard !== undefined)
      config.min_advance_pct_standard = dto.min_advance_pct_standard;
    if (dto.stock_override_enabled !== undefined)
      config.stock_override_enabled = dto.stock_override_enabled;
    if (dto.stock_override_password !== undefined) {
      const bcrypt = await import('bcrypt');
      config.stock_override_password_hash = await bcrypt.hash(dto.stock_override_password, 10);
    }

    config.updated_by = actorId;
    return this.branchesRepo.saveConfig(config);
  }
}