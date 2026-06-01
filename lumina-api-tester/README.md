# Lumina API Tester

Single-file HTML tester for the Lumina backend services. Two tabs in the header — **AUTH** and **OBSERVABILITY** — each with its own API URL, nav, and panels. No build step.

## Why you need a tiny local server (not `file://`)

Both services enforce CORS. Opening `index.html` directly via `file://` sends
`Origin: null` and the browser blocks every request. Serve it on a port that
matches each service's allowed origins instead.

`http://localhost:8000` is in the default `CORS_ORIGINS_STR` for both services
in local dev — use that:

```bash
cd services/lumina-api-tester
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

Any other port works too, as long as you add it to `CORS_ORIGINS_STR` in
both `services/auth/.env` and `services/lumina-observability/.env` and restart
the services.

## Setup

### 1. Boot the services you want to test

```bash
# Auth (port 8001)
cd services/auth
.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8001

# Observability (port 8081) — in another terminal
cd services/lumina-observability
PYTHONPATH=. .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8081
```

You only need to boot the service for the tab you're testing.

### 2. Pick a service tab

Top of the page: **AUTH** (default) or **OBSERVABILITY**. Each tab has its own:
- API URL (auth defaults to `:8001`, observability to `:8081`)
- Sidebar of endpoints
- PING button (auth pings `/health`, obs pings `/api/v1/health/live`)
- URL is persisted independently in localStorage — swap tabs without retyping

The **Token Store** at the top and the **Request Log** on the right are shared across both tabs.

### 3. Firebase config (only for Google OAuth tests on AUTH tab)
The tester ships with the `lumina-nyaas` Firebase config baked in and
auto-initialised on load. To switch projects, edit the fields under
**Firebase Setup** and click **INIT FIREBASE**.

Required Firebase Console setup for OAuth:
- Authentication → Settings → Authorized domains → add `localhost`

## Test flows

### Phone OTP login (full flow)
1. **OTP → `/otp/request`** — enter phone, click SEND. SMS gateway is stubbed
   locally; the OTP is only logged on the auth server, not actually sent.
2. **Look in the auth service logs** for the OTP value (`SMS OTP [STUB] → +xxxxx OTP=xxxxxx`).
   Or seed a known OTP directly into Postgres (see "Seeding a test OTP" below).
3. **OTP → `/otp/verify`** — enter the 6-digit code, click SEND.
4. Tokens auto-populate in the Token Store at the top.
5. **Token Mgmt → `/me`** — uses the stored access token automatically.

### Google OAuth login (full flow)
1. **Firebase OAuth → Google Login** — click "Sign in with Google".
2. **Firebase OAuth → `/firebase/exchange`** — click EXCHANGE → SETS TOKENS.
3. Tokens auto-populate in the Token Store.

### Token refresh
1. **Token Mgmt → `/token/refresh`** — click AUTO-FILL FROM STORE then REFRESH.
2. New access + refresh tokens replace the old ones in the store.

### Full session test
1. Login (OTP or Google)
2. `/me` — verify identity
3. `/sessions` — see all active sessions
4. `/token/refresh` — rotate tokens (old refresh token now invalid)
5. `/logout` — revoke session
6. `/me` — should return 401

### JWT inspector
**Token Mgmt → JWT Inspector** — pastes the current access_token automatically
and shows the decoded header + payload (no signature check — for debugging only).
Useful for confirming claims like `sub`, `sid`, `tier`, `exp`.

### Seeding a test OTP (when SMS gateway is stubbed)

```bash
# In services/auth
HASH=$(.venv/bin/python -c "from app.utils.helpers import hash_otp; print(hash_otp('123456','+94719332272'))")
docker exec -i lumina-pg psql -U lumina -d lumina -c \
  "INSERT INTO otp_tokens (id, phone_number, token_hash, expires_at, attempts) \
   VALUES ('otp_T1', '+94719332272', '${HASH}', now()+interval '10 min', 0);"
