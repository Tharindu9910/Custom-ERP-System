import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { LedgerModule } from '../ledger/ledger.module';
import { OrdersModule } from '../orders/orders.module';
import { HardwareQueriesService } from './hardware-queries.service';
import { HardwareSalesController } from './hardware-sales.controller';
import { HardwareSalesService } from './hardware-sales.service';

@Module({
  imports: [OrdersModule, CustomersModule, LedgerModule],
  providers: [HardwareSalesService, HardwareQueriesService],
  controllers: [HardwareSalesController],
})
export class HardwareSalesModule {}
