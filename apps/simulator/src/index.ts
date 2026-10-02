import { Hono } from "hono";

type LogLevel = "debug" | "info" | "warn" | "error";
type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD";

/** [value, weight] — weights are relative, not percentages. */
type Weighted<T> = Array<[T, number]>;

type EndpointProfile = {
  pathTemplates: Weighted<string>;
  methods: Weighted<HttpMethod>;
  baseDurationMs: number;
  p95Multiplier: number;
  // kept apart so the error rate can be steered per event instead of being
  // whatever the mix of a single pool happens to be
  successPool: number[];
  errorPool: number[];
  levelBias: LogLevel[];
  category: string;
};

const app = new Hono();

const API_URL = process.env.API_URL || "http://localhost:8000";
const SERVICE_TOKEN = process.env.SERVICE_TOKEN;

// Mean gap between arrivals. Inter-arrival times are drawn from an exponential
// distribution with this mean, which is what makes traffic look organic: mostly
// short gaps, occasional long ones, no preferred rhythm to spot.
const MEAN_INTERVAL_MS = Math.max(
  1,
  parseInt(
    process.env.INTERVAL_MS || process.env.MEAN_INTERVAL_MS || "1000",
    10,
  ),
);

// Micro-batching: events are held until one of these trips, so ingest still
// receives batches without the simulator having to fire one event per timer.
const BATCH_MAX_EVENTS = parseInt(process.env.BATCH_MAX_EVENTS || "40", 10);
const BATCH_MAX_AGE_MS = parseInt(process.env.BATCH_MAX_AGE_MS || "1500", 10);

// Endpoint profiles shape generated traffic so each route has distinct behavior.
// Each carries its own error budget (auth is far noisier than a health check);
// the pools are split so errorRateAt() can scale it at any moment.
const endpointProfiles: EndpointProfile[] = [
  {
    // health is read-only and polled constantly
    pathTemplates: [["/api/health", 1]],
    methods: [["GET", 1]],
    baseDurationMs: 10,
    p95Multiplier: 1.8,
    // ~4% errors — polled constantly, almost never fails
    successPool: [
      200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200,
    ],
    errorPool: [503, 504],
    levelBias: ["debug", "debug", "info", "info", "info"],
    category: "infrastructure",
  },
  {
    pathTemplates: [
      ["/api/auth/login", 5],
      ["/api/auth/refresh", 4],
      ["/api/auth/logout", 2],
    ],
    methods: [["POST", 1]],
    baseDurationMs: 90,
    p95Multiplier: 3.2,
    // ~28% errors — auth is legitimately the noisiest (bad passwords, expired tokens)
    successPool: [200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200],
    errorPool: [401, 401, 429, 500, 502],
    levelBias: ["info", "info", "info", "info", "warn"],
    category: "auth",
  },
  {
    // collection listing outnumbers single fetches, which outnumber deep reads
    pathTemplates: [
      ["/api/users", 6],
      ["/api/users/:id", 8],
      ["/api/users/:id/profile", 2],
      ["/api/users/:id/preferences", 1],
    ],
    methods: [
      ["GET", 5],
      ["PATCH", 1],
    ],
    baseDurationMs: 55,
    p95Multiplier: 2.6,
    // ~26% errors — item reads miss often on a large catalogue
    successPool: [
      200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200,
    ],
    errorPool: [404, 404, 500, 503],
    levelBias: ["debug", "info", "info", "info", "warn"],
    category: "user",
  },
  {
    // catalog reads dominate: search and listing are the hot paths
    pathTemplates: [
      ["/api/search", 8],
      ["/api/products", 6],
      ["/api/categories", 3],
      ["/api/products/:id", 5],
      ["/api/products/:id/reviews", 2],
    ],
    methods: [["GET", 1]],
    baseDurationMs: 45,
    p95Multiplier: 2.0,
    // ~9% errors — catalog reads are the most stable
    successPool: [
      200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200,
      200, 200, 304, 304,
    ],
    errorPool: [404, 500],
    levelBias: ["debug", "debug", "info", "info", "info"],
    category: "catalog",
  },
  {
    // writes are rarer than reads, and checkout is the rarest of all
    pathTemplates: [
      ["/api/cart", 5],
      ["/api/orders", 4],
      ["/api/cart/:id", 3],
      ["/api/orders/:id", 3],
      ["/api/checkout", 2],
      ["/api/orders/:id/cancel", 1],
    ],
    methods: [
      ["GET", 4],
      ["POST", 3],
      ["DELETE", 1],
    ],
    baseDurationMs: 135,
    p95Multiplier: 4.0,
    // ~28% errors — commerce touches the most dependencies
    successPool: [
      200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 201, 201, 201, 204,
    ],
    errorPool: [400, 409, 422, 500, 502, 503],
    levelBias: ["info", "info", "info", "warn", "error"],
    category: "commerce",
  },
  {
    pathTemplates: [
      ["/api/settings", 4],
      ["/api/settings/notifications", 3],
      ["/api/settings/security", 1],
    ],
    methods: [
      ["GET", 5],
      ["PUT", 1],
    ],
    baseDurationMs: 65,
    p95Multiplier: 2.4,
    // ~14% errors — config changes are rarer and more likely to be rejected
    successPool: [
      200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200,
      204, 204,
    ],
    errorPool: [400, 403, 500],
    levelBias: ["info", "info", "info", "info", "warn"],
    category: "config",
  },
  {
    pathTemplates: [
      ["/api/notifications", 5],
      ["/api/notifications/:id/read", 4],
      ["/api/notifications/mark-all-read", 1],
    ],
    methods: [
      ["GET", 5],
      ["POST", 2],
      ["PATCH", 1],
    ],
    baseDurationMs: 40,
    p95Multiplier: 2.1,
    // ~6% errors — lightweight service
    successPool: [
      200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200,
      200, 200, 204, 204,
    ],
    errorPool: [404, 500],
    levelBias: ["debug", "info", "info", "info", "info"],
    category: "notifications",
  },
  {
    // analytics is fire-and-forget, so almost everything is a 202
    pathTemplates: [
      ["/api/analytics/events", 6],
      ["/api/analytics/pageview", 4],
    ],
    methods: [["POST", 1]],
    baseDurationMs: 25,
    p95Multiplier: 1.9,
    // ~7% errors — fire-and-forget, almost never fails
    successPool: [
      202, 202, 202, 202, 202, 202, 202, 202, 202, 202, 202, 202, 202, 202, 202,
      202, 202, 202, 202, 202, 202, 202, 202, 202, 202, 202, 202, 202, 202, 202,
    ],
    errorPool: [400, 500, 504],
    levelBias: ["debug", "debug", "debug", "info", "info"],
    category: "analytics",
  },
];

