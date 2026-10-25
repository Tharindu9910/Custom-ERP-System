import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BRANCH_CONFIG_SECTIONS,
  BranchSettings,
  BranchSettingsSchema,
  BranchType,
  DEFAULT_BRANCH_SETTINGS,
  Role,
  type UpdateBranchConfigDto,
} from '@erp/shared';
import * as bcrypt from 'bcrypt';
import { ERR } from '../../common/errors';
import { BranchEntity } from '../../database/entities/branch.entity';
import { AuditService } from '../../core/audit.service';
import { BranchContextService, type BranchContext } from '../../core/branch-context.service';
import { BranchesRepository } from './branches.repository';

export class CreateBranchDto {
  code: string;
  name: string;
  branch_type: BranchType;
  location?: string;
  phone?: string;
}

export class UpdateBranchDto {
  code?: string;
  name?: string;
  branch_type?: BranchType;
  location?: string;
  phone?: string;
  is_active?: boolean;
  /** Only `true` is accepted: it moves the main flag here. There is always exactly one main branch. */
  is_main?: boolean;
}

/** Who is acting on a branch: cross-branch roles have branch_id null. */
export interface BranchActor {
  user_id: string;
  role: Role;
  branch_id: string | null;
}

export type BranchConfig = BranchSettings & {
  branch_id: string;
  stock_override_configured: boolean;
  updated_by: string | null;
  updated_at: Date;
};

@Injectable()
export class BranchesService {
  constructor(
    private readonly branchesRepo: BranchesRepository,
    private readonly branchContext: BranchContextService,
    private readonly audit: AuditService,
  ) {}

  /** The working branch for any signed-in role: type and settings, no secrets. */
  getCurrent(branchId: string): Promise<BranchContext> {
    return this.branchContext.get(branchId);
  }

  /** Other active branches a stock request can be sent to — names only (BR06). Main first. */
  async listTransferTargets(branchId: string): Promise<{ branch_id: string; code: string; name: string; is_main: boolean }[]> {
    const all = await this.branchesRepo.findAll();
    return all
      .filter((b) => b.is_active && b.branch_id !== branchId)
      .map((b) => ({ branch_id: b.branch_id, code: b.code, name: b.name, is_main: b.is_main }));
  }

  async listBranches(actorBranchId: string | null): Promise<BranchEntity[]> {
    const all = await this.branchesRepo.findAll();
    // Global roles (SUPER_ADMIN, ADMIN, AUDITOR) have null branch_id → see all
    if (actorBranchId === null) return all;
    return all.filter((b) => b.branch_id === actorBranchId);
  }

  async createBranch(dto: CreateBranchDto, actor: BranchActor): Promise<BranchEntity> {
    const existing = await this.branchesRepo.findByCode(dto.code);
    if (existing) throw new ConflictException(ERR.BRANCH_CODE_EXISTS);

    const created = await this.branchesRepo.save({
      code: dto.code,
      name: dto.name,
      branch_type: dto.branch_type,
      location: dto.location ?? null,
      phone: dto.phone ?? null,
      settings: DEFAULT_BRANCH_SETTINGS,
      updated_by: actor.user_id,
    });
    this.audit.record({ ...actor, branch_id: created.branch_id }, { type: 'branch', id: created.branch_id }, 'CREATE', {
      after: { code: created.code, name: created.name, branch_type: created.branch_type },
    });
    return created;
  }

