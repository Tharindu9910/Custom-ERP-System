import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { CustomerEntity } from '../../database/entities/customer.entity';

@Injectable()
export class CustomersRepository {
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly repo: Repository<CustomerEntity>,
  ) {}

  findByPhone(phone: string): Promise<CustomerEntity | null> {
    return this.repo.findOne({ where: { phone } });
  }

  findById(customerId: string): Promise<CustomerEntity | null> {
    return this.repo.findOne({ where: { customer_id: customerId } });
  }

  searchByPhone(
    phone: string,
    branchId: string | null,
  ): Promise<CustomerEntity[]> {
    const where: Record<string, unknown> = { phone: ILike(`%${phone}%`) };
    // SUPER_ADMIN/MANAGER (null branch) can see all customers
    if (branchId !== null) where.branch_id = branchId;
    return this.repo.find({ where, order: { created_at: 'DESC' }, take: 20 });
  }

  save(customer: Partial<CustomerEntity>): Promise<CustomerEntity> {
    return this.repo.save(customer as CustomerEntity);
  }
}