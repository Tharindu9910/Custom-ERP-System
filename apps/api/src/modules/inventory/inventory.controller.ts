import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  InventoryQuerySchema,
  StockAlertQuerySchema,
  UpdateStockMinimumSchema,
  type InventoryQuery,
  type StockAlertQuery,
  type UpdateStockMinimumDto,
} from '@erp/shared';
import { toActor } from '../../common/actor';
import { BranchId, CurrentUser, RequireFeature, RequirePermissions } from '../../common/decorators';
import type { RequestUser } from '../../common/types';
import { ZodPipe } from '../../common/zod.pipe';
import { InventoryService } from './inventory.service';
import { UuidPipe } from '../../common/uuid.pipe';

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
  item(@Param('itemId') itemId: string, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.inventory.item(itemId, toActor(u, b).branch_id);
  }

  // Branch work (@BranchId): head office gets CTX_003, the branch manager sets it (Docs/decisions/0012)
  @Patch('inventory/:itemId/minimum')
  @RequirePermissions('configure:stock_minimum')
  @RequireFeature({ feature: 'inventory' })
  setMinimum(
    @Param('itemId') itemId: string,
    @Body(new ZodPipe(UpdateStockMinimumSchema)) dto: UpdateStockMinimumDto,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    return this.inventory.setMinimum(itemId, dto.reorder_level, toActor(u, b));
  }

  // Sidebar badge: just the number, refetched on live "stock" nudges (no polling)
  @Get('stock-alerts/count')
  @RequirePermissions('view:stock_alerts')
  @RequireFeature({ feature: 'stockAlerts' })
  alertCount(@CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.inventory.alertCount(toActor(u, b).branch_id);
  }

  @Get('stock-alerts')
  @RequirePermissions('view:stock_alerts')
  @RequireFeature({ feature: 'stockAlerts' })
  alerts(@Query(new ZodPipe(StockAlertQuerySchema)) q: StockAlertQuery, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.inventory.alerts(q, toActor(u, b).branch_id);
  }
}
