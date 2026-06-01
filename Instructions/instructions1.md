# Instructions for Claude Code — Step 1: Monorepo Scaffold + Health Endpoints

> **Goal:** Create the full monorepo folder structure and two working endpoints:
> - `GET /health` — confirms the NestJS server is running
> - `GET /health/run` — confirms database connectivity

---

## Context

This is the Saniro ERP project. The tech stack is:
- **Monorepo:** pnpm workspaces + Turborepo
- **Backend:** NestJS + TypeORM + PostgreSQL 16
- **Frontend:** React 19 + Vite 6
- **Package manager:** pnpm

Do not build any business logic yet. This step is purely scaffolding and infrastructure validation.

---

## What to Build

### 1. Root monorepo structure

Create the following folder/file skeleton:

```
erp/
├── apps/
│   ├── web/                 (Vite + React — scaffold only, no components yet)
│   └── api/                 (NestJS — scaffold + health module)
├── packages/
│   ├── shared/              (empty package.json + index.ts barrel — no content yet)
│   └── offline-queue/       (empty package.json + index.ts barrel — no content yet)
├── scripts/                 (empty folder, add .gitkeep)
├── .env.example             (root, see content below)
├── .gitignore
├── pnpm-workspace.yaml
├── turbo.json
├── docker-compose.yml
└── package.json             (root — scripts only, no dependencies)
```

---

### 2. Root config files

#### `pnpm-workspace.yaml`
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

#### `turbo.json`
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {}
  }
}
```

#### `docker-compose.yml`
```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: erp
      POSTGRES_PASSWORD: erp_dev_password
      POSTGRES_DB: erp_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

#### Root `package.json`
```json
{
  "name": "erp",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "db:migrate": "pnpm --filter api migration:run",
    "db:seed": "pnpm --filter api seed"
  },
  "devDependencies": {
    "turbo": "latest"
  }
}
```

#### `.gitignore`
```
node_modules/
dist/
.env
*.local
.turbo/
coverage/
```

#### Root `.env.example`
```bash
# Database
DATABASE_URL=postgresql://erp:erp_dev_password@localhost:5432/erp_db
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
DATABASE_SSL=false

# JWT
JWT_SECRET=change_this_before_production
JWT_REFRESH_SECRET=change_this_before_production_refresh
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# Storage
STORAGE_PROVIDER=local
STORAGE_BUCKET=erp-uploads
STORAGE_REGION=ap-southeast-1
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
STORAGE_ENDPOINT=
STORAGE_BASE_URL=

# App
NODE_ENV=development
API_PORT=3000
FRONTEND_URL=http://localhost:5173

# Real-time
SSE_HEARTBEAT_MS=30000

# Background Jobs
PG_BOSS_SCHEMA=pgboss
PG_BOSS_MAX_ATTEMPTS=3
PG_BOSS_RETRY_DELAY_SECONDS=60

# Notifications
NOTIFICATION_CHANNEL=log
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@erp.local
WHATSAPP_API_URL=
WHATSAPP_API_TOKEN=

# Rate Limiting
THROTTLE_TTL_SECONDS=60
THROTTLE_LIMIT=100
THROTTLE_AUTH_LIMIT=10

# Offline Sync
OFFLINE_SYNC_MAX_AGE_HOURS=24

# PDF
PDF_CHROMIUM_PATH=

# Cache
PERMISSION_CACHE_TTL_MS=300000
PRICE_LIST_CACHE_TTL_MS=600000
```

---

### 3. `packages/shared`

```
packages/shared/
├── package.json
├── tsconfig.json
└── src/
    └── index.ts    (empty barrel: export {})
```

`package.json`:
```json
{
  "name": "@erp/shared",
  "version": "0.0.1",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "tsc"
  }
}
```

---

### 4. `packages/offline-queue`

```
packages/offline-queue/
├── package.json
├── tsconfig.json
└── src/
    └── index.ts    (empty barrel: export {})
```

`package.json`:
```json
{
  "name": "@erp/offline-queue",
  "version": "0.0.1",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "tsc"
  }
}
```

---

### 5. `apps/web` — scaffold only

Use `pnpm create vite apps/web --template react-ts` to scaffold. Then:

- Add `apps/web/.env.example`:
```bash
VITE_API_BASE_URL=http://localhost:3000
VITE_APP_NAME=Saniro ERP
VITE_APP_VERSION=1.0.0
VITE_FEATURE_NOTIFICATIONS=true
VITE_FEATURE_AUDIT_LOG=true
VITE_FEATURE_REPORTS=false
VITE_FEATURE_OFFLINE=true
VITE_MAX_UPLOAD_SIZE_MB=10
VITE_ALLOWED_FILE_TYPES=image/jpeg,image/png,application/pdf
VITE_GATE_PASS_BASE_URL=http://localhost:5173/gate-pass
```

