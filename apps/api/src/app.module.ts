import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { TypeOrmModule } from '@nestjs/typeorm'
import { validateEnv } from './config/env.config'
import { JwtAuthGuard } from './common/guards/jwt-auth.guard'
import { ResponseInterceptor } from './common/response.interceptor'
import { HttpExceptionFilter } from './common/exception.filter'
import { UserEntity } from './database/entities/user.entity'
import { UserRoleEntity } from './database/entities/user-role.entity'
import { UserSessionEntity } from './database/entities/user-session.entity'
import { CreateUserAndUserRole1748700000000 } from './database/migrations/1748700000000-CreateUserAndUserRole'
import { CreateUserSession1748700100000 } from './database/migrations/1748700100000-CreateUserSession'
import { AuthModule } from './modules/auth/auth.module'
import { HealthModule } from './modules/health/health.module'
import { UsersModule } from './modules/users/users.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['../../.env', '.env'],
    }),

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
        entities: [UserEntity, UserRoleEntity, UserSessionEntity],
        migrations: [CreateUserAndUserRole1748700000000, CreateUserSession1748700100000],
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
  ],
  providers: [
    // Throttler runs before JWT so rate-limited requests never hit auth logic
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
