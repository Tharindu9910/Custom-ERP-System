# Instructions for Claude Code — Step 2: Secure Auth Module

> **Goal:** Build a complete, production-grade authentication system using JWT Bearer tokens only.
> Access tokens and refresh tokens are both sent and received as Bearer tokens in the Authorization header.
> <!-- NOTE: Cookie-based token transport is intentionally NOT used. If cookies are needed in a future version, this decision should be revisited and the strategy files updated accordingly. -->

---

## Context

This builds on Step 1 (monorepo scaffold + health endpoints). The database is running, TypeORM is wired, and the NestJS app starts cleanly. Now we add auth end-to-end: login, token issuance, token refresh, logout, and the guards that protect every route going forward.

Read and understand the following before writing any code:
- The role system: `SUPER_ADMIN`, `ADMIN`, `AUDITOR`, `SUPERVISOR`, `CHIEF`, `CASHIER`, `MANAGER`
- `SUPER_ADMIN` bypasses `PermissionsGuard` entirely in code — never stored in `ROLE_PERMISSION` table
- Access tokens expire in 15 minutes, refresh tokens expire in 7 days (from env vars)
- The `actor_role` must be captured from the JWT at event time — never looked up after the fact (BR22)
- All routes are protected by default. Public routes use a `@Public()` decorator to opt out.

---

## What to Build

### 1. New packages to install in `apps/api`

Install the following. Do not install anything else.

- `@nestjs/passport`
- `@nestjs/jwt`
- `@nestjs/throttler`
- `passport`
- `passport-jwt`
- `bcrypt`
- `@types/passport-jwt`
- `@types/bcrypt`

---

### 2. Rate limiting setup

Register `ThrottlerModule` globally in `AppModule` using the env values `THROTTLE_TTL_SECONDS` and `THROTTLE_LIMIT`. Apply a stricter throttle specifically on `POST /auth/login` using the `@Throttle()` decorator with the `THROTTLE_AUTH_LIMIT` value (10 requests per minute per IP). All other routes use the default global limits.

Add `THROTTLE_AUTH_LIMIT` to the Zod env schema in `env.config.ts` as a required coerced number.

When the rate limit is exceeded, the response must follow the same `{ error: { code, message } }` shape as all other errors. Add a `RATE_LIMIT_EXCEEDED` error code to `common/errors.ts`.

---

### 3. Database — User and UserRole entities + migration

Before building auth, you need the `USER` and `USER_ROLE` tables. Create TypeORM entities for both inside `apps/api/src/database/entities/`.

**USER entity fields** (from the ER diagram):
- `user_id` — UUID v4, primary key
- `branch_id` — UUID, nullable (plain column for now — BRANCH table does not exist yet, add the FK relation when BRANCH is built in a later step)
- `full_name` — string
- `username` — string, unique
- `password_hash` — string
- `phone` — string, nullable
- `is_active` — boolean, default true
- `created_at` — timestamp, default now
- `last_login_at` — timestamp, nullable

**USER_ROLE entity fields**:
- `user_role_id` — UUID v4, primary key
- `user_id` — UUID FK → USER
- `branch_id` — UUID, nullable — must be `null` for `SUPER_ADMIN` and `MANAGER` (cross-branch roles); must be populated for all other roles
- `role` — use the Role enum from `@erp/shared` (see step 4 below)
- `assigned_by` — UUID, nullable
- `is_active` — boolean, default true
- `assigned_at` — timestamp, default now

**One-role-per-user rule:** A user can only have one active role at a time. Enforce this at the database level with a partial unique index — not just in application logic:

```sql
CREATE UNIQUE INDEX idx_user_role_one_active ON user_role(user_id) WHERE is_active = true;
```

Include this index in the migration. This means the application can never accidentally assign two active roles to the same user regardless of bugs or race conditions.

After creating entities, write a TypeORM migration that creates both tables and the unique index above. Register both entities in `AppModule`'s TypeORM entity list. Run the migration and verify both tables and the index exist in the database.

**Constraint:** `synchronize: false` must remain. No auto-sync ever.

---

### 4. Add `Role` enum to `packages/shared`

In `packages/shared/src/enums/`, create `role.enum.ts` with all seven roles: `SUPER_ADMIN`, `ADMIN`, `AUDITOR`, `SUPERVISOR`, `CHIEF`, `CASHIER`, `MANAGER`. Export it from the shared barrel (`src/index.ts`). Import this enum in the `USER_ROLE` entity.

