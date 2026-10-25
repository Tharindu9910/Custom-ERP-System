import { Controller, Get, Query } from '@nestjs/common';
import { NetworkTransferQuerySchema, type NetworkTransferQuery } from '@erp/shared';
import { requireGlobal } from '../../common/actor';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import type { RequestUser } from '../../common/types';
import { ZodPipe } from '../../common/zod.pipe';
import { StockTransfersService } from './stock-transfers.service';

/** Head office: every stock request between branches, read-only. */
@Controller('network')
export class NetworkTransfersController {
  constructor(private readonly transfers: StockTransfersService) {}

  @Get('stock-transfers')
  @RequirePermissions('view:inventory')
  list(@Query(new ZodPipe(NetworkTransferQuerySchema)) q: NetworkTransferQuery, @CurrentUser() u: RequestUser) {
    requireGlobal(u);
    return this.transfers.networkList(q);
  }
}
