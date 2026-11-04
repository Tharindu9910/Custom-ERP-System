import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { BranchId, CurrentUser, RequirePermissions } from '../../common/decorators';
import { RequestUser } from '../../common/types';
import { ZodPipe } from '../../common/zod.pipe';
import { UuidPipe } from '../../common/uuid.pipe';
import {
  CustomerCreateBodySchema,
  CustomerLookupQuerySchema,
  CustomerSearchQuerySchema,
  CustomerUpdateBodySchema,
} from '@erp/shared';
import { CustomersService, CreateCustomerDto, UpdateCustomerDto } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  /** Newest customers in the caller's scope; `q` filters by name or phone (`phone` kept for older callers). */
  @Get()
  searchCustomers(
    @Query(new ZodPipe(CustomerSearchQuerySchema)) { q, phone, limit }: { q: string; phone: string; limit: string },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.customersService.searchCustomers(q || phone, actor.branch_id, Number(limit) || 50);
  }

  // Prefills intake forms; returns only id, name and phone
  @Get('lookup')
  lookup(@Query(new ZodPipe(CustomerLookupQuerySchema)) { phone }: { phone: string }) {
    return this.customersService.lookupByPhone(phone);
  }

  // @BranchId() refuses global roles (view-only, Docs/decisions/0002)
  @Post()
  @RequirePermissions('complete:customer_profile')
  createCustomer(@Body(new ZodPipe(CustomerCreateBodySchema)) dto: CreateCustomerDto, @BranchId() branchId: string | null, @CurrentUser() actor: RequestUser) {
    return this.customersService.createCustomer(dto, branchId, actor);
  }

  @Patch(':id')
  @RequirePermissions('complete:customer_profile')
  updateCustomer(
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(CustomerUpdateBodySchema)) dto: UpdateCustomerDto,
    @BranchId() branchId: string | null,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.customersService.updateCustomer(id, dto, branchId, actor);
  }
}