---

### 5. `common/` infrastructure needed for auth

Create the following files in `apps/api/src/common/`. These will be used throughout the entire project, not just auth.

#### `common/decorators.ts`
Three decorators, all in one file (~30 lines total):
- `@Public()` — sets metadata that tells the JWT guard to skip this route
- `@CurrentUser()` — parameter decorator that pulls the authenticated user off the request object
- `@RequirePermissions(...actions)` — attaches required permission strings as route metadata, to be read by the permissions guard (built in a later step)

#### `common/types.ts`
Define the `RequestUser` type — the shape of the object `@CurrentUser()` returns and services receive. At minimum include: `user_id`, `username`, `role`, `branch_id` (nullable).

#### `common/guards/jwt-auth.guard.ts`
A guard extending `AuthGuard('jwt')`. Rules:
- Registered globally via `APP_GUARD` in `AppModule` — every route is protected by default
- Checks for the `@Public()` metadata on the handler and class; if found, skips token validation entirely
- On invalid or missing token, returns 401 using the `AUTH_TOKEN_EXPIRED` or a generic auth error code from `ERR.*`

#### `common/errors.ts`
Single file. Every error code and message for the whole system. For this step, define auth errors only and add clearly labelled comment blocks as placeholders for all other modules. Rules:
- Services always throw using `ERR.*` constants, never raw strings
- Each entry has a stable `code` string and a human-readable `message`
- The frontend switches on `code` (stable), never on `message` (can change)

Auth error codes to define now:
- `AUTH_INVALID_CREDENTIALS`
- `AUTH_TOKEN_EXPIRED`
- `AUTH_REFRESH_TOKEN_INVALID`
- `AUTH_INSUFFICIENT_PERMISSION`
- `AUTH_USER_INACTIVE`

Placeholder comment blocks for: Job Cards, Work Orders, Payments, Inventory, Customers, Workers, Price List, Offline Sync.

#### `common/response.interceptor.ts`
A global NestJS interceptor. Wraps every outgoing successful response in `{ data: <original response> }`. Does not touch error responses — those are handled by the exception filter.

#### `common/exception.filter.ts`
A global NestJS exception filter. Rules:
- Catches `HttpException` and formats the response as `{ error: { code, message } }`
- Reads `code` and `message` from the structured payload thrown via `ERR.*`
- Falls back to `{ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } }` for anything unhandled
- Never exposes stack traces outside of `development` environment

Register both the interceptor and the exception filter globally in `main.ts`.

---

### 6. Auth strategies — `src/modules/auth/strategies/`

Two Passport JWT strategies. Both extract the token from the `Authorization: Bearer <token>` header — no cookies.

#### `jwt.strategy.ts`
- Strategy name: `'jwt'`
- Secret: `JWT_SECRET` from env
- Extracts and validates the access token
- On success, returns a `RequestUser` object attached to `req.user`
- Token expiry is enforced by Passport automatically

#### `refresh-token.strategy.ts`
- Strategy name: `'jwt-refresh'`
- Secret: `JWT_REFRESH_SECRET` from env (different from access token secret)
- Also reads from `Authorization: Bearer <token>` header
- Used only on the `POST /auth/refresh` endpoint
- On success, returns the user payload so the service can issue a new token pair

---

### 7. Users module — `src/modules/users/`

Build only what auth needs. No controller yet.

**`users.repository.ts`** — three methods:
- `findByUsername(username)` — returns the full user record including `password_hash`, null if not found
- `findById(id)` — returns user by primary key, null if not found
- `updateLastLogin(userId)` — sets `last_login_at = NOW()`

**`users.service.ts`** — two methods:
- `validateCredentials(username, password)` — uses the repository to find the user, compares password with bcrypt, checks `is_active`. Throws `AUTH_INVALID_CREDENTIALS` if credentials are wrong. Throws `AUTH_USER_INACTIVE` if account is inactive. Returns the user object with `password_hash` stripped out.
- `findById(id)` — thin wrapper, throws `AUTH_INVALID_CREDENTIALS` if not found (do not reveal whether the user exists)

Export `UsersModule` so `AuthModule` can import it.

---

### 8. Auth module — `src/modules/auth/`

