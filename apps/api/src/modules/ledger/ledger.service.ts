import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { LedgerEntryEntity } from '../../database/entities/ledger-entry.entity';
import { FinancialAccountEntity } from '../../database/entities/financial-account.entity';
import { EntryType, AccountType, OrderType, Role } from '@erp/shared';
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
      order_id: string;
      amount: number;
      kind: 'ADVANCE' | 'PARTIAL' | 'FINAL';
      order_type?: OrderType;
    },
    actor: Actor,
    em?: EntityManager,
  ): Promise<void> {
    const repo = em ? em.getRepository(LedgerEntryEntity) : this.ledgerRepo;
    const accounts = await this.getAccountMap(em);

    const base = {
      branch_id: actor.branch_id,
      order_id: payment.order_id,
      source_type: 'PAYMENT' as const,
      source_id: payment.payment_id,
      created_by: actor.user_id,
      actor_role: actor.role,
    };

    if (payment.kind === 'ADVANCE' || payment.kind === 'PARTIAL') {
      await repo.save([
        { ...base, account_id: accounts['1200'], entry_type: EntryType.DEBIT,  amount: payment.amount, description: 'Cash received (advance)' },
        { ...base, account_id: accounts['2100'], entry_type: EntryType.CREDIT, amount: payment.amount, description: 'Advance payment recorded' },
      ]);
    } else {
      // FINAL: the order is now paid in full, so the whole total is revenue. The advances
      // taken earlier move out of 2100 (advance liability) into revenue alongside this payment.
      const advances = await this.advanceBalance(repo, payment.order_id);
      const revenue = payment.order_type === OrderType.HARDWARE_SALE
        ? { account_id: accounts['4100'], description: 'Hardware sale revenue recognised' }
        : { account_id: accounts['4000'], description: 'Service revenue recognised' };
      await repo.save([
        { ...base, account_id: accounts['1200'], entry_type: EntryType.DEBIT,  amount: payment.amount, description: 'Cash received (final)' },
        { ...base, ...revenue, entry_type: EntryType.CREDIT, amount: payment.amount },
        ...(advances > 0
          ? [
              { ...base, account_id: accounts['2100'], entry_type: EntryType.DEBIT, amount: advances, description: 'Advances cleared on final payment' },
              { ...base, ...revenue, entry_type: EntryType.CREDIT, amount: advances },
            ]
          : []),
      ]);
    }
  }

  /** What the order still holds in 2100 (advances credited minus any already cleared). */
  private async advanceBalance(repo: Repository<LedgerEntryEntity>, orderId: string): Promise<number> {
    const [row]: { balance: string | null }[] = await repo.query(
      `SELECT SUM(CASE WHEN e.entry_type = 'CREDIT' THEN e.amount ELSE -e.amount END) AS balance
       FROM ledger_entry e JOIN financial_account a ON a.account_id = e.account_id
       WHERE e.order_id = $1 AND a.code = '2100'`,
      [orderId],
    );
    return Math.max(0, Number(row?.balance ?? 0));
  }

  async recordCancellationLoss(
    advance: { payment_id: string; order_id: string; amount: number },
    actor: Actor,
    em?: EntityManager,
  ): Promise<void> {
    const repo = em ? em.getRepository(LedgerEntryEntity) : this.ledgerRepo;
    const accounts = await this.getAccountMap(em);

    await repo.save({
      branch_id: actor.branch_id,
      order_id: advance.order_id,
      account_id: accounts['5200'],
      entry_type: EntryType.DEBIT,
      amount: advance.amount,
      source_type: 'CANCELLATION',
      source_id: advance.payment_id,
      description: 'Cancelled job loss (advance forfeited)',
      created_by: actor.user_id,
      actor_role: actor.role,
    });
  }

  async recordStockDeduction(
    line: { item_id: string; amount: number; order_id: string },
    actor: Actor,
    em?: EntityManager,
  ): Promise<void> {
    const repo = em ? em.getRepository(LedgerEntryEntity) : this.ledgerRepo;
    const accounts = await this.getAccountMap(em);

    await repo.save({
      branch_id: actor.branch_id,
      order_id: line.order_id,
      account_id: accounts['5100'],
      entry_type: EntryType.DEBIT,
      amount: line.amount,
      source_type: 'STOCK_DEDUCTION',
      source_id: line.item_id,
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
    const map = Object.fromEntries(accounts.map((a) => [a.code, a.account_id]));
    // A missing account would insert NULL and fail as an unexplained 500; say which one
    const missing = Object.values(SYSTEM_ACCOUNTS).filter((a) => !map[a.code]).map((a) => a.code);
    if (missing.length) throw new Error(`Chart of accounts is missing system account(s) ${missing.join(', ')} — run the seed`);
    return map;
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
            is_system: true,
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