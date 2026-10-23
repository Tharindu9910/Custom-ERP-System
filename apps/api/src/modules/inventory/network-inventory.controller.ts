import { Controller, Get, Query } from '@nestjs/common';
import { InventoryQuerySchema, StockAlertQuerySchema, type InventoryQuery, type StockAlertQuery } from '@erp/shared';
import { requireGlobal } from '../../common/actor';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import type { RequestUser } from '../../common/types';
import { ZodPipe } from '../../common/zod.pipe';
import { InventoryService } from './inventory.service';

/**
 * Head-office (global role) reads across every branch. No X-Branch-Id: the
 * branches come from the data, and each one's module switches are respected.
 */
@Controller('network')
export class NetworkInventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('inventory')
  @RequirePermissions('view:inventory')
  list(@Query(new ZodPipe(InventoryQuerySchema)) q: InventoryQuery, @CurrentUser() u: RequestUser) {
    requireGlobal(u);
    return this.inventory.networkList(q);
  }

  @Get('stock-alerts')
  @RequirePermissions('view:stock_alerts')
  alerts(@Query(new ZodPipe(StockAlertQuerySchema)) q: StockAlertQuery, @CurrentUser() u: RequestUser) {
    requireGlobal(u);
    return this.inventory.networkAlerts(q);
  }
}
