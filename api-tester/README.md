# Saniro ERP — API Tester

Single-file, zero-build browser tool for testing the Saniro ERP API.

## Quick Start

```bash
cd api-tester
python -m http.server 9000
```

Open **http://localhost:9000** in your browser.

> Must be served over HTTP (not `file://`) due to CORS restrictions.

## Prerequisites

- API running on `http://localhost:3000` (`pnpm dev` or `nest start --watch` in `apps/api`)
- Database seeded (`pnpm db:seed`) if you want to use the quick-fill login chips

## Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  SANIRO·ERP  API Tester          [LOCAL|CLOUD]  [API URL]  [●] PING │
├────────────┬───────────────────────────────┬────────────────────┤
│            │                               │                    │
│  Sidebar   │     Endpoint Panel            │   Request Log      │
│            │                               │                    │
│  HEALTH    │  Token Store (always visible) │  Live request /    │
│  AUTH      │                               │  response stream   │
│  UTILS     │  Selected endpoint form       │                    │
│            │                               │                    │
└────────────┴───────────────────────────────┴────────────────────┘
```

## Endpoints

### Health
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Basic health check |
| GET | `/health/run` | — | Database connectivity check |

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | — | Username + password → JWT pair |
| POST | `/auth/refresh` | Refresh token | Issue new access + refresh tokens |
| POST | `/auth/logout` | Access token | Stateless logout (clears local tokens) |
| GET | `/auth/me` | Access token | Current user profile |

## Seeded Test Users

| Chip | Username | Password | Role |
|------|----------|----------|------|
| superadmin | superadmin | Super@123 | SUPER_ADMIN |
| manager1 | manager1 | Manager@123 | MANAGER |
| admin1 | admin1 | Admin@123 | ADMIN |
| supervisor1 | supervisor1 | Super1@123 | SUPERVISOR |
| cashier1 | cashier1 | Cashier@123 | CASHIER |

## Typical Test Flows

### Login → Profile
1. Click **POST /auth/login** in the sidebar
2. Click a quick-fill chip (e.g. `superadmin`)
3. Click **Login** — tokens auto-populate in the Token Store
4. Click **GET /auth/me** → **Get Profile**

### Token Refresh
1. Login first to populate the refresh token
2. Click **POST /auth/refresh** → **Fill from Store** → **Refresh**
3. New tokens replace the old ones in the store

### Full Session Lifecycle
1. Login → `/auth/me` → `/auth/refresh` → `/auth/logout`
2. Try `/auth/me` again — should return `401 Unauthorized`

### JWT Inspector
1. Login to populate the access token
2. Click **JWT Inspector** in the sidebar
3. Click **Fill from Store** → **Decode**
4. Inspect header, payload, and expiry time

## LOCAL / CLOUD Toggle

- **LOCAL** — `http://localhost:3000` (default)
- **CLOUD** — configure your deployed API URL

URLs are saved independently per environment in `localStorage` and restored on next load.

## Environment Variables (API)

| Variable | Default | Notes |
|----------|---------|-------|
| `API_PORT` | `3000` | Change the URL in the tester if you override this |
| `JWT_ACCESS_EXPIRES` | `15m` | Access token TTL shown in JWT Inspector |
| `JWT_REFRESH_EXPIRES` | `7d` | Refresh token TTL |

## Notes

- Token Store is in-memory only — refreshing the page clears it. Use **Fill from Store** buttons to re-populate fields after a reload.
- Logout is stateless server-side (v1). The server does not maintain a blocklist; tokens are simply discarded locally.
- The PING button hits `/health` and shows a green dot when the API is reachable.