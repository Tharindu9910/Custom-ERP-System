import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  CreatePriceRateSchema,
  ItemPriceQuerySchema,
  PriceRateQuerySchema,
  UpdateItemPriceSchema,
  UpdatePriceRateSchema,
  type CreatePriceRateDto,
  type ItemPriceQuery,
  type PriceRateQuery,
  type UpdateItemPriceDto,
  type UpdatePriceRateDto,
} from '@erp/shared';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import type { RequestUser } from '../../common/types';
import { ZodPipe } from '../../common/zod.pipe';
import { PriceListService } from './price-list.service';

// A global setting: no @BranchId, so head office (ADMIN) can edit it too (Docs/decisions/0004)
@Controller('price-list')
export class PriceListController {
  constructor(private readonly priceList: PriceListService) {}

  @Get('rates')
  @RequirePermissions('view:price_list')
  listRates(@Query(new ZodPipe(PriceRateQuerySchema)) q: PriceRateQuery) {
    return this.priceList.listRates(q);
  }

  @Post('rates')
  @RequirePermissions('configure:price_list')
  createRate(@Body(new ZodPipe(CreatePriceRateSchema)) dto: CreatePriceRateDto, @CurrentUser() u: RequestUser) {
    return this.priceList.createRate(dto, u);
  }

  @Patch('rates/:id')
  @RequirePermissions('configure:price_list')
  updateRate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpdatePriceRateSchema)) dto: UpdatePriceRateDto,
    @CurrentUser() u: RequestUser,
  ) {
    return this.priceList.updateRate(id, dto, u);
  }

  @Get('items')
  @RequirePermissions('view:price_list')
  listItems(@Query(new ZodPipe(ItemPriceQuerySchema)) q: ItemPriceQuery) {
    return this.priceList.listItems(q);
  }

  @Patch('items/:id')
  @RequirePermissions('configure:item_prices')
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(UpdateItemPriceSchema)) dto: UpdateItemPriceDto,
    @CurrentUser() u: RequestUser,
  ) {
    return this.priceList.updateItemPrice(id, dto, u);
  }
}
