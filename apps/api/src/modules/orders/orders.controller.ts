import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import {
  CompleteWorkSchema,
  CreateJobCardSchema,
  CreateRoofingOrderSchema,
  OrderHistoryQuerySchema,
  OrderType,
  QuoteJobCardSchema,
  QuoteRoofingSchema,
  ReasonSchema,
  RecordPaymentSchema,
  ReleaseOrderSchema,
  RoofingQueueQuerySchema,
  StartWorkSchema,
  UpdateJobCardSchema,
  UpdateRoofingOrderSchema,
  WorkshopQueueQuerySchema,
  type CompleteWorkDto,
  type CreateJobCardDto,
  type CreateRoofingOrderDto,
  type QuoteJobCardDto,
  type QuoteRoofingDto,
  type ReasonDto,
  type RecordPaymentDto,
  type ReleaseOrderDto,
  type OrderHistoryQuery,
  type RoofingQueueQuery,
  type StartWorkDto,
  type UpdateJobCardDto,
  type UpdateRoofingOrderDto,
  type WorkshopQueueQuery,
} from '@erp/shared';
import { toActor } from '../../common/actor';
import { BranchId, CurrentUser, RequireFeature, RequirePermissions } from '../../common/decorators';
import type { RequestUser } from '../../common/types';
import { ZodPipe } from '../../common/zod.pipe';
import { JobCardsService } from './job-cards.service';
import { LineActionsService } from './line-actions.service';
import { OrderQueriesService } from './order-queries.service';
import { PaymentsService } from './payments.service';
import { RoofingOrdersService } from './roofing-orders.service';

@Controller()
export class OrdersController {
  constructor(
    private readonly jobCards: JobCardsService,
    private readonly lines: LineActionsService,
    private readonly queries: OrderQueriesService,
    private readonly payments: PaymentsService,
    private readonly roofing: RoofingOrdersService,
  ) {}

  // ── Job cards (workshop) ──────────────────────────────────────────────────

  @Post('job-cards/quote')
  @HttpCode(200)
  @RequirePermissions('create:job_card')
  @RequireFeature({ section: 'workshop' })
  quote(@Body(new ZodPipe(QuoteJobCardSchema)) dto: QuoteJobCardDto, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.jobCards.quote(dto.lines, toActor(u, b));
  }

  @Post('job-cards')
  @RequirePermissions('create:job_card')
  @RequireFeature({ section: 'workshop' })
  create(@Body(new ZodPipe(CreateJobCardSchema)) dto: CreateJobCardDto, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.jobCards.create(dto, toActor(u, b));
  }

  @Put('job-cards/:id')
  @RequirePermissions('create:job_card')
  @RequireFeature({ section: 'workshop' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpdateJobCardSchema)) dto: UpdateJobCardDto,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    return this.jobCards.update(id, dto, toActor(u, b));
  }

  @Post('job-cards/:id/void')
  @RequirePermissions('cancel:job_card_draft')
  void(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ReasonSchema)) dto: ReasonDto, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.jobCards.void(id, dto.reason, toActor(u, b));
  }

  /** History popup on Create Job Card: this branch's job cards in a date range. */
  @Get('job-cards/history')
  @RequirePermissions('create:job_card')
  @RequireFeature({ section: 'workshop' })
  jobCardHistory(@Query(new ZodPipe(OrderHistoryQuerySchema)) q: OrderHistoryQuery, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.queries.history(OrderType.JOB_CARD, q, toActor(u, b).branch_id);
  }

  @Get('workshop-queue')
  @RequirePermissions('view:job_cards')
  @RequireFeature({ section: 'workshop' })
  workshopQueue(@Query(new ZodPipe(WorkshopQueueQuerySchema)) q: WorkshopQueueQuery, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.queries.workshopQueue(q, toActor(u, b).branch_id);
  }

  @Post('order-lines/:id/start')
  @RequirePermissions('update:job_card_status')
  start(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(StartWorkSchema)) dto: StartWorkDto, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.lines.start(id, dto, toActor(u, b));
  }

  @Post('order-lines/:id/complete')
  @RequirePermissions('complete:work_order')
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(CompleteWorkSchema)) dto: CompleteWorkDto,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    return this.lines.complete(id, dto, toActor(u, b));
  }

  // ── Roofing orders ────────────────────────────────────────────────────────

  @Post('roofing-orders/quote')
  @HttpCode(200)
  @RequirePermissions('create:roofing_order')
  @RequireFeature({ section: 'roofing' })
  roofingQuote(@Body(new ZodPipe(QuoteRoofingSchema)) dto: QuoteRoofingDto, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.roofing.quote(dto, toActor(u, b));
  }

  @Post('roofing-orders')
  @RequirePermissions('create:roofing_order')
  @RequireFeature({ section: 'roofing' })
  placeRoofingOrder(@Body(new ZodPipe(CreateRoofingOrderSchema)) dto: CreateRoofingOrderDto, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.roofing.create(dto, toActor(u, b));
  }

  @Put('roofing-orders/:id')
  @RequirePermissions('edit:order')
  @RequireFeature({ section: 'roofing' })
  updateRoofingOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpdateRoofingOrderSchema)) dto: UpdateRoofingOrderDto,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    return this.roofing.update(id, dto, toActor(u, b));
  }

  /** History popup on Create Order: this branch's roofing orders in a date range. */
  @Get('roofing-orders/history')
  @RequirePermissions('create:roofing_order')
  @RequireFeature({ section: 'roofing' })
  roofingOrderHistory(@Query(new ZodPipe(OrderHistoryQuerySchema)) q: OrderHistoryQuery, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.queries.history(OrderType.ROOFING_ORDER, q, toActor(u, b).branch_id);
  }

  @Get('roofing-queue')
  @RequirePermissions('view:orders')
  @RequireFeature({ section: 'roofing' })
  roofingQueue(@Query(new ZodPipe(RoofingQueueQuerySchema)) q: RoofingQueueQuery, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.queries.roofingQueue(q, toActor(u, b).branch_id);
  }

  @Post('roofing-orders/:id/start')
  @RequirePermissions('update:order_status')
  startRoofingOrder(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(StartWorkSchema)) dto: StartWorkDto, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.roofing.start(id, dto, toActor(u, b));
  }

  @Post('roofing-orders/:id/complete')
  @RequirePermissions('update:order_status')
  completeRoofingOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(CompleteWorkSchema)) dto: CompleteWorkDto,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    return this.roofing.complete(id, dto, toActor(u, b));
  }

  @Post('roofing-orders/:id/release')
  @RequirePermissions('release:order')
  releaseRoofingOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ReleaseOrderSchema)) dto: ReleaseOrderDto,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    return this.roofing.release(id, dto, toActor(u, b));
  }

  @Post('roofing-orders/:id/cancel')
  @RequirePermissions('cancel:order')
  cancelRoofingOrder(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ReasonSchema)) dto: ReasonDto, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.roofing.cancel(id, dto.reason, toActor(u, b));
  }

  // ── Orders (shared) ───────────────────────────────────────────────────────

  @Get('orders/:id')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.queries.detail(id, toActor(u, b).branch_id);
  }

  // ── Cashier (minimal) ─────────────────────────────────────────────────────

  @Get('cashier-queue')
  @RequirePermissions('process:payment')
  cashierQueue(@CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.queries.cashierQueue(toActor(u, b).branch_id);
  }

  @Post('orders/:id/payments')
  @RequirePermissions('process:payment')
  recordPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(RecordPaymentSchema)) dto: RecordPaymentDto,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    return this.payments.record(id, dto, toActor(u, b));
  }
}