// More varied error messages by status code
const errorMessages: Record<number, string[]> = {
  400: [
    "Malformed JSON body in request",
    "Missing required field in payload",
    "Invalid query parameter format",
    "Request body exceeds allowed schema",
  ],
  401: [
    "Bearer token has expired",
    "Invalid or missing Authorization header",
    "Session has been revoked",
    "Token signature verification failed",
  ],
  403: [
    "Insufficient permissions for this resource",
    "Account does not have access to this feature",
    "Resource is locked for editing",
    "IP address is not in the allowlist",
  ],
  404: [
    "Resource not found",
    "Entity has been permanently deleted",
    "Route does not exist",
    "Referenced object ID is unknown",
  ],
  408: [
    "Client did not send request in time",
    "Request timed out waiting for body",
  ],
  409: [
    "Conflict: resource already exists",
    "Concurrent modification detected",
    "Duplicate entry violates unique constraint",
  ],
  413: [
    "Payload too large — max 10MB allowed",
    "File upload exceeds size limit",
  ],
  415: [
    "Unsupported media type",
    "Expected application/json but received text/plain",
  ],
  422: [
    "Validation failed: email is not a valid address",
    "Unprocessable entity — business rule violation",
    "Field 'quantity' must be a positive integer",
    "Coupon code has already been redeemed",
  ],
  429: [
    "Rate limit exceeded — try again in 60s",
    "Too many requests from this IP",
    "Quota exhausted for this API key",
  ],
  500: [
    "Upstream dependency failure",
    "Unhandled exception in request handler",
    "Database query returned unexpected null",
    "Internal serialization error",
    "Downstream service returned malformed response",
  ],
  502: [
    "Bad gateway — upstream returned invalid response",
    "Proxy received empty response from origin",
    "Load balancer could not reach backend",
  ],
  503: [
    "Service temporarily unavailable",
    "Dependency circuit breaker is open",
    "Server is under maintenance",
    "Database connection pool exhausted",
  ],
  504: [
    "Gateway timeout — upstream took too long",
    "Backend did not respond within deadline",
    "Database query exceeded 30s timeout",
  ],
};

