import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomerType } from '@erp/shared';
import { ERR } from '../../common/errors';
import { CustomerEntity } from '../../database/entities/customer.entity';
import { CustomersRepository } from './customers.repository';

export class CreateCustomerDto {
  full_name: string;
  phone: string;
}

export class UpdateCustomerDto {
  full_name?: string;
  email?: string;
  address?: string;
  customer_type?: CustomerType;
  company_name?: string;
  contact_person?: string;
}

@Injectable()
export class CustomersService {
  constructor(private readonly customersRepo: CustomersRepository) {}

  searchCustomers(
    phone: string,
    branchId: string | null,
  ): Promise<CustomerEntity[]> {
    return this.customersRepo.searchByPhone(phone, branchId);
  }

  async createCustomer(
    dto: CreateCustomerDto,
    branchId: string | null,
  ): Promise<CustomerEntity> {
    const existing = await this.customersRepo.findByPhone(dto.phone);
    if (existing) throw new ConflictException(ERR.CUSTOMER_PHONE_EXISTS);

    return this.customersRepo.save({
      full_name: dto.full_name,
      phone: dto.phone,
      branch_id: branchId,
      customer_type: CustomerType.INDIVIDUAL,
    });
  }

  async updateCustomer(
    customerId: string,
    dto: UpdateCustomerDto,
    branchId: string | null,
  ): Promise<CustomerEntity> {
    const customer = await this.customersRepo.findById(customerId);
    if (!customer) throw new NotFoundException(ERR.CUSTOMER_NOT_FOUND);

    // Branch-scoped users can only update their own branch's customers
    if (branchId !== null && customer.branch_id !== branchId) {
      throw new NotFoundException(ERR.CUSTOMER_NOT_FOUND);
    }

    if (dto.full_name !== undefined) customer.full_name = dto.full_name;
    if (dto.email !== undefined) customer.email = dto.email ?? null;
    if (dto.address !== undefined) customer.address = dto.address ?? null;
    if (dto.customer_type !== undefined) customer.customer_type = dto.customer_type;
    if (dto.company_name !== undefined) customer.company_name = dto.company_name ?? null;
    if (dto.contact_person !== undefined) customer.contact_person = dto.contact_person ?? null;

    return this.customersRepo.save(customer);
  }
}