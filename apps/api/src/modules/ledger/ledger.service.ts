import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { LedgerEntryEntity } from '../../database/entities/ledger-entry.entity';
import { FinancialAccountEntity } from '../../database/entities/financial-account.entity';
import { EntryType, AccountType, Role } from '@erp/shared';
import { SYSTEM_ACCOUNTS } from '@erp/shared';

type Actor = { user_id: string; role: Role | null; branch_id: string };

@Injectable()
export class LedgerService {
  constructor(
    @InjectRepository(LedgerEntryEntity)
    private readonly ledgerRepo: Repository<LedgerEntryEntity>,
    @InjectRepository(FinancialAccountEntity)
    private readonly accountRepo: Repository<FinancialAccountEntity>,
  ) {}

  async recordPayment(
    payment: {
      payment_id: string;
      job_card_id: string;
      amount: number;
      type: 'ADVANCE' | 'PARTIAL' | 'FINAL';
    },
    actor: Actor,
    em?: EntityManager,
  ): Promise<void> {
    const repo = em ? em.getRepository(LedgerEntryEntity) : this.ledgerRepo;
    const accounts = await this.getAccountMap(em);

    const base = {
      branch_id: actor.branch_id,
      job_card_id: payment.job_card_id,
      reference_type: 'PAYMENT',
      reference_id: payment.payment_id,
      created_by: actor.user_id,
      actor_role: actor.role,
    };

    if (payment.type === 'ADVANCE' || payment.type === 'PARTIAL') {
      await repo.save([
        { ...base, account_id: accounts['1200'], entry_type: EntryType.DEBIT,  amount: payment.amount, description: 'Cash received (advance)' },
        { ...base, account_id: accounts['2100'], entry_type: EntryType.CREDIT, amount: payment.amount, description: 'Advance payment recorded' },
      ]);
    } else {
      // FINAL: clear advance balance + recognise full revenue
      // The caller provides total_amount; advance_paid is resolved from ledger
      await repo.save([
        { ...base, account_id: accounts['1200'], entry_type: EntryType.DEBIT,  amount: payment.amount, description: 'Cash received (final)' },
        { ...base, account_id: accounts['4000'], entry_type: EntryType.CREDIT, amount: payment.amount, description: 'Service revenue recognised' },
      ]);
    }
  }

  async recordCancellationLoss(
    advance: { payment_id: string; job_card_id: string; amount: number },
    actor: Actor,
    em?: EntityManager,
  ): Promise<void> {
    const repo = em ? em.getRepository(LedgerEntryEntity) : this.ledgerRepo;
    const accounts = await this.getAccountMap(em);

    await repo.save({
      branch_id: actor.branch_id,
      job_card_id: advance.job_card_id,
      account_id: accounts['5200'],
      entry_type: EntryType.DEBIT,
      amount: advance.amount,
      reference_type: 'CANCELLATION',
      reference_id: advance.payment_id,
      description: 'Cancelled job loss (advance forfeited)',
      created_by: actor.user_id,
      actor_role: actor.role,
    });
  }

  async recordStockDeduction(
    line: { item_id: string; amount: number; job_card_id: string },
    actor: Actor,
    em?: EntityManager,
  ): Promise<void> {
    const repo = em ? em.getRepository(LedgerEntryEntity) : this.ledgerRepo;
    const accounts = await this.getAccountMap(em);

    await repo.save({
      branch_id: actor.branch_id,
      job_card_id: line.job_card_id,
      account_id: accounts['5100'],
      entry_type: EntryType.DEBIT,
      amount: line.amount,
      reference_type: 'STOCK_DEDUCTION',
      reference_id: line.item_id,
      description: 'Material cost recorded on stock deduction',
      created_by: actor.user_id,
      actor_role: actor.role,
    });
  }

  private async getAccountMap(em?: EntityManager): Promise<Record<string, string>> {
    const repo = em
      ? em.getRepository(FinancialAccountEntity)
      : this.accountRepo;
    const accounts = await repo.find({ where: { is_active: true } });
    return Object.fromEntries(accounts.map((a) => [a.code, a.account_id]));
  }

  async seedChartOfAccounts(): Promise<void> {
    const accounts = Object.values(SYSTEM_ACCOUNTS) as Array<{
      code: string;
      name: string;
    }>;

    for (const a of accounts) {
      const exists = await this.accountRepo.findOne({ where: { code: a.code } });
      if (!exists) {
        await this.accountRepo.save(
          this.accountRepo.create({
            code: a.code,
            name: a.name,
            account_type: this.resolveAccountType(a.code),
            normal_balance: this.resolveNormalBalance(a.code),
            is_active: true,
          }),
        );
      }
    }
  }

  private resolveAccountType(code: string): AccountType {
    if (code.startsWith('1')) return AccountType.ASSET;
    if (code.startsWith('2')) return AccountType.LIABILITY;
    if (code.startsWith('4')) return AccountType.REVENUE;
    return AccountType.EXPENSE;
  }

  private resolveNormalBalance(code: string): EntryType {
    if (code.startsWith('1')) return EntryType.DEBIT;
    if (code.startsWith('2')) return EntryType.CREDIT;
    if (code.startsWith('4')) return EntryType.CREDIT;
    return EntryType.DEBIT;
  }
}