const environments = [
  "production",
  "production",
  "production",
  "staging",
  "development",
];
const regions = ["us-east-1", "eu-west-1", "ap-southeast-1"];
const browsers = ["chrome", "firefox", "safari", "edge"];
const upstreams = [
  "payments-service",
  "inventory-service",
  "email-service",
  "search-service",
  "cdn",
  "none",
  "none",
  "none",
];

type SimulationStats = {
  sentEvents: number;
  sentBatches: number;
  failedBatches: number;
  droppedEvents: number;
  lastError: string | null;
  lastRunAt: string | null;
};

const stats: SimulationStats = {
  sentEvents: 0,
  sentBatches: 0,
  failedBatches: 0,
  droppedEvents: 0,
  lastError: null,
  lastRunAt: null,
};

function getRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick<T>(entries: Weighted<T>): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;

  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }

  return entries[entries.length - 1][0];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChance(probability: number): boolean {
  return Math.random() < probability;
}

/**
 * Real ids follow a power law: a handful are hot and most are seen once or
 * twice. A uniform pick would give every id equal traffic and flatten the long
 * tail that makes per-endpoint rollups interesting.
 */
function resolveId(): string {
  const span = 9999;
  const skew = Math.pow(Math.random(), 3);
  return Math.max(1, Math.round(1 + (span - 1) * skew)).toString();
}

function resolvePath(template: string): string {
  if (!template.includes(":id")) return template;
  return template.replace(":id", resolveId());
}

/**
 * A sum of sinusoids at incommensurate periods. Bounded, smooth, and slow to
 * repeat, so the shape never settles into a rhythm a viewer can predict — the
 * opposite of the old fixed tier durations.
 */
const wobble = (
  at: number,
  terms: ReadonlyArray<readonly [number, number]>,
): number =>
  terms.reduce(
    (sum, [periodMs, phase]) => sum + Math.sin(at / periodMs + phase),
    0,
  ) / terms.length;

/** Remap a [-1, 1] signal onto [lo, hi]. */
const mapRange = (w: number, lo: number, hi: number): number =>
  lo + ((hi - lo) * (w + 1)) / 2;

// Rate follows a daily rhythm: quietest around 04:00, busiest mid-afternoon,
// with a slower wobble on top so no two days repeat.
const RATE_MULTIPLIER_MIN = 0.4;
const RATE_MULTIPLIER_MAX = 2.6;
const DAY_WOBBLE = [
  [7 * 3_600_000, 0.7],
  [29 * 60_000, 2.1],
] as const;

// Error pressure drifts independently of volume, so the error rate moves on
// its own schedule rather than tracking request count.
const ERROR_FACTOR_MIN = 0.62;
const ERROR_FACTOR_MAX = 1.85;
const ERROR_WOBBLE = [
  [9 * 60_000, 0],
  [23 * 60_000, 1.9],
  [61 * 60_000, 3.3],
] as const;

/** Mean base error rate across the profiles, before any time scaling. */
const MEAN_ERROR_RATE =
  endpointProfiles.reduce(
    (sum, profile) =>
      sum +
      profile.errorPool.length /
        (profile.successPool.length + profile.errorPool.length),
    0,
  ) / endpointProfiles.length;

const rateMultiplierAt = (at: Date): number => {
  const hour = at.getHours() + at.getMinutes() / 60;
  const daily = Math.cos(((hour - 15) / 24) * 2 * Math.PI);
  // the daily term dominates so the swing is wide; the wobble just keeps
  // consecutive days from being identical
  const signal = 0.9 * daily + 0.1 * wobble(at.getTime(), DAY_WOBBLE);
  return mapRange(signal, RATE_MULTIPLIER_MIN, RATE_MULTIPLIER_MAX);
};

const errorFactorAt = (at: Date): number =>
  mapRange(
    wobble(at.getTime(), ERROR_WOBBLE),
    ERROR_FACTOR_MIN,
    ERROR_FACTOR_MAX,
  );

/** This category's own budget, scaled by how much error pressure there is. */
const errorRateAt = (profile: EndpointProfile, at: Date): number => {
  const total = profile.successPool.length + profile.errorPool.length;
  if (total === 0) return 0;
  const base = profile.errorPool.length / total;
  return Math.min(0.95, Math.max(0.01, base * errorFactorAt(at)));
};

function generateDuration(profile: EndpointProfile, at: Date): number {
  const isTail = randomChance(0.08);
  const multiplier = isTail
    ? profile.p95Multiplier + Math.random() * 2.5
    : 0.6 + Math.random() * 1.4;
  // struggling services answer slower, so latency tracks the error curve
  const strain = 1 + (errorFactorAt(at) - 1) * 0.35;
  return Math.max(1, Math.round(profile.baseDurationMs * multiplier * strain));
}