#### `auth.service.ts` — three methods:

**`login(username, password)`**:
1. Call `UsersService.validateCredentials()` — throws on failure
2. Query `USER_ROLE` for the single active row where `user_id` matches and `is_active = true`. Because of the unique index, there is exactly zero or one row. If zero, throw `AUTH_INSUFFICIENT_PERMISSION`.
3. Build the access token payload: `{ sub: user_id, username, role, branch_id }` — `branch_id` is `null` when role is `SUPER_ADMIN` or `MANAGER`, populated for all other roles
4. Sign access token with `JWT_SECRET`, expiry from `JWT_ACCESS_EXPIRES`
5. Build the refresh token payload: `{ sub: user_id, jti: <uuid> }` — minimal payload, no role (role is always re-fetched on refresh)
6. Sign refresh token with `JWT_REFRESH_SECRET`, expiry from `JWT_REFRESH_EXPIRES`
7. Call `updateLastLogin()`
8. Return `{ accessToken, refreshToken }` as plain strings

**`refresh(userId)`**:
1. Call `UsersService.findById()` — throws if not found
2. Check `is_active` — throw `AUTH_USER_INACTIVE` if false
3. Query `USER_ROLE` for the single active row — same logic as login. If none, throw `AUTH_INSUFFICIENT_PERMISSION`.
4. Issue a new access token (same payload structure as login, `branch_id` null for `SUPER_ADMIN` and `MANAGER`)
5. Issue a new refresh token (rotate — generate a new `jti`)
6. Return `{ accessToken, refreshToken }`
7. Add a comment: token revocation / blocklist deferred to v2

**`logout()`**:
- Stateless in v1. Return `{ success: true }`.
- Add a comment explaining the client must discard both tokens and that a server-side blocklist is deferred to v2.

**`getMe(userId)`**:
1. Call `UsersService.findById()` — throws if not found
2. Fetch the user's active role from `USER_ROLE`
3. Return the user profile: `{ user_id, full_name, username, phone, role, branch_id, last_login_at }` — no `password_hash`

#### `auth.controller.ts` — three endpoints:

- `POST /auth/login` — mark `@Public()`. Body: `{ username, password }`. Calls `AuthService.login()`.
- `POST /auth/refresh` — mark `@Public()` and apply `AuthGuard('jwt-refresh')` directly on the method. No body required. The refresh token comes in as `Authorization: Bearer <token>`. Calls `AuthService.refresh()` with the user id extracted by the strategy.
- `POST /auth/logout` — protected by the global guard (no special decorator needed). Calls `AuthService.logout()`.
- `GET /auth/me` — protected by the global guard. Uses `@CurrentUser()` to extract the user from the JWT. Calls `AuthService.getMe()` which loads the full user profile from the database and returns it without `password_hash`. This is used by the frontend to hydrate the auth store on page refresh without requiring re-login.

#### `auth.module.ts`:
- Register `JwtModule` (or use `JwtService` directly with explicit options for both secrets)
- Import `UsersModule` and `PassportModule`
- Provide both strategies
- Export `JwtModule` if other modules need to verify tokens

---

### 9. Seed test users

Create or update `scripts/seed.ts` to insert test users for each role. Hash all passwords with bcrypt at cost factor 10. The script must be idempotent — check if the user exists before inserting.

Create a `SEED_CREDENTIALS.md` file at the repo root listing the username and plaintext password for each seeded user. This file is committed — it is dev-only data, not production secrets.

Minimum users to seed:
- One `SUPER_ADMIN` — `branch_id` is `null` in `USER_ROLE` (global role, not branch-scoped)
- One `MANAGER` — `branch_id` is `null` in `USER_ROLE` (global role, not branch-scoped)
- One `SUPERVISOR` — `branch_id` can be a hardcoded placeholder UUID for now (e.g. `00000000-0000-0000-0000-000000000001`), will be replaced when BRANCH is built
- One `CASHIER` — same placeholder `branch_id`
- One `ADMIN` — same placeholder `branch_id`

Each user must have exactly one row in `USER_ROLE` with `is_active = true`. The unique index will reject any attempt to insert a second active role for the same user — verify this constraint is working by attempting a duplicate insert in the seed script and confirming it fails gracefully.

---

### 10. Update `AppModule`

