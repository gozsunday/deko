# Simulator

A traffic simulator for the Deko ingest API.

It generates synthetic logs whose _arrival times_ follow a Poisson process, so the dashboard can be exercised against data that looks organic rather than metered.

## Quick Start

From the simulator directory:

```bash
bun install
SERVICE_TOKEN=<your_service_token> bun run dev
```

Or from workspace root:

```bash
bun run --filter @repo/simulator dev
```

The simulator server runs on port `5000`.

## Environment Variables

- `SERVICE_TOKEN` (required to actually send logs): service token used for `/api/ingest`.
- `API_URL` (optional, default: `http://localhost:8000`): base URL of the API service.
- `INTERVAL_MS` (optional, default: `1000`): **mean** gap between arrivals at the average rate. Lower means more traffic. The actual rate is scaled by the time-of-day curve below, so the default yields somewhere between ~0.4 and ~2.5 events/second depending on the hour.
- `BATCH_MAX_EVENTS` (optional, default: `40`): flush as soon as this many events are buffered.
- `BATCH_MAX_AGE_MS` (optional, default: `1500`): flush once the oldest buffered event is this old.

Approximate volume:

| `INTERVAL_MS` | events/day |
| ------------- | ---------- |
| 250           | 345k       |
| 1000          | 86k        |
| 2000          | 43k        |

## How traffic is generated

There is one mode. Arrival times are drawn from an **exponential distribution**, which is what makes the traffic look real: mostly short gaps, occasional long ones, no fixed rhythm to spot. There are no tiers, phases, or presets.

### Two curves keep the charts alive

A constant arrival rate would render the request chart as a flat line — the statistical noise on a large bucket is only a few percent, so more data makes the chart _flatter_, not livelier. Two smooth, bounded curves sit over the randomness:

**Volume follows the clock.** The mean gap is divided by a time-of-day multiplier of **0.4×–2.6×**, peaking mid-afternoon and bottoming out around 04:00 — roughly a **4.5× swing** in request rate across a day.

**Error pressure drifts on its own.** Each endpoint category keeps its own error budget (auth is genuinely noisier than a health check), and a separate factor of **0.62×–1.85×** scales all of them, moving the overall error rate between roughly **10% and 30%**. It runs on different periods than the volume curve, so errors rise and fall independently of request count rather than tracking it.

Latency is nudged upward when error pressure is high, because services answer slower when they are struggling. That keeps the p95/p99 charts moving too.

Both curves are sums of sinusoids at incommensurate periods, so they stay bounded, move smoothly, and never settle into a predictable loop. There is no switch to turn them off — the shape is a deliberate property of the simulator.

> The curves follow the host's wall clock. If you generate data meant to look like a different part of the day, or your clock is wrong, the shape will not match the hour on the label.

Events are sent in **batches** so ingest batching still gets exercised: a batch flushes as soon as it reaches `BATCH_MAX_EVENTS` or the oldest buffered event reaches `BATCH_MAX_AGE_MS`.

Each event keeps its **own arrival timestamp** rather than the moment its batch happened to flush, so a batch does not stamp a pile of identical timestamps onto the data.

Each event independently draws:

- an endpoint profile, weighted — reads outnumber writes, and hot paths like search outnumber deep ones
- a method and path template, weighted within that profile
- an `:id` from a **power-law** distribution, so a few ids are hot and most are seen once or twice (a uniform pick would flatten the long tail)
- a status code from that profile's weighted pool, a level biased by profile, and a duration with a deliberate slow tail

## HTTP Control Endpoints

These endpoints control the simulator process itself (served on port `5000`).

- `GET /` — liveness text response.
- `GET /status` — simulation state, config, and counters:
  - `isSimulating`, `apiUrl`, `hasToken`
  - `config.meanIntervalMs`, `config.batchMaxEvents`, `config.batchMaxAgeMs`
  - `now.rateMultiplier`, `now.approxEventsPerSecond` — where the volume curve is right now
  - `now.errorFactor`, `now.expectedErrorRate` — where the error curve is right now
  - `buffered.count`, `buffered.oldestAgeMs` — events waiting to be flushed
  - `stats.sentEvents`, `stats.sentBatches`, `stats.failedBatches`, `stats.droppedEvents`, `stats.lastError`, `stats.lastRunAt`
- `POST /start` — starts the arrival loop.
- `POST /stop` — stops it. Events already buffered are dropped.
- `POST /tick?count=<n>` — sends an immediate manual batch. `count` is clamped to `1..100`.

## Notes

- Endpoint, status and latency distributions are intentionally non-uniform so dashboard charts show realistic p95/p99 and error patterns.
- The global error rate swings between roughly **10% and 30%**, far higher than a real service on purpose so the dashboard always has error signal to chart. Each endpoint category keeps its own budget inside that band: health checks around 7%, auth and commerce around 30%.
- Error messages are varied by status code — expired tokens, circuit breakers, constraint violations, payload limits — rather than generic strings.
- If `SERVICE_TOKEN` is missing, the simulator starts idle and will not send traffic.
