import { Module } from '@nestjs/common';
import { NetworkTransfersController } from './network-transfers.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { StockTransfersController } from './stock-transfers.controller';
import { StockTransfersService } from './stock-transfers.service';

@Module({
  imports: [InventoryModule],
  providers: [StockTransfersService],
  controllers: [StockTransfersController, NetworkTransfersController],
  exports: [StockTransfersService],
})
export class StockTransfersModule {}
