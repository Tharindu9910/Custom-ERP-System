import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CreateGatePassSchema, GatePassQuerySchema, type CreateGatePassDto, type GatePassQuery } from '@erp/shared';
import { toActor } from '../../common/actor';
import { BranchId, CurrentUser, RequireFeature, RequirePermissions } from '../../common/decorators';
import type { RequestUser } from '../../common/types';
import { ZodPipe } from '../../common/zod.pipe';
import { GatePassesService } from './gate-passes.service';

@Controller()
@RequireFeature({ feature: 'gatePass' })
export class GatePassesController {
  constructor(private readonly gatePasses: GatePassesService) {}

  @Get('gate-passes')
  @RequirePermissions('view:gate_pass')
  list(@Query(new ZodPipe(GatePassQuerySchema)) q: GatePassQuery, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.gatePasses.list(q, toActor(u, b).branch_id);
  }

  // Order forms (job card / roofing) pick from the customer's open passes
  @Get('gate-passes/available')
  available(
    @Query('phone') phone: string = '',
    @Query('include') include: string | undefined,
    @Query('order_id') orderId: string | undefined,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return this.gatePasses.available(
      phone,
      toActor(u, b).branch_id,
      include && uuid.test(include) ? include : undefined,
      orderId && uuid.test(orderId) ? orderId : undefined,
    );
  }

  // Material names used on earlier passes, so new names become suggestions
  @Get('gate-passes/materials')
  @RequirePermissions('view:gate_pass')
  materials(@CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.gatePasses.materials(toActor(u, b).branch_id);
  }

  @Get('gate-passes/:id')
  @RequirePermissions('view:gate_pass')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.gatePasses.get(id, toActor(u, b).branch_id);
  }

  @Post('gate-passes')
  @RequirePermissions('create:gate_pass')
  create(@Body(new ZodPipe(CreateGatePassSchema)) dto: CreateGatePassDto, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.gatePasses.create(dto, toActor(u, b));
  }

}