Do not create any components or routes yet. Just verify `pnpm dev` starts the Vite server.

---

### 6. `apps/api` — NestJS with health module

#### 6.1 Scaffold

Use `npx @nestjs/cli new api --package-manager pnpm` inside `apps/`, or scaffold manually. The result should be a clean NestJS app.

Add `apps/api/.env.example`:
```bash
ALLOWED_ORIGINS=http://localhost:5173
COOKIE_DOMAIN=localhost
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
```

#### 6.2 Install dependencies for Step 1 only

```bash
# In apps/api:
pnpm add @nestjs/typeorm typeorm pg @nestjs/config zod
pnpm add -D @types/pg
```

#### 6.3 Environment validation — `src/config/env.config.ts`

Create this file. It must use Zod to validate all required env vars on startup. If any required var is missing, the process must throw and refuse to start.

```typescript
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().default(3000),
})

export type EnvConfig = z.infer<typeof envSchema>

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config)
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.format())
    process.exit(1)
  }
  return result.data
}
```

#### 6.4 `AppModule` — `src/app.module.ts`

Wire up `ConfigModule` (with `validateEnv`) and `TypeOrmModule`. For Step 1, TypeORM should be configured with `synchronize: false` and an empty `entities: []` array — no entities yet.

```typescript
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { validateEnv } from './config/env.config'
import { HealthModule } from './modules/health/health.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [],
        synchronize: false,
        ssl: config.get<string>('NODE_ENV') === 'production'
          ? { rejectUnauthorized: false }
          : false,
      }),
      inject: [ConfigService],
    }),
    HealthModule,
  ],
})
export class AppModule {}
```

#### 6.5 `main.ts` — `src/main.ts`

```typescript
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const port = process.env.API_PORT ?? 3000
  await app.listen(port)
  console.log(`API running on http://localhost:${port}`)
}
bootstrap()
```

#### 6.6 Health module — `src/modules/health/`

Create three files:

**`health.module.ts`**
```typescript
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { HealthController } from './health.controller'
import { HealthService } from './health.service'

@Module({
  imports: [TypeOrmModule.forFeature([])],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
```

**`health.service.ts`**
```typescript
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

@Injectable()
export class HealthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  check() {
    return { status: 'ok', timestamp: new Date().toISOString() }
  }

  async checkDb() {
    try {
      await this.dataSource.query('SELECT 1')
      return {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      return {
        status: 'error',
        database: 'unreachable',
        detail: error instanceof Error ? error.message : 'unknown error',
        timestamp: new Date().toISOString(),
      }
    }
  }
}
```

**`health.controller.ts`**
```typescript
import { Controller, Get } from '@nestjs/common'
import { HealthService } from './health.service'

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check() {
    return this.healthService.check()
  }

  @Get('run')
  async checkDb() {
    return this.healthService.checkDb()
  }
}
```

---

### 7. Copy `.env.example` to `.env` and fill values

After scaffolding, copy `.env.example` to `.env` at the root. The Docker Compose values should match:

```
DATABASE_URL=postgresql://erp:erp_dev_password@localhost:5432/erp_db
NODE_ENV=development
API_PORT=3000
```

---

## How to Run and Verify

### Start the database
```bash
docker compose up -d
```

### Install all dependencies
```bash
pnpm install
```

### Start the API
```bash
pnpm --filter api dev
# or from root:
pnpm dev
```

### Verify the two endpoints

```bash
# Should return: { "status": "ok", "timestamp": "..." }
curl http://localhost:3000/health

# Should return: { "status": "ok", "database": "connected", "timestamp": "..." }
curl http://localhost:3000/health/run
```

If `GET /health/run` returns `"database": "unreachable"`, check:
1. Docker Compose is running: `docker compose ps`
2. `.env` has the correct `DATABASE_URL`
3. Port 5432 is not blocked

---

## Completion Criteria for Step 1

- [ ] `pnpm install` completes with no errors from root
- [ ] `docker compose up -d` starts Postgres successfully
- [ ] `pnpm --filter api dev` starts without crashing
- [ ] `GET http://localhost:3000/health` returns `{ status: "ok" }`
- [ ] `GET http://localhost:3000/health/run` returns `{ status: "ok", database: "connected" }`
- [ ] `apps/web` Vite scaffold starts on `:5173` (even if it's just the default Vite page)
- [ ] No business logic, no entities, no migrations, no auth — that is all Phase 0 week 2+

---

## What NOT to Build in This Step

- No JWT, no auth, no guards
- No TypeORM entities or migrations
- No `packages/shared` content (just the empty barrel)
- No React components or routes beyond the Vite default
- No business modules (job-cards, workers, etc.)
- No `common/` infrastructure in NestJS yet

Everything else follows in subsequent instruction files.