```

Now `/otp/verify` with phone `+94719332272` and OTP `123456` will succeed.

## File structure

```
lumina-api-tester/
├── index.html    ← the entire tester
└── README.md
```

## All endpoints covered

### AUTH tab

| Endpoint | Panel |
|---|---|
| GET /health | Health → Liveness |
| GET /health/ready | Health → Readiness |
| GET /.well-known/jwks.json | Health → JWKS |
| POST /v1/auth/otp/request | Phone OTP → request |
| POST /v1/auth/otp/verify | Phone OTP → verify |
| Firebase Google popup | Firebase OAuth → Google Login |
| POST /v1/auth/firebase/exchange | Firebase OAuth → exchange |
| POST /v1/auth/token/refresh | Token Mgmt → refresh |
| POST /v1/auth/logout | Token Mgmt → logout |
| GET /v1/auth/me | Token Mgmt → me |
| GET /v1/auth/sessions | Token Mgmt → sessions |
| DELETE /v1/auth/sessions/{id} | Token Mgmt → revoke session |
| POST /v1/auth/account/link/{provider} | Account → link |
| GET /v1/auth/account/providers | Account → list providers |
| DELETE /v1/auth/account/link/{provider} | Account → unlink |
| POST /v1/upload/request | Upload → request URL |
| POST /v1/upload/confirm | Upload → confirm |
| GET /v1/upload/{id}/status | Upload → status |

Plus a client-side **JWT Inspector** under Token Mgmt (decodes the current
access_token; no API call).

### OBSERVABILITY tab

| Endpoint | Panel |
|---|---|
| GET /api/v1/health | Health → Full |
| GET /api/v1/health/ready | Health → Readiness |
| GET /api/v1/health/live | Health → Liveness |
| GET /api/v1/metrics | Health → Metrics (Prometheus text) |
| POST /api/v1/events | Ingest → /events (1–50 events per batch) |
| POST /api/v1/logs | Ingest → /logs |
| GET /api/internal/v1/events/replay | Internal → Replay (needs internal JWT) |
| POST /api/internal/v1/events/backfill | Internal → Backfill (NDJSON, needs internal JWT) |
| GET /api/internal/v1/scoring/audit/{user_id} | Internal → Scoring Audit |
| GET /api/internal/v1/content/attention/{brand_id} | Internal → Brand Attention |

### Observability test flows

**Smoke ingest** (auth-token flow, mirrors what the mobile/web client will do):
1. AUTH tab → log in via OTP or Google. The access_token lands in the Token Store.
2. OBSERVABILITY tab → **Ingest → /events**. Click **PREFILL: question_viewed**, then **SEND BATCH**.
3. Response shows `202 accepted=2`. The events landed in Cloud SQL `lumina_observability.events`. The privacy filter strips PII/answer values before they reach Cloud Logging — try **PREFILL: with PII** to see `fields_redacted` appear in the response. Verify in GCP via:
   ```bash
   gcloud logging read 'logName="projects/lumina-nyaas/logs/lumina-events"' --freshness=2m --project=lumina-nyaas
   ```

**Forbidden event types**: click **PREFILL: forbidden (scoring.*)**, SEND. Returns 202 with `accepted=0 rejected=1 reason=event_type_not_allowed_public` (per docs/08 — scoring layer events are internal-only).

**Internal endpoints**: paste a JWT with `aud="lumina-internal"` into **Internal JWT**. The signing key is not yet provisioned (per decision A15 in docs/07), so until it is, `/events/replay` and `/events/backfill` will return 503 `pubsub_disabled` even with a valid token because the Pub/Sub topics also haven't been created.

### Reuse of the access token

Observability shares the **Token Store** with auth — log in once on the AUTH tab and the access_token is automatically attached to `/api/v1/events` and `/api/v1/logs` requests. The headers `X-Platform` and `X-App-Version` are also sent (observability reads them as a fallback when the JWT — which auth's tokens don't — doesn't carry platform/app_version).
