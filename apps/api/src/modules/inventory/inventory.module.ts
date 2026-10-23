import { Module } from '@nestjs/common';
import { NetworkInventoryController } from './network-inventory.controller';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  providers: [InventoryService],
  controllers: [InventoryController, NetworkInventoryController],
  exports: [InventoryService],
})
export class InventoryModule {}
