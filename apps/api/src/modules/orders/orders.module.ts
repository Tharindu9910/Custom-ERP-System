import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { CustomersModule } from '../customers/customers.module';
import { GatePassesModule } from '../gate-passes/gate-passes.module';
import { ItemsModule } from '../items/items.module';
import { LedgerModule } from '../ledger/ledger.module';
import { JobCardsService } from './job-cards.service';
import { LineActionsService } from './line-actions.service';
import { OrderAccessService } from './order-access.service';
import { OrderQueriesService } from './order-queries.service';
import { OrdersController } from './orders.controller';
import { PaymentsService } from './payments.service';
import { PricingService } from './pricing.service';
import { RoofingOrdersService } from './roofing-orders.service';

@Module({
  imports: [CustomersModule, GatePassesModule, LedgerModule, ItemsModule, AttachmentsModule],
  providers: [OrderAccessService, PricingService, OrderQueriesService, JobCardsService, LineActionsService, PaymentsService, RoofingOrdersService],
  controllers: [OrdersController],
  exports: [OrderAccessService, PricingService, OrderQueriesService, PaymentsService],
})
export class OrdersModule {}