Register globally:
- `JwtAuthGuard` via `APP_GUARD`
- `ResponseInterceptor` via `APP_INTERCEPTOR`
- `HttpExceptionFilter` via `APP_FILTER`

Import `AuthModule` and `UsersModule`.

---

### 11. Update env validation — `src/config/env.config.ts`

Add these fields to the Zod schema. All are required — crash on startup if any are missing:
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_ACCESS_EXPIRES`
- `JWT_REFRESH_EXPIRES`

---

### 12. Keep health endpoints public

Add `@Public()` to both `GET /health` and `GET /health/run` in `health.controller.ts` so they continue to work without a token. This verifies the guard bypass is working correctly.

---

## How to Verify

Start the database and API, then test each endpoint manually:

```bash
# Login — should return both tokens
POST /auth/login
Body: { "username": "<seeded_username>", "password": "<seeded_password>" }
Expected: { "data": { "accessToken": "eyJ...", "refreshToken": "eyJ..." } }

# Access a protected route without a token
GET /health/run (after removing @Public — just for testing, then restore it)
Expected: 401 { "error": { "code": "...", "message": "..." } }

# Access a protected route with a valid access token
Authorization: Bearer <accessToken>
Expected: 200 with { "data": ... }

# Refresh tokens
POST /auth/refresh
Authorization: Bearer <refreshToken>
Expected: { "data": { "accessToken": "eyJ...", "refreshToken": "eyJ..." } }

# Logout
POST /auth/logout
Authorization: Bearer <accessToken>
Expected: { "data": { "success": true } }

# Get current user profile
GET /auth/me
Authorization: Bearer <accessToken>
Expected: { "data": { "user_id": "...", "full_name": "...", "username": "...", "role": "...", "branch_id": null, "last_login_at": "..." } }

# Rate limit — hit login 11 times rapidly from the same IP
POST /auth/login (11th request)
Expected: 429 { "error": { "code": "RATE_LIMIT_EXCEEDED", "message": "..." } }

# Health endpoints remain public
GET /health       → 200 no token needed
GET /health/run   → 200 no token needed
```

---

## Completion Criteria for Step 2

- [ ] `USER` and `USER_ROLE` tables created via migration, not auto-sync
- [ ] Partial unique index `idx_user_role_one_active` exists on `USER_ROLE` — enforces one active role per user at DB level
- [ ] `Role` enum lives in `packages/shared` and is used by the entity
- [ ] `POST /auth/login` returns `{ data: { accessToken, refreshToken } }`
- [ ] JWT payload contains `role` and `branch_id` — `branch_id` is `null` for `SUPER_ADMIN` and `MANAGER`
- [ ] Both tokens are Bearer tokens — no cookies anywhere
- [ ] Global `JwtAuthGuard` protects all routes by default
- [ ] `@Public()` correctly bypasses the guard — health endpoints still return 200 with no token
- [ ] `POST /auth/refresh` accepts the refresh token as Bearer and returns a new token pair
- [ ] `POST /auth/logout` returns success (stateless v1, comment explains deferral)
- [ ] `GET /auth/me` returns the current user profile without `password_hash`
- [ ] `POST /auth/login` returns 429 after exceeding `THROTTLE_AUTH_LIMIT` requests per minute
- [ ] 429 response follows `{ error: { code: "RATE_LIMIT_EXCEEDED", message: "..." } }` shape
- [ ] All errors use `{ error: { code, message } }` shape via `common/errors.ts`
- [ ] All successes use `{ data: ... }` shape via the response interceptor
- [ ] Env validation crashes the app if JWT secrets or throttle config are missing
- [ ] `common/errors.ts` exists with auth codes and placeholder sections for all other modules
- [ ] Test users seeded with correct `branch_id` nullability, credentials in `SEED_CREDENTIALS.md`

---

## What NOT to Build in This Step

- No `PermissionsGuard` — requires `PERMISSION` and `ROLE_PERMISSION` tables, built in a later step
- No `@RequirePermissions()` enforcement — define the decorator but do not wire it to any guard yet
- No user management CRUD — only the service/repository methods that auth itself calls
- No other entities or migrations beyond USER and USER_ROLE
- No token blocklist / revocation — stateless logout only, comment deferred to v2
- No BRANCH entity or FK relation — `branch_id` stays as a plain UUID column until BRANCH is built
- No permissions matrix — that is a separate step