  async updateBranch(
    branchId: string,
    dto: UpdateBranchDto,
    actor: BranchActor,
  ): Promise<BranchEntity> {
    // Name, code, type and active state change what the whole branch runs (manage:branches)
    const branch = await this.branchesRepo.findById(branchId);
    if (!branch) throw new NotFoundException(ERR.BRANCH_NOT_FOUND);
    const before = { code: branch.code, name: branch.name, branch_type: branch.branch_type, location: branch.location, phone: branch.phone, is_active: branch.is_active, is_main: branch.is_main };
    if (dto.is_main === false) throw new BadRequestException(ERR.BRANCH_MAIN_REQUIRED);
    const makeMain = dto.is_main === true && !branch.is_main;
    if ((makeMain || branch.is_main) && !(dto.is_active ?? branch.is_active)) {
      throw new BadRequestException(ERR.BRANCH_MAIN_INACTIVE);
    }

    if (dto.code && dto.code !== branch.code) {
      const existing = await this.branchesRepo.findByCode(dto.code);
      if (existing) throw new ConflictException(ERR.BRANCH_CODE_EXISTS);
      branch.code = dto.code;
    }
    if (dto.name !== undefined) branch.name = dto.name;
    if (dto.branch_type !== undefined) branch.branch_type = dto.branch_type;
    if (dto.location !== undefined) branch.location = dto.location ?? null;
    if (dto.phone !== undefined) branch.phone = dto.phone ?? null;
    if (dto.is_active !== undefined) branch.is_active = dto.is_active;

    branch.updated_by = actor.user_id;
    let saved = await this.branchesRepo.save(branch);
    if (makeMain) {
      const previousMain = (await this.branchesRepo.findAll()).find((b) => b.is_main);
      await this.branchesRepo.setMain(branchId);
      if (previousMain) this.branchContext.invalidate(previousMain.branch_id);
      saved = { ...saved, is_main: true };
    }
    this.branchContext.invalidate(branchId);
    this.audit.record({ ...actor, branch_id: branchId }, { type: 'branch', id: branchId }, 'UPDATE', {
      before,
      after: { code: saved.code, name: saved.name, branch_type: saved.branch_type, location: saved.location, phone: saved.phone, is_active: saved.is_active, is_main: saved.is_main },
    });
    return saved;
  }

  async getConfig(branchId: string, actor: BranchActor): Promise<BranchConfig> {
    this.assertBranchAccess(actor, branchId);
    const branch = await this.branchesRepo.findById(branchId);
    if (!branch) throw new NotFoundException(ERR.BRANCH_NOT_FOUND);
    return this.toConfig(branch, (await this.branchContext.get(branchId)).stock_override_configured);
  }

  async updateConfig(
    branchId: string,
    dto: UpdateBranchConfigDto,
    actor: BranchActor,
  ): Promise<BranchConfig> {
    this.assertBranchAccess(actor, branchId);
    const branch = await this.branchesRepo.findById(branchId);
    if (!branch) throw new NotFoundException(ERR.BRANCH_NOT_FOUND);

    const { stock_override_password, ...settingsPatch } = dto;
    const current = BranchSettingsSchema.parse(branch.settings ?? {});
    const merged: Record<string, unknown> = { ...current, ...settingsPatch };
    // Nested sections are shallow-merged so a partial section keeps its other keys
    for (const key of BRANCH_CONFIG_SECTIONS) {
      if (settingsPatch[key]) merged[key] = { ...current[key], ...settingsPatch[key] };
    }
    const parsed = BranchSettingsSchema.safeParse(merged);
    if (!parsed.success) throw new BadRequestException(ERR.BRANCH_SETTINGS_INVALID);

    branch.settings = parsed.data;
    if (stock_override_password !== undefined) {
      branch.stock_override_password_hash = await bcrypt.hash(stock_override_password, 10);
    }

    branch.updated_by = actor.user_id;
    const saved = await this.branchesRepo.save(branch);
    this.branchContext.invalidate(branchId);
    const changed = Object.keys(settingsPatch) as (keyof BranchSettings)[];
    this.audit.record({ ...actor, branch_id: branchId }, { type: 'branch_config', id: branchId }, 'UPDATE', {
      before: Object.fromEntries(changed.map((k) => [k, current[k]])),
      // The override password itself is never logged
      after: { ...Object.fromEntries(changed.map((k) => [k, parsed.data[k]])), ...(stock_override_password !== undefined && { stock_override_password: 'changed' }) },
    });
    return this.toConfig(saved, (await this.branchContext.get(branchId)).stock_override_configured);
  }

  /** Global roles reach any branch; everyone else only their own. */
  private assertBranchAccess(actor: BranchActor, branchId: string): void {
    if (actor.branch_id !== null && actor.branch_id !== branchId) {
      throw new ForbiddenException(ERR.AUTH_INSUFFICIENT_PERMISSION);
    }
  }

  private toConfig(branch: BranchEntity, overrideConfigured: boolean): BranchConfig {
    // Fill defaults for any keys missing from the stored jsonb
    const settings = BranchSettingsSchema.parse(branch.settings ?? {});
    return {
      branch_id: branch.branch_id,
      ...settings,
      stock_override_configured: overrideConfigured,
      updated_by: branch.updated_by,
      updated_at: branch.updated_at,
    };
  }
}
