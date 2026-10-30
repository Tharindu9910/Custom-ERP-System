import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  CancelHardwareSaleSchema,
  CreateHardwareSaleSchema,
  HardwareStoreQuerySchema,
  PayHardwareSaleSchema,
  type CancelHardwareSaleDto,
  type CreateHardwareSaleDto,
  type HardwareStoreQuery,
  type PayHardwareSaleDto,
} from '@erp/shared';
import { toActor } from '../../common/actor';
import { BranchId, CurrentUser, RequireFeature, RequirePermissions } from '../../common/decorators';
import type { RequestUser } from '../../common/types';
import { ZodPipe } from '../../common/zod.pipe';
import { HardwareQueriesService } from './hardware-queries.service';
import { HardwareSalesService } from './hardware-sales.service';

/**
 * Hardware Store (place orders) and Hardware Queue (collect payment), Docs/decisions/0006.
 * Role permission decides who; the branch feature switch decides where.
 * Each screen loads with one GET; the order detail modal reuses GET /orders/:id.
 */
@Controller()
export class HardwareSalesController {
  constructor(
    private readonly sales: HardwareSalesService,
    private readonly queries: HardwareQueriesService,
  ) {}

  // ── Hardware Store ────────────────────────────────────────────────────────

  @Get('hardware-store/items')
  @RequirePermissions('create:hardware_sale')
  @RequireFeature({ feature: 'hardwareStore' })
  storeItems(@Query(new ZodPipe(HardwareStoreQuerySchema)) q: HardwareStoreQuery, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.queries.storeItems(toActor(u, b), q.branch_id);
  }

  @Post('hardware-sales')
  @RequirePermissions('create:hardware_sale')
  @RequireFeature({ feature: 'hardwareStore' })
  create(@Body(new ZodPipe(CreateHardwareSaleSchema)) dto: CreateHardwareSaleDto, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.sales.create(dto, toActor(u, b));
  }

  // ── Hardware Queue ────────────────────────────────────────────────────────

  @Get('hardware-queue')
  @RequirePermissions('view:hardware_queue')
  @RequireFeature({ feature: 'hardwareQueue' })
  queue(@CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.queries.queue(toActor(u, b).branch_id);
  }

  @Post('hardware-sales/:id/pay')
  @RequirePermissions('process:payment')
  @RequireFeature({ feature: 'hardwareQueue' })
  pay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(PayHardwareSaleSchema)) dto: PayHardwareSaleDto,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    return this.sales.pay(id, dto, toActor(u, b));
  }

  @Post('hardware-sales/:id/cancel')
  @RequirePermissions('cancel:hardware_sale')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(CancelHardwareSaleSchema)) dto: CancelHardwareSaleDto,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    return this.sales.cancel(id, dto, toActor(u, b));
  }
}
