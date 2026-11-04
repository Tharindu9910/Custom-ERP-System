import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BRANCH_CONFIG_SECTIONS,
  BranchFeaturesSchema,
  BranchSettings,
  BranchSettingsSchema,
  DEFAULT_BRANCH_SETTINGS,
  Role,
  type BranchConfig,
  type BranchSummary,
  type CreateBranchDto,
  type UpdateBranchConfigDto,
  type UpdateBranchDto,
} from '@erp/shared';
import * as bcrypt from 'bcrypt';
import { ERR, errWith } from '../../common/errors';
import { bumpVersion } from '../../common/versioning';
import { BranchEntity } from '../../database/entities/branch.entity';
import { AuditService } from '../../core/audit.service';
import { BranchContextService, type BranchContext } from '../../core/branch-context.service';
import { BranchesRepository } from './branches.repository';

/** Who is acting on a branch: cross-branch roles have branch_id null. */
export interface BranchActor {
  user_id: string;
  role: Role;
  branch_id: string | null;
}

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

  /** Summaries only — full settings come from GET /branches/:id/config. */
  async listBranches(actorBranchId: string | null): Promise<BranchSummary[]> {
    const all = await this.branchesRepo.findAll();
    // Global roles (SUPER_ADMIN, ADMIN, AUDITOR) have null branch_id → see all
    const visible = actorBranchId === null ? all : all.filter((b) => b.branch_id === actorBranchId);
    return visible.map((b) => this.toSummary(b));
  }

  async createBranch(dto: CreateBranchDto, actor: BranchActor): Promise<BranchSummary> {
    // Friendly message for the common case; a concurrent duplicate hits the unique key (409 VAL_002)
    if (await this.branchesRepo.findByCode(dto.code)) throw new ConflictException(ERR.BRANCH_CODE_EXISTS);

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
    return this.toSummary(created);
  }

  async updateBranch(branchId: string, dto: UpdateBranchDto, actor: BranchActor): Promise<BranchSummary> {
    // Name, code, type and active state change what the whole branch runs (manage:branches)
    if (dto.is_main === false) throw new BadRequestException(ERR.BRANCH_MAIN_REQUIRED);

    const { saved, before, previousMainId } = await this.branchesRepo.transaction(async (em) => {
      const branch = await this.branchesRepo.findById(branchId, em);
      if (!branch) throw new NotFoundException(ERR.BRANCH_NOT_FOUND);
      // Checks the client's version and locks the row until commit
      await bumpVersion(em, 'branch', 'branch_id', branchId, dto.version, ERR.BRANCH_VERSION_CONFLICT);
      branch.version = dto.version + 1;

      const before = details(branch);
      const makeMain = dto.is_main === true && !branch.is_main;
      if ((makeMain || branch.is_main) && !(dto.is_active ?? branch.is_active)) {
        throw new BadRequestException(ERR.BRANCH_MAIN_INACTIVE);
      }
      if (dto.code !== undefined && dto.code !== branch.code) {
        if (await this.branchesRepo.findByCode(dto.code)) throw new ConflictException(ERR.BRANCH_CODE_EXISTS);
        branch.code = dto.code;
      }
      if (dto.name !== undefined) branch.name = dto.name;
      if (dto.branch_type !== undefined) branch.branch_type = dto.branch_type;
      if (dto.location !== undefined) branch.location = dto.location ?? null;
      if (dto.phone !== undefined) branch.phone = dto.phone ?? null;
      if (dto.is_active !== undefined) branch.is_active = dto.is_active;
      branch.updated_by = actor.user_id;

      const saved = await this.branchesRepo.save(branch, em);
      let previousMainId: string | null = null;
      if (makeMain) {
        previousMainId = (await this.branchesRepo.findMain(em))?.branch_id ?? null;
        await this.branchesRepo.setMain(em, branchId);
        saved.is_main = true;
      }
      return { saved, before, previousMainId };
    });

    if (previousMainId) this.branchContext.invalidate(previousMainId);
    this.branchContext.invalidate(branchId);
    this.audit.record({ ...actor, branch_id: branchId }, { type: 'branch', id: branchId }, 'UPDATE', {
      before,
      after: details(saved),
    });
    return this.toSummary(saved);
  }

  async getConfig(branchId: string, actor: BranchActor): Promise<BranchConfig> {
    this.assertBranchAccess(actor, branchId);
    const branch = await this.branchesRepo.findById(branchId);
    if (!branch) throw new NotFoundException(ERR.BRANCH_NOT_FOUND);
    return this.toConfig(branch, (await this.branchContext.get(branchId)).stock_override_configured);
  }

  async updateConfig(branchId: string, dto: UpdateBranchConfigDto, actor: BranchActor): Promise<BranchConfig> {
    this.assertBranchAccess(actor, branchId);
    const { stock_override_password, version, ...settingsPatch } = dto;

    const { saved, current, next } = await this.branchesRepo.transaction(async (em) => {
      const branch = await this.branchesRepo.findById(branchId, em);
      if (!branch) throw new NotFoundException(ERR.BRANCH_NOT_FOUND);
      // Checks the client's version and locks the row, so the merge below can't lose a concurrent save
      await bumpVersion(em, 'branch', 'branch_id', branchId, version, ERR.BRANCH_VERSION_CONFLICT);
      branch.version = version + 1;

      const current = BranchSettingsSchema.parse(branch.settings ?? {});
      const merged: Record<string, unknown> = { ...current, ...settingsPatch };
      // Nested sections are shallow-merged so a partial section keeps its other keys
      for (const key of BRANCH_CONFIG_SECTIONS) {
        if (settingsPatch[key]) merged[key] = { ...current[key], ...settingsPatch[key] };
      }
      const parsed = BranchSettingsSchema.safeParse(merged);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
        throw new BadRequestException(errWith(ERR.BRANCH_SETTINGS_INVALID, { issues }));
      }

      branch.settings = parsed.data;
      if (stock_override_password !== undefined) {
        branch.stock_override_password_hash = await bcrypt.hash(stock_override_password, 10);
      }
      branch.updated_by = actor.user_id;
      return { saved: await this.branchesRepo.save(branch, em), current, next: parsed.data };
    });

    this.branchContext.invalidate(branchId);
    const changed = Object.keys(settingsPatch) as (keyof BranchSettings)[];
    this.audit.record({ ...actor, branch_id: branchId }, { type: 'branch_config', id: branchId }, 'UPDATE', {
      before: Object.fromEntries(changed.map((k) => [k, current[k]])),
      // The override password itself is never logged
      after: { ...Object.fromEntries(changed.map((k) => [k, next[k]])), ...(stock_override_password !== undefined && { stock_override_password: 'changed' }) },
    });
    return this.toConfig(saved, (await this.branchContext.get(branchId)).stock_override_configured);
  }

  /** Global roles reach any branch; everyone else only their own. */
  private assertBranchAccess(actor: BranchActor, branchId: string): void {
    if (actor.branch_id !== null && actor.branch_id !== branchId) {
      throw new ForbiddenException(ERR.AUTH_INSUFFICIENT_PERMISSION);
    }
  }

  private toSummary(b: BranchEntity): BranchSummary {
    return {
      branch_id: b.branch_id,
      code: b.code,
      name: b.name,
      branch_type: b.branch_type,
      phone: b.phone,
      location: b.location,
      is_main: b.is_main,
      is_active: b.is_active,
      // Defaults fill any switch missing from older rows
      features: BranchFeaturesSchema.parse(b.settings?.features ?? {}),
      version: b.version,
      updated_at: b.updated_at.toISOString(),
    };
  }

  private toConfig(branch: BranchEntity, overrideConfigured: boolean): BranchConfig {
    // Fill defaults for any keys missing from the stored jsonb
    const settings = BranchSettingsSchema.parse(branch.settings ?? {});
    return {
      branch_id: branch.branch_id,
      ...settings,
      stock_override_configured: overrideConfigured,
      version: branch.version,
      updated_by: branch.updated_by,
      updated_at: branch.updated_at.toISOString(),
    };
  }
}

/** The audited branch details. */
function details(b: BranchEntity) {
  return { code: b.code, name: b.name, branch_type: b.branch_type, location: b.location, phone: b.phone, is_active: b.is_active, is_main: b.is_main };
}
