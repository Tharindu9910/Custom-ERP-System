import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { CustomerType, phoneKey, type CustomerRef } from '@erp/shared';
import { ERR } from '../../common/errors';
import type { Actor } from '../../common/actor';
import { AuditService } from '../../core/audit.service';
import { CustomerEntity } from '../../database/entities/customer.entity';
import { CustomersRepository } from './customers.repository';

export class CreateCustomerDto {
  name: string;
  phone: string;
}

export class UpdateCustomerDto {
  name?: string;
  email?: string | null;
  address?: string | null;
  customer_type?: CustomerType;
  company_name?: string | null;
  contact_person?: string | null;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly customersRepo: CustomersRepository,
    private readonly audit: AuditService,
  ) {}

  /** Exact match on the last 9 digits, however the phone was typed (prototype rule). */
  async lookupByPhone(phone: string): Promise<Pick<CustomerEntity, 'customer_id' | 'name' | 'phone'> | null> {
    const key = phoneKey(phone);
    if (key.length < 7) return null;
    const rows = await this.customersRepo.findByPhoneKey(key);
    return rows[0] ? { customer_id: rows[0].customer_id, name: rows[0].name, phone: rows[0].phone } : null;
  }

  /**
   * Intake forms (gate pass, job card, roofing order) identify the customer by
   * phone. An existing profile is reused as-is (the cashier completes it); a new
   * basic profile is created otherwise. Runs inside the caller's transaction.
   */
  async findOrCreateForIntake(em: EntityManager, ref: CustomerRef, branchId: string, actorId: string): Promise<string> {
    const key = phoneKey(ref.phone);
    const existing: { customer_id: string }[] = await em.query(
      `SELECT customer_id FROM customer WHERE right(regexp_replace(phone, '\\D', '', 'g'), 9) = $1 ORDER BY created_at LIMIT 1`,
      [key],
    );
    if (existing[0]) return existing[0].customer_id;
    const rows: { customer_id: string }[] = await em.query(
      `INSERT INTO customer (name, phone, home_branch_id, customer_type, created_by)
       VALUES ($1, $2, $3, 'INDIVIDUAL', $4)
       ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
       RETURNING customer_id`,
      [ref.name.trim(), ref.phone.trim(), branchId, actorId],
    );
    return rows[0].customer_id;
  }

  searchCustomers(term: string, branchId: string | null, limit = 50): Promise<CustomerEntity[]> {
    return this.customersRepo.search(term, branchId, Math.min(Math.max(limit, 1), 200));
  }

  async createCustomer(
    dto: CreateCustomerDto,
    branchId: string | null,
    actor: Pick<Actor, 'user_id' | 'role'>,
  ): Promise<CustomerEntity> {
    const existing = await this.customersRepo.findByPhone(dto.phone);
    if (existing) throw new ConflictException(ERR.CUSTOMER_PHONE_EXISTS);

    const saved = await this.customersRepo.save({
      name: dto.name,
      phone: dto.phone,
      home_branch_id: branchId,
      customer_type: CustomerType.INDIVIDUAL,
      created_by: actor.user_id,
    });
    this.audit.record({ ...actor, branch_id: branchId }, { type: 'customer', id: saved.customer_id }, 'CREATE', { after: { name: saved.name, phone: saved.phone } });
    return saved;
  }

  async updateCustomer(
    customerId: string,
    dto: UpdateCustomerDto,
    branchId: string | null,
    actor: Pick<Actor, 'user_id' | 'role'>,
  ): Promise<CustomerEntity> {
    const customer = await this.customersRepo.findById(customerId);
    if (!customer) throw new NotFoundException(ERR.CUSTOMER_NOT_FOUND);

    // Branch-scoped users can only update their own branch's customers
    if (branchId !== null && customer.home_branch_id !== branchId) {
      throw new NotFoundException(ERR.CUSTOMER_NOT_FOUND);
    }

    const snapshot = (c: CustomerEntity) => ({
      name: c.name, email: c.email, address: c.address, customer_type: c.customer_type, company_name: c.company_name, contact_person: c.contact_person,
    });
    const before = snapshot(customer);
    if (dto.name !== undefined) customer.name = dto.name;
    if (dto.email !== undefined) customer.email = dto.email ?? null;
    if (dto.address !== undefined) customer.address = dto.address ?? null;
    if (dto.customer_type !== undefined) customer.customer_type = dto.customer_type;
    if (dto.company_name !== undefined) customer.company_name = dto.company_name ?? null;
    if (dto.contact_person !== undefined) customer.contact_person = dto.contact_person ?? null;

    if (customer.customer_type === CustomerType.BUSINESS && !customer.company_name) {
      throw new BadRequestException(ERR.CUSTOMER_COMPANY_REQUIRED);
    }

    const saved = await this.customersRepo.save(customer);
    this.audit.record({ ...actor, branch_id: branchId }, { type: 'customer', id: customerId }, 'UPDATE', { before, after: snapshot(saved) });
    return saved;
  }
}