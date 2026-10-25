import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BranchSettingsSchema, type BranchSettings, type BranchType } from '@erp/shared';
import { ERR } from '../common/errors';

export interface BranchContext {
  branch_id: string;
  code: string;
  name: string;
  branch_type: BranchType;
  is_main: boolean;
  is_active: boolean;
  stock_override_configured: boolean;
  settings: BranchSettings;
}

const TTL_MS = 30_000;

/**
 * Parsed branch settings, cached briefly per branch. Every rule that depends on
 * branch configuration reads it from here; BranchesService invalidates on save.
 */
@Injectable()
export class BranchContextService {
  private cache = new Map<string, { at: number; value: BranchContext }>();

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async get(branchId: string): Promise<BranchContext> {
    const hit = this.cache.get(branchId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

    const rows: {
      branch_id: string;
      code: string;
      name: string;
      branch_type: BranchType;
      is_main: boolean;
      is_active: boolean;
      settings: unknown;
      has_override: boolean;
    }[] = await this.ds.query(
      `SELECT branch_id, code, name, branch_type, is_main, is_active, settings,
              stock_override_password_hash IS NOT NULL AS has_override
       FROM branch WHERE branch_id = $1`,
      [branchId],
    );
    if (rows.length === 0) throw new NotFoundException(ERR.BRANCH_NOT_FOUND);
    const r = rows[0];
    const value: BranchContext = {
      branch_id: r.branch_id,
      code: r.code,
      name: r.name,
      branch_type: r.branch_type,
      is_main: r.is_main,
      is_active: r.is_active,
      stock_override_configured: r.has_override,
      settings: BranchSettingsSchema.parse(r.settings ?? {}),
    };
    this.cache.set(branchId, { at: Date.now(), value });
    return value;
  }

  invalidate(branchId: string): void {
    this.cache.delete(branchId);
  }
}
