import { and, eq, gte, ilike, like, lt, lte, or, sql } from "@repo/db";
import { logEvent } from "@repo/db/schemas/event.schema";
import {
  GranularityType,
  LevelType,
  MethodType,
  PeriodType,
  TopEndpointSortBy,
} from "@repo/db/validators/dashboard.validator";
import { redisClient } from "@repo/redis";

export type Period = PeriodType;
export type Granularity = GranularityType;
export type Method = MethodType;
export type Level = LevelType;

export type LogFilters = {
  serviceId: string;
  level?: Level;
  status?: number;
  environment?: string;
  method?: Method;
  path?: string;
  search?: string;
  period?: Period;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
  cursor?: {
    timestamp: Date;
    id: string;
  };
  minDuration?: number;
};

export type TimeseriesFilters = {
  serviceId: string;
  granularity?: Granularity;
  period?: Period;
  from?: Date;
  to?: Date;
  environment?: string;
  method?: Method;
  path?: string;
  level?: Level;
};

// Filters for the top-endpoints leaderboard query.
export type TopEndpointsFilters = {
  serviceId: string;
  period?: Period;
  from?: Date;
  to?: Date;
  environment?: string;
  method?: Method;
  sortBy?: TopEndpointSortBy;
  limit?: number;
};

// Filters for the error-groups aggregation query.
export type ErrorGroupFilters = {
  serviceId: string;
  period?: Period;
  from?: Date;
  to?: Date;
  environment?: string;
  limit?: number;
  offset?: number;
};

export type CountCacheKeyParams = {
  serviceId: string;
  period: string;
  level?: string;
  status?: number;
  environment?: string;
  method?: string;
  path?: string;
  to?: Date;
  from?: Date;
  search?: string;
  minDuration?: number;
};

/**
 * Converts a period string (1h, 24h, 7d) to a Date representing the
 * start of that period.
 */
