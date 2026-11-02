import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateItemSchema, type CreateItemDto } from '@erp/shared';
import { toActor } from '../../common/actor';
import { BranchId, CurrentUser, RequireFeature, RequirePermissions } from '../../common/decorators';
import type { RequestUser } from '../../common/types';
import { ZodPipe } from '../../common/zod.pipe';
import { ItemsService } from './items.service';

@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  // Category and unit choices for the New item form (anyone who sees Stock Levels)
  @Get('options')
  @RequirePermissions('view:inventory')
  options() {
    return this.items.catalogOptions();
  }

  // Global master data, like the price list: no @BranchId, so head office adds directly (Docs/decisions/0013)
  @Post()
  @RequirePermissions('create:item')
  create(@Body(new ZodPipe(CreateItemSchema)) dto: CreateItemDto, @CurrentUser() u: RequestUser) {
    return this.items.create(dto, u);
  }

  @Get('coils')
  @RequirePermissions('create:roofing_order')
  @RequireFeature({ section: 'roofing' })
  coils(@CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.items.coils(toActor(u, b).branch_id);
  }

  // Job card form: sheet stock, coils and the override switch in one call (Docs/decisions/0009)
  @Get('workshop-catalog')
  @RequirePermissions('create:job_card')
  workshopCatalog(@CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.items.workshopCatalog(toActor(u, b).branch_id);
  }
}
