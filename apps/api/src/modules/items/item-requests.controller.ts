import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApproveItemRequestSchema,
  CreateItemRequestSchema,
  ItemRequestQuerySchema,
  RejectItemRequestSchema,
  type ApproveItemRequestDto,
  type CreateItemRequestDto,
  type ItemRequestQuery,
  type RejectItemRequestDto,
} from '@erp/shared';
import { toActor } from '../../common/actor';
import {
  BranchId,
  CurrentUser,
  RequireFeature,
  RequirePermissions,
} from '../../common/decorators';
import type { RequestUser } from '../../common/types';
import { ZodPipe } from '../../common/zod.pipe';
import { ItemRequestsService } from './item-requests.service';

// Branch work (@BranchId): head office can read a branch's requests but not decide them (Docs/decisions/0013)
@Controller('item-requests')
@RequireFeature({ feature: 'inventory' })
export class ItemRequestsController {
  constructor(private readonly requests: ItemRequestsService) {}

  @Get()
  @RequirePermissions('view:inventory')
  list(
    @Query(new ZodPipe(ItemRequestQuerySchema)) q: ItemRequestQuery,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    return this.requests.list(q, toActor(u, b).branch_id);
  }

  // Sidebar badge for the manager, refetched on live "item_requests" nudges (no polling)
  @Get('count')
  @RequirePermissions('approve:item_request')
  count(@CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.requests.count(toActor(u, b).branch_id);
  }

  @Post()
  @RequirePermissions('request:new_item')
  create(
    @Body(new ZodPipe(CreateItemRequestSchema)) dto: CreateItemRequestDto,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    return this.requests.create(dto, toActor(u, b));
  }

  @Post(':id/approve')
  @RequirePermissions('approve:item_request')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ApproveItemRequestSchema)) dto: ApproveItemRequestDto,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    return this.requests.approve(id, dto, toActor(u, b));
  }

  @Post(':id/reject')
  @RequirePermissions('approve:item_request')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(RejectItemRequestSchema)) dto: RejectItemRequestDto,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    return this.requests.reject(id, dto.reason, toActor(u, b));
  }

  @Post(':id/cancel')
  @RequirePermissions('request:new_item')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    return this.requests.cancel(id, toActor(u, b));
  }
}
