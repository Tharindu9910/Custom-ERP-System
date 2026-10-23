import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  CreateStockTransferSchema,
  ReceiveStockTransferSchema,
  RejectStockTransferSchema,
  SendStockTransferSchema,
  StockTransferQuerySchema,
  TransferItemSearchSchema,
  type CreateStockTransferDto,
  type ReceiveStockTransferDto,
  type RejectStockTransferDto,
  type SendStockTransferDto,
  type StockTransferQuery,
  type TransferItemSearch,
} from '@erp/shared';
import { toActor } from '../../common/actor';
import { BranchId, CurrentUser, RequireFeature, RequirePermissions } from '../../common/decorators';
import type { RequestUser } from '../../common/types';
import { ZodPipe } from '../../common/zod.pipe';
import { StockTransfersService } from './stock-transfers.service';

// request:stock = ask, cancel and receive; send:stock = send or reject what others ask us for
@Controller('stock-transfers')
@RequireFeature({ feature: 'stockRequest' })
export class StockTransfersController {
  constructor(private readonly transfers: StockTransfersService) {}

  @Get('targets')
  @RequirePermissions('request:stock')
  targets(@CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.transfers.targets(toActor(u, b).branch_id);
  }

  @Get('items')
  @RequirePermissions('request:stock')
  items(@Query(new ZodPipe(TransferItemSearchSchema)) q: TransferItemSearch, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.transfers.searchItems(q, toActor(u, b).branch_id);
  }

  @Get()
  @RequirePermissions('request:stock')
  list(@Query(new ZodPipe(StockTransferQuerySchema)) q: StockTransferQuery, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.transfers.list(q, toActor(u, b).branch_id);
  }

  @Get(':id')
  @RequirePermissions('request:stock')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.transfers.get(id, toActor(u, b).branch_id);
  }

  @Post()
  @RequirePermissions('request:stock')
  create(@Body(new ZodPipe(CreateStockTransferSchema)) dto: CreateStockTransferDto, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.transfers.create(dto, toActor(u, b));
  }

  @Post(':id/send')
  @RequirePermissions('send:stock')
  send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(SendStockTransferSchema)) dto: SendStockTransferDto,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    return this.transfers.send(id, dto, toActor(u, b));
  }

  @Post(':id/reject')
  @RequirePermissions('send:stock')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(RejectStockTransferSchema)) dto: RejectStockTransferDto,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    return this.transfers.reject(id, dto, toActor(u, b));
  }

  @Post(':id/cancel')
  @RequirePermissions('request:stock')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.transfers.cancel(id, toActor(u, b));
  }

  @Post(':id/receive')
  @RequirePermissions('request:stock')
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ReceiveStockTransferSchema)) dto: ReceiveStockTransferDto,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    return this.transfers.receive(id, dto, toActor(u, b));
  }
}
