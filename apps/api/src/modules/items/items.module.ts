import { Module } from '@nestjs/common';
import { ItemCatalogService } from './item-catalog.service';
import { ItemRequestsController } from './item-requests.controller';
import { ItemRequestsService } from './item-requests.service';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';

@Module({
  providers: [ItemsService, ItemCatalogService, ItemRequestsService],
  controllers: [ItemsController, ItemRequestsController],
  exports: [ItemsService],
})
export class ItemsModule {}