export const periodToDate = (period: Period): Date => {
  const now = new Date();
  switch (period) {
    case "1h":
      return new Date(now.getTime() - 60 * 60 * 1000);
    case "24h":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
};

/**
 * Maps each named dashboard period to a PostgreSQL interval literal.
 * Used wherever period-based time windows are applied so bounds are always
 * evaluated using the database clock/timezone (`now() - interval`) rather than
 * binding app-generated Date objects to `timestamp` (without timezone) columns.
 * Binding app-side Dates can silently shift short windows (e.g. 1h) when the
 * PostgreSQL session timezone differs from the application runtime timezone.
 */
export const PERIOD_TO_DB_INTERVAL: Record<Period, string> = {
  "1h": "1 hour",
  "24h": "24 hours",
  "7d": "7 days",
};

/**
 * Returns the previous window for a given period length.
 * This is majorly for the overview stats which compare the current period
 * against the previous one to compute percentage deltas.
 */
export const getPrevPeriod = (period: Period): { from: Date; to: Date } => {
  const now = new Date();
  const periodMs = {
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
  }[period];

  return {
    from: new Date(now.getTime() - 2 * periodMs),
    to: new Date(now.getTime() - periodMs),
  };
};

/**
 * Generates a deterministic cache key for exact-count queries.
 * The cursor is intentionally excluded so cache entries represent the
 * full filtered set rather than a specific page position.
 */
export const makeCountCacheKey = (params: CountCacheKeyParams): string => {
  return JSON.stringify({
    ...params,
    to: params.to?.toISOString(),
    from: params.from?.toISOString(),
  });
};

/**
 * Determines the best granularity based on the period.
 * - 1h → minute (60 data points)
 * - 24h → hour (24 data points)
 * - 7d → hour (168 data points)
 */
export const getDefaultGranularity = (period: Period): Granularity => {
  switch (period) {
    case "1h":
      return "minute";
    case "24h":
      return "15minute";
    case "7d":
      return "2hour";
  }
};

/**
 * Converts a path filter with wildcards to a SQL LIKE pattern.
 * Supports wildcards like /api/* which becomes /api/%
 */
export const pathToLikePattern = (path: string): string => {
  // Escape SQL LIKE special characters (% and _) in the path
  let pattern = path.replace(/%/g, "\\%").replace(/_/g, "\\_");
  // Convert * wildcards to SQL %
  pattern = pattern.replace(/\*/g, "%");
  return pattern;
};

/**
 * Centralizes filtering logic for logs, counts, and stats.
 */
export const getLogConditions = (filters: LogFilters) => {
  const {
    serviceId,
    level,
    status,
    environment,
    method,
    path,
    search,
    period,
    from,
    to,
    cursor,
  } = filters;

  const conditions = [eq(logEvent.serviceId, serviceId)];

  if (level) conditions.push(eq(logEvent.level, level));
  if (status) conditions.push(eq(logEvent.status, status));
  if (environment) conditions.push(eq(logEvent.environment, environment));
  if (method) conditions.push(eq(logEvent.method, method));

  // Path filtering with wildcard support
  if (path) {
    if (path.includes("*")) {
      conditions.push(like(logEvent.path, pathToLikePattern(path)));
    } else {
      conditions.push(eq(logEvent.path, path));
    }
  }

  // full-text search across path and message fields
  if (search) {
    const searchPattern = `%${search}%`;
    conditions.push(
      or(
        ilike(logEvent.path, searchPattern),
        ilike(logEvent.message, searchPattern),
      ) ?? sql`true`,
    );
  }

  let periodStart: Date | undefined;
  let periodEnd: Date | undefined;

  if (period) {
    // Compute Date bounds for response metadata only (e.g. the period window
    // echoed in overview stats). The actual SQL conditions use PERIOD_TO_DB_INTERVAL
    // so the comparison is anchored to the DB clock/timezone instead of an
    // app-bound Date parameter, which prevents short-window drift (e.g. 1h).
    periodStart = periodToDate(period);
    periodEnd = new Date();
    conditions.push(
      sql`${logEvent.timestamp} >= now() - ${PERIOD_TO_DB_INTERVAL[period]}::interval`,
    );
    conditions.push(sql`${logEvent.timestamp} <= now()`);
  } else {
    if (from) {
      periodStart = from;
      conditions.push(gte(logEvent.timestamp, from));
    }
    if (to) {
      periodEnd = to;
      conditions.push(lte(logEvent.timestamp, to));
    }
  }

  // if cursor is present, we prioritize the cursor logic for pagination
  // cursor logic: (timestamp < cursorTime) ie get all logs that happened before the cursor time OR (timestamp = cursorTime AND id < cursorId) ie get all logs that happened at the same time as the cursor but with a smaller id
  if (cursor) {
    conditions.push(
      or(
        lt(logEvent.timestamp, cursor.timestamp),
        and(
          eq(logEvent.timestamp, cursor.timestamp),
          lt(logEvent.id, cursor.id),
        ),
      ) ?? sql`true`,
    );
  }

  // When minDuration is provided, exclude all logs with a shorter response time.
  // This is used by the /logs/slow endpoint to enforce a latency threshold.
  const { minDuration } = filters;
  if (minDuration !== undefined)
    conditions.push(gte(logEvent.duration, minDuration));

  return { conditions, periodStart, periodEnd };
};

// ---------------------------------------------------------------------------
// Redis-backed count cache
// Shared across all API instances so every instance benefits from and
// contributes to the same cache entries, with TTL managed by Redis itself.
// ---------------------------------------------------------------------------

const LOG_COUNT_CACHE_TTL_MS = 30_000;
const LOG_COUNT_CACHE_TTL_S = Math.ceil(LOG_COUNT_CACHE_TTL_MS / 1000);
const LOG_COUNT_CACHE_PREFIX = "log-count-cache:";

export const getCountFromCache = async (
  key: string,
): Promise<number | null> => {
  const raw = await redisClient.get(`${LOG_COUNT_CACHE_PREFIX}${key}`);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

export const setCountInCache = async (
  key: string,
  value: number,
): Promise<void> => {
  const fullKey = `${LOG_COUNT_CACHE_PREFIX}${key}`;
  await redisClient.set(fullKey, value.toString());
  await redisClient.expire(fullKey, LOG_COUNT_CACHE_TTL_S);
};
