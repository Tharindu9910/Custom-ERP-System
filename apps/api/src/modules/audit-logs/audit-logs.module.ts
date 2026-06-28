import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';
import { AuditLogListener } from './audit-log.listener';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity])],
  providers: [AuditLogListener],
  exports: [],
})
export class AuditLogsModule {}
