import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { BranchContextService } from './branch-context.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { FeatureGuard } from './feature.guard';
import { NumberService } from './number.service';
import { StockService } from './stock.service';

/** Cross-cutting services every feature module uses. */
@Global()
@Module({
  controllers: [EventsController],
  providers: [BranchContextService, NumberService, StockService, AuditService, EventsService, FeatureGuard],
  exports: [BranchContextService, NumberService, StockService, AuditService, EventsService, FeatureGuard],
})
export class CoreModule {}
