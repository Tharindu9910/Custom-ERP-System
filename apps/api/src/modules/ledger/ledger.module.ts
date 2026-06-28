import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerEntryEntity } from '../../database/entities/ledger-entry.entity';
import { FinancialAccountEntity } from '../../database/entities/financial-account.entity';
import { LedgerService } from './ledger.service';

@Module({
  imports: [TypeOrmModule.forFeature([LedgerEntryEntity, FinancialAccountEntity])],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}