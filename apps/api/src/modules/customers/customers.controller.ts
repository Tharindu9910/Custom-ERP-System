import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { RequestUser } from '../../common/types';
import { CustomersService, CreateCustomerDto, UpdateCustomerDto } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  searchCustomers(
    @Query('phone') phone: string = '',
    @CurrentUser() actor: RequestUser,
  ) {
    return this.customersService.searchCustomers(phone, actor.branch_id);
  }

  @Post()
  @RequirePermissions('create:job_card')
  createCustomer(@Body() dto: CreateCustomerDto, @CurrentUser() actor: RequestUser) {
    return this.customersService.createCustomer(dto, actor.branch_id);
  }

  @Patch(':id')
  @RequirePermissions('complete:customer_profile')
  updateCustomer(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.customersService.updateCustomer(id, dto, actor.branch_id);
  }
}