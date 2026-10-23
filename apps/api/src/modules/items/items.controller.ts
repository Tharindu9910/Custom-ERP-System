import { Controller, Get } from '@nestjs/common';
import { toActor } from '../../common/actor';
import { BranchId, CurrentUser, RequireFeature, RequirePermissions } from '../../common/decorators';
import type { RequestUser } from '../../common/types';
import { ItemsService } from './items.service';

@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get('coils')
  @RequirePermissions('create:roofing_order')
  @RequireFeature({ section: 'roofing' })
  coils(@CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.items.coils(toActor(u, b).branch_id);
  }
}
