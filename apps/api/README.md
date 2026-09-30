# API

Backend service for ingestion, querying, service management, and dashboard endpoints.

## Built With

- Hono
- Zod
- Drizzle
- PostgreSQL/TimescaleDB
- Redis

## Quick Dev Setup

From repo root:

```bash
bun install
cp .env.example .env
docker compose up -d db redis
bun run dev --filter=@repo/api
```

Default local URL: `http://localhost:8000`

## Authentication

The API has two separate credential domains:

| Credential        | Header                                | Scope                                                   | Where it comes from                |
| ----------------- | ------------------------------------- | ------------------------------------------------------- | ---------------------------------- |
| **Admin token**   | `Authorization: Bearer <ADMIN_TOKEN>` | Full read/write on `/api/services` and `/api/dashboard` | The `ADMIN_TOKEN` env var          |
| **Service token** | `x-deko-service-token: <token>`       | Write-only, `POST /api/ingest` only                     | Minted per service from the web UI |

`ADMIN_TOKEN` is required and the API throws at startup without it. It is
applied in to the services and dashboard routes only; the ingest, health, doc and reference
stay public so that other servers can send logs and the API reference remains
browsable.

The credential is checked by Hono's built-in `bearerAuth` middleware, which
compares tokens in constant time and emits RFC 6750 `WWW-Authenticate` challenges.
Three distinct error codes are returned so the web app cannot drift from them:

| Situation                               | Status | Code                    |
| --------------------------------------- | ------ | ----------------------- |
| No `Authorization` header               | 401    | `MISSING_ADMIN_TOKEN`   |
| Token does not match                    | 401    | `INVALID_ADMIN_TOKEN`   |
| Header is not a valid bearer credential | 400    | `MALFORMED_ADMIN_TOKEN` |

The token must match `/^[A-Za-z0-9._~+/-]+=*$/` which is the same pattern
`bearerAuth` enforces on incoming requests. It is validated at
startup so an unusable value fails fast instead of answering 400 forever.

The token is deliberately not the same value as `ENCRYPTION_KEY`: rotating
your encryption key must not invalidate API clients. There is no in-app way to
rotate `ADMIN_TOKEN`, so the env var must be changed and the service restarted.
