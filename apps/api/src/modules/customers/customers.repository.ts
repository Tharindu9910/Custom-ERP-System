import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
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

  findByPhoneKey(key: string): Promise<CustomerEntity[]> {
    return this.repo
      .createQueryBuilder('c')
      .where(`right(regexp_replace(c.phone, '\\D', '', 'g'), 9) = :key`, { key })
      .orderBy('c.created_at', 'ASC')
      .limit(1)
      .getMany();
  }

  findById(customerId: string): Promise<CustomerEntity | null> {
    return this.repo.findOne({ where: { customer_id: customerId } });
  }

  /**
   * Newest customers first, optionally filtered by name or phone. Phones are
   * stored in mixed formats (+94…, 077 …), so the phone match compares digits
   * only, without a leading 0 or 94 country code.
   */
  search(term: string, branchId: string | null, limit: number): Promise<CustomerEntity[]> {
    const qb = this.repo.createQueryBuilder('c').orderBy('c.created_at', 'DESC').take(limit);
    // SUPER_ADMIN/MANAGER (null branch) can see all customers
    if (branchId !== null) qb.andWhere('c.home_branch_id = :branchId', { branchId });

    const text = term.trim();
    if (text) {
      const digits = text.replace(/\D/g, '').replace(/^(94|0)/, '');
      qb.andWhere(
        new Brackets((w) => {
          w.where('c.name ILIKE :name', { name: `%${text}%` });
          if (digits) w.orWhere(`regexp_replace(c.phone, '\\D', '', 'g') LIKE :digits`, { digits: `%${digits}%` });
        }),
      );
    }
    return qb.getMany();
  }

  save(customer: Partial<CustomerEntity>): Promise<CustomerEntity> {
    return this.repo.save(customer as CustomerEntity);
  }
}