import { Module } from '@nestjs/common';
import { PriceListController } from './price-list.controller';
import { PriceListService } from './price-list.service';

@Module({
  providers: [PriceListService],
  controllers: [PriceListController],
})
export class PriceListModule {}