function generateMessage(
  method: HttpMethod,
  path: string,
  status: number,
  level: LogLevel,
): string {
  // Use varied error messages when available for this status
  if (status >= 400 && errorMessages[status]) {
    return getRandom(errorMessages[status]);
  }

  if (status >= 500) {
    return `Upstream dependency failure while handling ${method} ${path}`;
  }

  if (status >= 400) {
    return `Client request rejected for ${method} ${path} with status ${status}`;
  }

  if (level === "debug") {
    return `Handled ${method} ${path} with detailed debug trace`;
  }

  if (status === 304) {
    return `Cache hit for ${method} ${path}`;
  }

  if (status === 202) {
    return `Request accepted for async processing: ${method} ${path}`;
  }

  if (status === 204) {
    return `No content returned for ${method} ${path}`;
  }

  return `Request completed for ${method} ${path}`;
}

function generateRandomLog(at: Date) {
  const profile = getRandom(endpointProfiles);
  const method = weightedPick(profile.methods);
  const path = resolvePath(weightedPick(profile.pathTemplates));
  const status = getRandom(
    randomChance(errorRateAt(profile, at))
      ? profile.errorPool
      : profile.successPool,
  );

  const fallbackLevel: LogLevel =
    status >= 500 ? "error" : status >= 400 ? "warn" : "info";
  const level = getRandom([...profile.levelBias, fallbackLevel]);

  const duration = generateDuration(profile, at);
  const environment = getRandom(environments);

  return {
    level,
    // the event's own arrival time, not the moment the batch happened to be
    // flushed, so a batch does not stamp a pile of identical timestamps
    timestamp: at.toISOString(),
    environment,
    method,
    path,
    status,
    duration,
    message: generateMessage(method, path, status, level),
    sessionId: crypto.randomUUID().slice(0, 8),
    meta: {
      region: getRandom(regions),
      browser: getRandom(browsers),
      category: profile.category,
      retryCount: randomChance(0.07) ? randomInt(1, 3) : 0,
      cacheHit: status === 304,
      upstream: getRandom(upstreams),
    },
  };
}

type SimLog = ReturnType<typeof generateRandomLog>;

// ---------------------------------------------------------------------------
// Arrival process
// ---------------------------------------------------------------------------

/**
 * Exponential inter-arrival: the gap has no preferred length, so traffic has
 * no rhythm to spot. `1 - u` keeps the argument inside (0, 1] so the log
 * cannot blow up on Math.random() returning 0.
 */
function exponentialDelay(mean: number): number {
  return -Math.log(1 - Math.random()) * mean;
}

/**
 * The next gap, with the mean scaled by the time-of-day rate so volume drifts
 * up and down instead of holding one rate forever.
 */
const nextGapMs = (from: Date): number =>
  exponentialDelay(MEAN_INTERVAL_MS / rateMultiplierAt(from));

let isSimulating = false;
let loopTimer: ReturnType<typeof setTimeout> | null = null;
let nextArrivalAt = 0;
let pending: SimLog[] = [];

async function sendBatch(logs: SimLog[]) {
  if (!SERVICE_TOKEN) {
    stats.lastError = "SERVICE_TOKEN is not set";
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-deko-service-token": SERVICE_TOKEN,
      },
      body: JSON.stringify(logs),
    });

    if (!response.ok) {
      stats.failedBatches += 1;
      stats.lastError = `${response.status} ${response.statusText}`;
      console.error(
        `Failed batch (${logs.length} events): ${response.status} ${response.statusText}`,
        await response.text(),
      );
      return;
    }

    const payload = (await response.json()) as {
      data?: { accepted?: number; rejected?: number };
    };

    const accepted = payload.data?.accepted ?? logs.length;
    const rejected = payload.data?.rejected ?? 0;

    stats.sentBatches += 1;
    stats.sentEvents += accepted;
    stats.droppedEvents += rejected;
    stats.lastRunAt = new Date().toISOString();
    stats.lastError = null;

    console.log(
      `Batch sent: size=${logs.length} accepted=${accepted} rejected=${rejected} buffered=${pending.length}`,
    );
  } catch (error) {
    stats.failedBatches += 1;
    stats.lastError = error instanceof Error ? error.message : String(error);
    console.error("Error sending simulator batch:", error);
  }
}

