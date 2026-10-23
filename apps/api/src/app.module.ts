import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import { validateEnv } from './config/env.config';

// Guards / Interceptors / Filters
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { PasswordChangeGuard } from './common/guards/password-change.guard';
import { ResponseInterceptor } from './common/response.interceptor';
import { HttpExceptionFilter } from './common/exception.filter';
import { CoreModule } from './core/core.module';
import { FeatureGuard } from './core/feature.guard';

import { ALL_ENTITIES } from './database/entities';

// Migrations
import { BaselineV61749000000000 } from './database/migrations/1749000000000-BaselineV6';
import { GlobalScopeMainBranch1761100000000 } from './database/migrations/1761100000000-GlobalScopeMainBranch';

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
import { GatePassesModule } from './modules/gate-passes/gate-passes.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ItemsModule } from './modules/items/items.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { StockTransfersModule } from './modules/stock-transfers/stock-transfers.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['../../.env', '.env'],
    }),

    EventEmitterModule.forRoot(),

    ScheduleModule.forRoot(),

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
          BaselineV61749000000000,
          GlobalScopeMainBranch1761100000000,
        ],
        synchronize: false,
        ssl:
          config.get<string>('NODE_ENV') === 'production'
            ? { rejectUnauthorized: false }
            : false,
      }),
      inject: [ConfigService],
    }),

    CoreModule,
    AuthModule,
    UsersModule,
    HealthModule,
    AuditLogsModule,
    LedgerModule,
    PermissionsModule,
    BranchesModule,
    WorkersModule,
    CustomersModule,
    GatePassesModule,
    OrdersModule,
    ItemsModule,
    AttachmentsModule,
    InventoryModule,
    StockTransfersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PasswordChangeGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: FeatureGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
