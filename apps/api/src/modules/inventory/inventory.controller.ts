import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { InventoryQuerySchema, StockAlertQuerySchema, type InventoryQuery, type StockAlertQuery } from '@erp/shared';
import { toActor } from '../../common/actor';
import { BranchId, CurrentUser, RequireFeature, RequirePermissions } from '../../common/decorators';
import type { RequestUser } from '../../common/types';
import { ZodPipe } from '../../common/zod.pipe';
import { InventoryService } from './inventory.service';

@Controller()
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('inventory')
  @RequirePermissions('view:inventory')
  @RequireFeature({ feature: 'inventory' })
  list(@Query(new ZodPipe(InventoryQuerySchema)) q: InventoryQuery, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.inventory.list(q, toActor(u, b).branch_id);
  }

  @Get('inventory/:itemId')
  @RequirePermissions('view:inventory')
  @RequireFeature({ feature: 'inventory' })
  item(@Param('itemId', ParseUUIDPipe) itemId: string, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.inventory.item(itemId, toActor(u, b).branch_id);
  }

  @Get('stock-alerts')
  @RequirePermissions('view:stock_alerts')
  @RequireFeature({ feature: 'stockAlerts' })
  alerts(@Query(new ZodPipe(StockAlertQuerySchema)) q: StockAlertQuery, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.inventory.alerts(q, toActor(u, b).branch_id);
  }
}