async function flushPending() {
  if (pending.length === 0) return;
  const batch = pending;
  pending = [];
  await sendBatch(batch);
}

async function onArrivalTick() {
  const now = Date.now();

  // Materialise every arrival that is already due. Catching up in one go keeps
  // the rate correct after a stall without needing one timer per event.
  let guard = 0;
  while (nextArrivalAt <= now && guard < 500) {
    pending.push(generateRandomLog(new Date(nextArrivalAt)));
    nextArrivalAt += nextGapMs(new Date(nextArrivalAt));
    guard += 1;
  }

  if (nextArrivalAt < now) nextArrivalAt = now;

  const oldestPendingAt = pending[0]
    ? new Date(pending[0].timestamp).getTime()
    : Infinity;

  if (
    pending.length >= BATCH_MAX_EVENTS ||
    (pending.length > 0 && now - oldestPendingAt >= BATCH_MAX_AGE_MS)
  ) {
    await flushPending();
  }

  scheduleNextTick();
}

function scheduleNextTick() {
  if (!isSimulating) return;

  const now = Date.now();
  const untilArrival = Math.max(0, nextArrivalAt - now);
  const oldestPendingAt = pending[0]
    ? new Date(pending[0].timestamp).getTime()
    : Infinity;
  const untilFlush = Number.isFinite(oldestPendingAt)
    ? Math.max(0, BATCH_MAX_AGE_MS - (now - oldestPendingAt))
    : Infinity;

  // capped so a long gap between arrivals still wakes us to flush on age
  const delay = Math.max(1, Math.min(untilArrival, untilFlush, 1000));

  loopTimer = setTimeout(() => {
    void onArrivalTick();
  }, delay);
}

function startSimulation() {
  if (isSimulating) return;

  isSimulating = true;
  nextArrivalAt = Date.now();

  console.log(
    `Starting simulator: meanIntervalMs=${MEAN_INTERVAL_MS} batchMaxEvents=${BATCH_MAX_EVENTS} batchMaxAgeMs=${BATCH_MAX_AGE_MS}`,
  );

  void onArrivalTick();
}

function stopSimulation() {
  if (!isSimulating) return;

  isSimulating = false;
  if (loopTimer) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }

  console.log("Simulator stopped.");
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/", (c) => c.text("Deko log simulator is running"));

app.get("/status", (c) => {
  const oldestPendingAt = pending[0]
    ? new Date(pending[0].timestamp).getTime()
    : null;

  return c.json({
    isSimulating,
    apiUrl: API_URL,
    hasToken: !!SERVICE_TOKEN,
    config: {
      meanIntervalMs: MEAN_INTERVAL_MS,
      batchMaxEvents: BATCH_MAX_EVENTS,
      batchMaxAgeMs: BATCH_MAX_AGE_MS,
    },
    // live view of where the two curves are right now
    now: {
      rateMultiplier: Number(rateMultiplierAt(new Date()).toFixed(2)),
      approxEventsPerSecond: Number(
        (rateMultiplierAt(new Date()) * 1000) / MEAN_INTERVAL_MS,
      ).toFixed(2),
      errorFactor: Number(errorFactorAt(new Date()).toFixed(2)),
      expectedErrorRate: Number(
        (MEAN_ERROR_RATE * errorFactorAt(new Date()) * 100).toFixed(1),
      ),
    },
    buffered: {
      count: pending.length,
      oldestAgeMs:
        oldestPendingAt === null ? null : Date.now() - oldestPendingAt,
    },
    stats,
  });
});

app.post("/start", (c) => {
  startSimulation();
  return c.json({ message: "Simulation started" });
});

app.post("/stop", (c) => {
  stopSimulation();
  return c.json({ message: "Simulation stopped" });
});

app.post("/tick", async (c) => {
  const countParam = new URL(c.req.url).searchParams.get("count");
  const count = countParam ? Math.max(1, Math.min(100, Number(countParam))) : 1;

  if (!Number.isFinite(count)) {
    return c.json({ error: "Invalid count query parameter" }, 400);
  }

  const now = new Date();
  await sendBatch(Array.from({ length: count }, () => generateRandomLog(now)));

  return c.json({ message: "Manual batch sent", count });
});

// Start simulation immediately if token is present
if (SERVICE_TOKEN) {
  startSimulation();
} else {
  console.warn(
    "No SERVICE_TOKEN provided. Simulator is idle. Set SERVICE_TOKEN and call POST /start.",
  );
}

export default {
  port: 5000,
  fetch: app.fetch,
};
