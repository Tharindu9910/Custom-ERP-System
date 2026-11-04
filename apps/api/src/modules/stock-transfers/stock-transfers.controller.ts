import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  CorrectTransferShortageSchema,
  CreateStockTransferSchema,
  Role,
  ReceiveStockTransferSchema,
  RejectStockTransferSchema,
  SendStockTransferSchema,
  StockTransferQuerySchema,
  TransferItemSearchSchema,
  type CorrectTransferShortageDto,
  type CreateStockTransferDto,
  type ReceiveStockTransferDto,
  type RejectStockTransferDto,
  type SendStockTransferDto,
  type StockTransferQuery,
  type TransferItemSearch,
} from '@erp/shared';
import { toActor } from '../../common/actor';
import { BranchId, CurrentUser, RequireAnyPermission, RequireFeature, RequirePermissions } from '../../common/decorators';
import type { RequestUser } from '../../common/types';
import { UuidPipe } from '../../common/uuid.pipe';
import { ZodPipe } from '../../common/zod.pipe';
import { RolePermissionsService } from '../../core/role-permissions.service';
import { StockTransfersService } from './stock-transfers.service';

// request:stock = ask, cancel and receive; send:stock = send or reject what others ask us for;
// approve:transfer_shortage = the manager settles a request that arrived short (Docs/decisions/0014),
// so that permission also opens the lists, without being able to ask or receive
const READ = ['request:stock', 'approve:transfer_shortage'];

@Controller('stock-transfers')
@RequireFeature({ feature: 'stockRequest' })
export class StockTransfersController {
  constructor(
    private readonly transfers: StockTransfersService,
    private readonly rolePermissions: RolePermissionsService,
  ) {}

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
  @RequireAnyPermission(...READ)
  list(@Query(new ZodPipe(StockTransferQuerySchema)) q: StockTransferQuery, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.transfers.list(q, toActor(u, b).branch_id);
  }

  // Sidebar badge: just the number, refetched on live "transfers" nudges (no polling)
  @Get('count')
  @RequireAnyPermission(...READ)
  async count(@CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    const may = (action: string) => (u.role === Role.SUPER_ADMIN ? Promise.resolve(true) : this.rolePermissions.has(u.role, action));
    const [handle, approve] = await Promise.all([may('request:stock'), may('approve:transfer_shortage')]);
    return this.transfers.todoCount(toActor(u, b).branch_id, { handle, approve });
  }

  @Get(':id')
  @RequireAnyPermission(...READ)
  get(@Param('id', UuidPipe) id: string, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
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
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(SendStockTransferSchema)) dto: SendStockTransferDto,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    return this.transfers.send(id, dto, toActor(u, b));
  }

  @Post(':id/reject')
  @RequirePermissions('send:stock')
  reject(
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(RejectStockTransferSchema)) dto: RejectStockTransferDto,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    return this.transfers.reject(id, dto, toActor(u, b));
  }

  @Post(':id/cancel')
  @RequirePermissions('request:stock')
  cancel(@Param('id', UuidPipe) id: string, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.transfers.cancel(id, toActor(u, b));
  }

  @Post(':id/receive')
  @RequirePermissions('request:stock')
  receive(
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(ReceiveStockTransferSchema)) dto: ReceiveStockTransferDto,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    return this.transfers.receive(id, dto, toActor(u, b));
  }

  /** Manager accepts the missing part of a short delivery as lost. */
  @Post(':id/shortage/approve')
  @RequirePermissions('approve:transfer_shortage')
  approveShortage(@Param('id', UuidPipe) id: string, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.transfers.approveShortage(id, toActor(u, b));
  }

  /** Manager raises a short count when more turned up; the extra goes into stock. */
  @Post(':id/shortage/correct')
  @RequirePermissions('approve:transfer_shortage')
  correctShortage(
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(CorrectTransferShortageSchema)) dto: CorrectTransferShortageDto,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    return this.transfers.correctShortage(id, dto, toActor(u, b));
  }
}
