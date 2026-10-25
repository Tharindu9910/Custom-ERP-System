import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { AllocationsService } from './allocations.service';
import { GatePassesController } from './gate-passes.controller';
import { GatePassesService } from './gate-passes.service';

@Module({
  imports: [CustomersModule],
  providers: [GatePassesService, AllocationsService],
  controllers: [GatePassesController],
  exports: [GatePassesService, AllocationsService],
})
export class GatePassesModule {}
