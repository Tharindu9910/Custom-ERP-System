import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CacheModule } from '@nestjs/cache-manager';
import { validateEnv } from './config/env.config';

// Guards / Interceptors / Filters
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { ResponseInterceptor } from './common/response.interceptor';
import { HttpExceptionFilter } from './common/exception.filter';

// Phase 1-2 entities
import { UserEntity } from './database/entities/user.entity';
import { UserRoleEntity } from './database/entities/user-role.entity';
import { UserSessionEntity } from './database/entities/user-session.entity';

// Phase 2B entities
import { BranchEntity } from './database/entities/branch.entity';
import { BranchSectionEntity } from './database/entities/branch-section.entity';
import { BranchConfigEntity } from './database/entities/branch-config.entity';
import { PermissionEntity } from './database/entities/permission.entity';
import { RolePermissionEntity } from './database/entities/role-permission.entity';
import { WorkerEntity } from './database/entities/worker.entity';
import { CustomerEntity } from './database/entities/customer.entity';
import { JobCardEntity } from './database/entities/job-card.entity';
import { JobStatusLogEntity } from './database/entities/job-status-log.entity';
import { WorkOrderEntity } from './database/entities/work-order.entity';
import { WorkOrderWorkerEntity } from './database/entities/work-order-worker.entity';
import { WorkOrderStatusNoteEntity } from './database/entities/work-order-status-note.entity';
import { WorkOrderInspectionEntity } from './database/entities/work-order-inspection.entity';
import { WorkOrderAttachmentEntity } from './database/entities/work-order-attachment.entity';
import { PriceListEntryEntity } from './database/entities/price-list-entry.entity';
import { HardwareStoreItemEntity } from './database/entities/hardware-store-item.entity';
import { StockMovementEntity } from './database/entities/stock-movement.entity';
import { StockAlertEntity } from './database/entities/stock-alert.entity';
import { MaterialOrderEntity } from './database/entities/material-order.entity';
import { MaterialOrderLineEntity } from './database/entities/material-order-line.entity';
import { GoodsIssueEntity } from './database/entities/goods-issue.entity';
import { GoodsIssueLineEntity } from './database/entities/goods-issue-line.entity';
import { FinancialAccountEntity } from './database/entities/financial-account.entity';
import { LedgerEntryEntity } from './database/entities/ledger-entry.entity';
import { PaymentEntity } from './database/entities/payment.entity';
import { InvoiceEntity } from './database/entities/invoice.entity';
import { DeliveryEntity } from './database/entities/delivery.entity';
import { CancellationRequestEntity } from './database/entities/cancellation-request.entity';
import { ConflictQueueEntity } from './database/entities/conflict-queue.entity';
import { GatePassEntity } from './database/entities/gate-pass.entity';
import { GatePassItemEntity } from './database/entities/gate-pass-item.entity';
import { PettyCashEntity } from './database/entities/petty-cash.entity';
import { NotificationEntity } from './database/entities/notification.entity';
import { AuditLogEntity } from './database/entities/audit-log.entity';
import { LegacyImportEntity } from './database/entities/legacy-import.entity';

// Migrations
import { CreateUserAndUserRole1748700000000 } from './database/migrations/1748700000000-CreateUserAndUserRole';
import { CreateUserSession1748700100000 } from './database/migrations/1748700100000-CreateUserSession';
import { Phase2BFoundation1748800000000 } from './database/migrations/1748800000000-Phase2BFoundation';

// Feature modules
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { BranchesModule } from './modules/branches/branches.module';
import { WorkersModule } from './modules/workers/workers.module';
import { CustomersModule } from './modules/customers/customers.module';

const ALL_ENTITIES = [
  UserEntity,
  UserRoleEntity,
  UserSessionEntity,
  BranchEntity,
  BranchSectionEntity,
  BranchConfigEntity,
  PermissionEntity,
  RolePermissionEntity,
  WorkerEntity,
  CustomerEntity,
  JobCardEntity,
  JobStatusLogEntity,
  WorkOrderEntity,
  WorkOrderWorkerEntity,
  WorkOrderStatusNoteEntity,
  WorkOrderInspectionEntity,
  WorkOrderAttachmentEntity,
  PriceListEntryEntity,
  HardwareStoreItemEntity,
  StockMovementEntity,
  StockAlertEntity,
  MaterialOrderEntity,
  MaterialOrderLineEntity,
  GoodsIssueEntity,
  GoodsIssueLineEntity,
  FinancialAccountEntity,
  LedgerEntryEntity,
  PaymentEntity,
  InvoiceEntity,
  DeliveryEntity,
  CancellationRequestEntity,
  ConflictQueueEntity,
  GatePassEntity,
  GatePassItemEntity,
  PettyCashEntity,
  NotificationEntity,
  AuditLogEntity,
  LegacyImportEntity,
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['../../.env', '.env'],
    }),

    EventEmitterModule.forRoot(),

    CacheModule.register({ isGlobal: true, ttl: 300000 }),

    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.getOrThrow<number>('THROTTLE_TTL_SECONDS') * 1000,
            limit: config.getOrThrow<number>('THROTTLE_LIMIT'),
          },
        ],
      }),
      inject: [ConfigService],
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities: ALL_ENTITIES,
        migrations: [
          CreateUserAndUserRole1748700000000,
          CreateUserSession1748700100000,
          Phase2BFoundation1748800000000,
        ],
        synchronize: false,
        ssl:
          config.get<string>('NODE_ENV') === 'production'
            ? { rejectUnauthorized: false }
            : false,
      }),
      inject: [ConfigService],
    }),

    AuthModule,
    UsersModule,
    HealthModule,
    AuditLogsModule,
    LedgerModule,
    PermissionsModule,
    BranchesModule,
    WorkersModule,
    CustomersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
