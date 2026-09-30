# Deko

Deko is a self-hosted API observability platform. It ingests API events, stores and aggregates them, and exposes dashboards for logs, errors, status codes, endpoints, and timeseries metrics. It is designed to be easy to run and own.

## Screenshots

> Screenshots will be added here.

<!-- Overview dashboard -->
<!-- Logs page -->
<!-- Error groups -->
<!-- Endpoints leaderboard -->
<!-- Settings -->

## Stack

- Runtime and monorepo tooling: Bun + Turborepo
- API: Hono
- Web: React + TanStack Start/Router/Query/Table
- Worker: BullMQ
- Database: PostgreSQL + TimescaleDB (hypertables for time-series data)
- Queue/cache: Redis
- ORM: Drizzle

## Production Setup (Docker Compose)

The root compose file starts these services:

- pg (TimescaleDB)
- redis
- api
- worker
- web

### 1. Prepare environment

Copy and edit environment values:

```bash
cp .env.example .env
```

Set at minimum:

- PG_USER
- PG_PASSWORD
- ENCRYPTION_KEY
- ADMIN_TOKEN
- API_URL
- WEB_URL

Generate ENCRYPTION_KEY and ADMIN_TOKEN with `openssl rand -hex 32`.

### 2. Build and run

```bash
docker compose -f docker-compose.prod.yaml up -d --build
```

### 3. Verify

```bash
docker compose -f docker-compose.prod.yaml ps
docker compose -f docker-compose.prod.yaml logs -f api web worker
```

### 4. Access

- Web: `http://localhost:3000`
- API: `http://localhost:8000`
- API reference: `http://localhost:8000/api/reference`

### 5. Stop

```bash
docker compose -f docker-compose.prod.yaml down
```

Remove volumes as well:

```bash
docker compose -f docker-compose.prod.yaml down -v
```

## Security

Deko uses two separate credentials, for two separate jobs.

| Credential        | Header                    | Grants                                                    | Stored where                                             |
| ----------------- | ------------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| **Admin token**   | `Authorization: Bearer …` | Everything: all services, all logs, minting ingest tokens | `ADMIN_TOKEN` env var, in the `api` and `web` containers |
| **Service token** | `x-deko-service-token: …` | Write-only access to `POST /api/ingest`                   | Minted per service in the UI, shown once                 |

**The admin token is required.** The `api` and `web` services both refuse to
start without it, and they must be given the same value. It is the only thing
protecting `/api/services` and `/api/dashboard`, so anyone who has it can read
every log Deko holds. Treat it like a password.

The web app sends it on your behalf. It is read only inside server-side
functions, so it is never present in the browser and there is nothing for a
script to steal from a page.

Publicly reachable without any credential:

- `POST /api/ingest` — authenticates with a service token
- `GET /api/health` — liveness probe
- `GET /api/doc` and `GET /api/reference` — the OpenAPI spec, which contains no secrets

### Authentication failure responses

| Situation                               | Status | Error code              |
| --------------------------------------- | ------ | ----------------------- |
| No `Authorization` header               | 401    | `MISSING_ADMIN_TOKEN`   |
| Token does not match                    | 401    | `INVALID_ADMIN_TOKEN`   |
| Header is not a valid bearer credential | 400    | `MALFORMED_ADMIN_TOKEN` |

### Calling the API directly

Anything hitting `/api/services` or `/api/dashboard` from outside the web app
needs the admin token:

```http
GET http://localhost:8000/api/services
Authorization: Bearer <ADMIN_TOKEN>
```

The Bruno collection in `requests/` is already wired up for this. Point its
`ADMIN_TOKEN` variable at your value.

### Rotating the admin token

There is no UI for this. Change `ADMIN_TOKEN`, then restart **both** the `api`
and `web` services — a mismatch between them makes the dashboard unrenderable.
If the two ever disagree, the web UI shows a red banner naming the problem, and
the reason is written to the web container's logs:

```bash
docker compose -f docker-compose.prod.yaml logs web | grep ADMIN_TOKEN
```

## Integrating with your API

Once Deko is running you need two things: a **service** and a **token**. A service represents one of your APIs. A token authenticates ingest requests from it.

### 1. Create a service

Open the Deko web UI at `http://localhost:3000`, click **New service**, give it a name, and copy the **service ID** shown in Settings.

### 2. Create a service token

In Settings → Tokens, click **New token**. Copy the token value immediately — it is only shown once.

### 3. Send log events

Send a `POST` request to `/api/ingest` with the token in the `x-deko-service-token` header. You can send a single event or a batch of up to 100.

```http
POST http://localhost:8000/api/ingest
Content-Type: application/json
x-deko-service-token: <your-token>
```

**Single event:**

```json
{
  "level": "info",
  "timestamp": "2026-05-02T12:00:00.000Z",
  "environment": "production",
  "method": "GET",
  "path": "/api/users",
  "status": 200,
  "duration": 42
}
```

**Batch (array):**

```json
[
  {
    "level": "info",
    "timestamp": "2026-05-02T12:00:00.000Z",
    "environment": "production",
    "method": "GET",
    "path": "/api/users",
    "status": 200,
    "duration": 42
  },
  {
    "level": "error",
    "timestamp": "2026-05-02T12:00:01.000Z",
    "environment": "production",
    "method": "POST",
    "path": "/api/orders",
    "status": 500,
    "duration": 310,
    "message": "Database connection timeout"
  }
]
```

**Full event fields:**

| Field         | Type                                                   | Required | Description                                 |
| ------------- | ------------------------------------------------------ | -------- | ------------------------------------------- |
| `level`       | `debug` \| `info` \| `warn` \| `error`                 | true     | Log severity                                |
| `timestamp`   | ISO 8601 string                                        | true     | When the request was handled                |
| `environment` | string                                                 | true     | e.g. `production`, `staging`                |
| `method`      | `GET` \| `POST` \| `PUT` \| `PATCH` \| `DELETE` \| ... | true     | HTTP method                                 |
| `path`        | string                                                 | true     | Request path                                |
| `status`      | number                                                 | true     | HTTP response status code                   |
| `duration`    | number                                                 | true     | Response time in milliseconds               |
| `message`     | string                                                 | false    | Human-readable description or error message |
| `sessionId`   | string                                                 | false    | Session or user identifier for grouping     |
| `meta`        | object                                                 | false    | Any additional key/value data               |

Rate limits: **100 requests/second** and **10,000 events/minute** per service token.

The full interactive API reference is available at `http://localhost:8000/api/reference`.

## Development

Install dependencies once from repo root:

```bash
bun install
```

Start all apps in dev mode:

```bash
bun run dev
```
