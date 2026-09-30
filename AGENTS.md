# Deko — AGENTS.md

Bun + Turborepo monorepo. Self-hosted API observability platform.

## Commands (run from repo root)

| Command                             | Action                                        |
| ----------------------------------- | --------------------------------------------- |
| `bun install`                       | Install all workspace deps                    |
| `bun run dev`                       | Start all apps in dev mode (infra must be up) |
| `bun run build`                     | Build all apps                                |
| `bun run check-types`               | Typecheck all packages                        |
| `bun run fmt` / `bun run fmt:check` | oxfmt formatter                               |
| `bun run lint` / `bun run lint:fix` | oxlint linter                                 |
| `bun run lint:type`                 | Type-aware oxlint                             |
| `bun run start`                     | Start built apps                              |

Scope to one workspace: `bun run --filter=@repo/api dev`.

CI runs `bun install --frozen-lockfile` → `bun lint --deny-warnings` → `bun fmt:check`.

## Infrastructure

PostgreSQL (TimescaleDB) and Redis must be running before dev/start:

```sh
bun run --filter=@repo/db db:up     # TimescaleDB on :5432
bun run --filter=@repo/redis redis:up  # Redis on :6379
```

`bun run dev` auto-starts infra when no container is running (Turborepo `dependsOn` chains `^db:up`, `^redis:up`, `^db:generate`).

## Packages

| Package           | Dir               | Framework          | Entrypoint     | Build artifact             |
| ----------------- | ----------------- | ------------------ | -------------- | -------------------------- |
| `@repo/api`       | `apps/api/`       | Hono               | `src/index.ts` | `api-exe` (bun compile)    |
| `@repo/web`       | `apps/web/`       | TanStack Start     | `src/start.ts` | `.output/` (vite)          |
| `@repo/worker`    | `apps/worker/`    | BullMQ             | `src/index.ts` | `worker-exe` (bun compile) |
| `@repo/simulator` | `apps/simulator/` | Hono (traffic gen) | `src/index.ts` | `sim-exe` (bun compile)    |
| `@repo/db`        | `packages/db/`    | Drizzle ORM        | `src/index.ts` | —                          |
| `@repo/redis`     | `packages/redis/` | BullMQ / Redis     | `src/index.ts` | —                          |

`@repo/db` and `@repo/redis` are workspace devDependencies of the apps that use them.

## Path aliases

Every app maps `@/*` → `./src/*` via tsconfig `paths`. Internal packages import by name: `@repo/db`, `@repo/redis`.

## Database

- PostgreSQL + TimescaleDB (hypertables on `log_event` partitioned by `timestamp`)
- Drizzle ORM with `snake_case` casing
- Migrations in `packages/db/src/migrations/`
- Migration runner: `packages/db/src/migrate.ts` (used standalone at Docker entrypoint)
- Docker entrypoint pattern: `./migrate-exe && ./api-exe`

### Drizzle commands (via `@repo/db`)

```
db:generate   # drizzle-kit generate
db:migrate    # drizzle-kit migrate
db:push       # drizzle-kit push
db:studio     # drizzle-kit studio
db:up/down    # docker compose for TimescaleDB
```

## API structure (`apps/api/src/`)

```
index.ts      — route registration (health, ingest, services, dashboard)
app.ts        — Hono factory: cors, security headers, compression, OpenAPI, Scalar reference
routes/       — HTTP handlers per domain
services/     — business logic
repositories/ — Drizzle/raw queries
middleware/   — error handler, not-found, emoji favicon
lib/          — env, encryption, rate-limit, openapi helpers
```

API routes: `/api/health`, `/api/ingest`, `/api/services`, `/api/dashboard`, `/api/doc` (OpenAPI JSON), `/api/reference` (Scalar UI).

## Worker

BullMQ `log-events` queue. Receives from ingest, validates against `EventSchema`, scrubs PII, writes to `log_event`. Failed jobs → `dead_letter` table. Concurrency: 10.

## Frontend

- TanStack Start (SSR framework with vite)
- `src/start.ts` — bootstrap, `src/router.tsx` — router + QueryClient (refetch interval 15s)
- `src/routeTree.gen.ts` — auto-generated from manual route definitions
- `src/server/` — server functions for SSR data fetching
- Tailwind CSS v4 via `@tailwindcss/vite`

## Linting & formatting

- **oxlint** — plugins: unicorn, typescript, oxc, import, jsdoc, promise, react, react-perf, jsx-a11y
- **oxfmt** — sortImports with `@repo/` custom group, Tailwind class sorting via stylesheet
- oxlint/oxfmt ignore: `.jj/`, `**/generated/**`, `**/migrations/**`, `**/*.gen.*`, `**/worker-configuration.d.ts`

## Env

Each app/package validates its env with `@t3-oss/env-core` + Zod (`src/lib/env.ts`). `.env` files are gitignored; `.env.example` is committed.

## Release

semantic-release on push to `main` (also `beta` prerelease branch). Generates `CHANGELOG.md` + GitHub release. Runs in CI with `npx`.

## Notable

- Both `.git/` and `.jj/` present (Jujutsu VCS used alongside git)
- **No tests** — no test framework, no test files anywhere in the repo
- TS 6.0.3, Bun 1.3.14, `bunfig.toml` uses `linker = "isolated"`
