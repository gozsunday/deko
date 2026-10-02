import { and, asc, db, desc, eq, gte, like, lte, sql } from "@repo/db";
import { logEvent } from "@repo/db/schemas/event.schema";
import type {
  ErrorGroupsResponse,
  LogLevelBreakdown,
  MethodType,
  PeriodType,
  StatusCodeBreakdown,
  TopEndpoint,
} from "@repo/db/validators/dashboard.validator";

import {
  PERIOD_TO_DB_INTERVAL,
  getDefaultGranularity,
  getLogConditions,
  pathToLikePattern,
  periodToDate,
  type ErrorGroupFilters,
  type LogFilters,
  type TimeseriesFilters,
  type TopEndpointsFilters,
} from "@/services/dashboard.service";

type Period = PeriodType;

/**
 * Window predicate for the continuous aggregates. The rollups are bucketed at
 * 15 minutes, so the start of the window snaps down to its bucket -- the same
 * rounding the buckets imply. materialized_only=false means the in-progress
 * bucket is merged from raw at query time, so the tail is never missing.
 */
const rollupScope = (
  serviceId: string,
  period: Period = "24h",
  environment?: string,
  from?: Date,
  to?: Date,
) => {
  const start = from
    ? sql`${from}::timestamptz`
    : sql`now() - ${PERIOD_TO_DB_INTERVAL[period]}::interval`;
  const end = to ? sql`${to}::timestamptz` : sql`now()`;

  return sql`
    service_id = ${serviceId}
    AND bucket >= time_bucket(INTERVAL '15 minutes', ${start})
    AND bucket <= time_bucket(INTERVAL '15 minutes', ${end})
    ${environment ? sql`AND environment = ${environment}` : sql``}
  `;
};

type ServiceOverviewStatsResult = {
  totalRequests: number;
  errorCount: number;
  errorRate: number;
  avgDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  period: {
    from: Date;
    to: Date;
  };
};
type ServiceLogsResult = Awaited<
  ReturnType<DashboardRepository["getServiceLogs"]>
>;
type LogTimeseriesResult = Awaited<
  ReturnType<DashboardRepository["getLogTimeseries"]>
>;
type SingleLogResult = Awaited<ReturnType<DashboardRepository["getSingleLog"]>>;
type LogsByRequestIdResult = Awaited<
  ReturnType<DashboardRepository["getLogsByRequestId"]>
>;

type StatusBreakdownParams = {
  serviceId: string;
  period: Period;
  groupBy: "category" | "code";
  environment?: string;
};

type LogLevelBreakdownParams = {
  serviceId: string;
  period: Period;
  environment?: string;
};

/** Contract for dashboard data access */
export interface IDashboardRepository {
  getServiceOverviewStats(
    filters: LogFilters,
  ): Promise<ServiceOverviewStatsResult>;
  getLogTimeseries(filters: TimeseriesFilters): Promise<LogTimeseriesResult>;
  getServiceLogs(filters: LogFilters): Promise<ServiceLogsResult>;
  getServiceLogsCount(filters: LogFilters): Promise<number>;
  getSingleLog(
    serviceId: string,
    logId: string,
    timestamp: Date,
  ): Promise<SingleLogResult>;
  getStatusCodeBreakdown(
    params: StatusBreakdownParams,
  ): Promise<StatusCodeBreakdown>;
  getLogLevelBreakdown(
    params: LogLevelBreakdownParams,
  ): Promise<LogLevelBreakdown>;
  getTopEndpoints(
    filters: TopEndpointsFilters,
  ): Promise<{ endpoints: TopEndpoint[]; total: number }>;
  getErrorGroups(filters: ErrorGroupFilters): Promise<ErrorGroupsResponse>;
  getServiceEnvironments(serviceId: string): Promise<string[]>;
  getLogsByRequestId(
    serviceId: string,
    requestId: string,
  ): Promise<LogsByRequestIdResult>;
}

/** Repository implementation for dashboard analytics and logs */
export class DashboardRepository implements IDashboardRepository {
  /** Fetches a page of logs with stable cursor ordering. */
  async getServiceLogs(filters: LogFilters) {
    const { limit = 50, offset = 0 } = filters;
    const { conditions } = getLogConditions(filters);

    return await db
      .select()
      .from(logEvent)
      .where(and(...conditions))
      .orderBy(desc(logEvent.timestamp), desc(logEvent.id))
      .limit(limit)
      .offset(offset);
  }

  /** Computes exact row count for the current filtered log set. */
  async getServiceLogsCount(filters: LogFilters) {
    const { conditions } = getLogConditions(filters);

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(logEvent)
      .where(and(...conditions));

    return result[0]?.count ?? 0;
  }

  /**
   * Calculates summary KPIs for a selected period.
   * Includes total/error counts, latency percentiles, and resolved period bounds.
   */
  async getServiceOverviewStats(filters: LogFilters) {
    const { serviceId, period = "24h", from, to, environment } = filters;

    // Rolls up instead of scanning log_event. duration has ~846 distinct
    // values, so (bucket, duration) -> count is a complete histogram; summing
    // it over the window rebuilds the multiset PERCENTILE_CONT would have seen,
    // and the cumulative count locates each percentile without expanding rows.
    // Percentiles are nearest-rank rather than interpolated, which measured
    // within 1ms of PERCENTILE_CONT on this data.
    const hist = rollupScope(serviceId, period, environment, from, to);
    const statuses = rollupScope(serviceId, period, environment, from, to);

    const result = await db.execute(sql`
      WITH h AS (
        SELECT duration, SUM(n)::bigint AS n, SUM(duration_sum)::bigint AS ds
        FROM service_duration_histogram
        WHERE ${hist}
        GROUP BY duration
      ),
      cum AS (
        SELECT duration, n, SUM(n) OVER (ORDER BY duration) AS running FROM h
      ),
      tot AS (
        SELECT COALESCE(SUM(n), 0)::bigint AS total,
               COALESCE(SUM(ds), 0)::bigint AS duration_total FROM h
      ),
      err AS (
        SELECT COALESCE(SUM(n) FILTER (WHERE status >= 400), 0)::bigint AS errors
        FROM service_status_counts
        WHERE ${statuses}
      )
      SELECT
        tot.total::int AS "totalRequests",
        err.errors::int AS "errorCount",
        ROUND(COALESCE(tot.duration_total::numeric / NULLIF(tot.total, 0), 0), 3)::real AS "avgDuration",
        (SELECT COALESCE((SELECT duration FROM cum WHERE running >= tot.total * 0.50 ORDER BY duration LIMIT 1), 0))::real AS "p50Duration",
        (SELECT COALESCE((SELECT duration FROM cum WHERE running >= tot.total * 0.95 ORDER BY duration LIMIT 1), 0))::real AS "p95Duration",
        (SELECT COALESCE((SELECT duration FROM cum WHERE running >= tot.total * 0.99 ORDER BY duration LIMIT 1), 0))::real AS "p99Duration"
      FROM tot, err
    `);

    const stats = result.rows[0] as {
      totalRequests: number;
      errorCount: number;
      avgDuration: number;
      p50Duration: number;
      p95Duration: number;
      p99Duration: number;
    };

    const periodStart = from ?? periodToDate(period);
    const periodEnd = to ?? new Date();

    return {
      ...stats,
      errorRate:
        stats.totalRequests > 0
          ? (stats.errorCount / stats.totalRequests) * 100
          : 0,
      period: {
        from: periodStart ?? new Date(),
        to: periodEnd,
      },
    };
  }

  /** Returns time-bucketed aggregates for charting trends. */
  async getLogTimeseries(filters: TimeseriesFilters) {
    const {
      serviceId,
      granularity,
      period = "24h",
      from,
      to,
      environment,
      method,
      path,
      level,
      needsPercentiles = false,
    } = filters;

    const bucketSize = granularity ?? getDefaultGranularity(period);
    const bucketInterval =
      bucketSize === "minute"
        ? "1 minute"
        : bucketSize === "15minute"
          ? "15 minutes"
          : bucketSize === "hour"
            ? "1 hour"
            : bucketSize === "2hour"
              ? "2 hours"
              : "1 day";

    let startTime: Date;
    let endTime: Date;

    if (period) {
      startTime = periodToDate(period);
      endTime = new Date();
    } else {
      startTime = from ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
      endTime = to ?? new Date();
    }

    // For period-based requests (1h/24h/7d), anchor both the filter window and
    // the generated bucket series to the database clock so bucket edges line up with
    // the aggregated data for every supported granularity.
    const rangeStartExpression = period
      ? sql`now() - ${PERIOD_TO_DB_INTERVAL[period]}::interval`
      : sql`${startTime}::timestamp`;
    const rangeEndExpression = period ? sql`now()` : sql`${endTime}::timestamp`;

    // Build optional dimension conditions derived from the filter parameters.
    // These are added to the raw SQL so the time_bucket aggregation only considers
    // the requested slice, rather than requiring client-side post-filtering.
    const dimensionConditions = [];
    if (environment)
      dimensionConditions.push(eq(logEvent.environment, environment));
    if (method) dimensionConditions.push(eq(logEvent.method, method));
    if (path) {
      if (path.includes("*")) {
        dimensionConditions.push(like(logEvent.path, pathToLikePattern(path)));
      } else {
        dimensionConditions.push(eq(logEvent.path, path));
      }
    }
    if (level) dimensionConditions.push(eq(logEvent.level, level));

    // Generate all buckets for the time range, then LEFT JOIN actual data.
    // This ensures every bucket is present in the results, even if there are no logs,
    // preventing gaps in the timeseries chart when the service stops running.
    //
    // The rollup carries counts and a duration sum, so it answers requests,
    // errors and avg_duration exactly. It buckets by environment, so that
    // filter is fine; it cannot answer percentiles and has no method/path/
    // level, so those cases read log_event instead.
    const useRollup = !needsPercentiles && !method && !path && !level;

    const aggregated = useRollup
      ? sql`
        SELECT
          time_bucket(${bucketInterval}::interval, bucket) AS bucket,
          SUM(n)::int AS requests,
          SUM(errors)::int AS errors,
          (SUM(duration_sum)::numeric / NULLIF(SUM(n), 0))::real AS avg_duration,
          -- no distribution to rebuild percentiles from; the caller asked for
          -- none, or this branch would not have been taken
          NULL::real AS p50_duration,
          NULL::real AS p95_duration,
          NULL::real AS p99_duration
        FROM service_minute_counts
        WHERE service_id = ${serviceId}
          AND bucket >= time_bucket(INTERVAL '1 minute', ${rangeStartExpression})
          AND bucket <= time_bucket(INTERVAL '1 minute', ${rangeEndExpression})
          ${environment ? sql`AND environment = ${environment}` : sql``}
        GROUP BY 1
      `
      : sql`
        SELECT
          time_bucket(${bucketInterval}::interval, timestamp) AS bucket,
          COUNT(*)::int AS requests,
          COUNT(*) FILTER (WHERE status >= 400)::int AS errors,
          AVG(duration)::real AS avg_duration,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration)::real AS p50_duration,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration)::real AS p95_duration,
          PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration)::real AS p99_duration
        FROM log_event
        WHERE service_id = ${serviceId}
          AND timestamp >= ${rangeStartExpression}
          AND timestamp <= ${rangeEndExpression}
          ${dimensionConditions.length > 0 ? sql`AND ${and(...dimensionConditions)}` : sql``}
        GROUP BY 1
      `;

    const result = await db.execute(sql`
      WITH bucket_series AS (
        -- Generate all bucket boundaries using the same range source as the data filter.
        SELECT generate_series(
          time_bucket(${bucketInterval}::interval, ${rangeStartExpression}),
          time_bucket(${bucketInterval}::interval, ${rangeEndExpression}),
          ${bucketInterval}::interval
        ) AS bucket
      )
      SELECT
        b.bucket,
        COALESCE(a.requests, 0)::int AS requests,
        COALESCE(a.errors, 0)::int AS errors,
        COALESCE(a.avg_duration, 0)::real AS avg_duration,
        a.p50_duration::real AS p50_duration,
        a.p95_duration::real AS p95_duration,
        a.p99_duration::real AS p99_duration
      FROM bucket_series b
      LEFT JOIN (${aggregated}) a ON b.bucket = a.bucket
      ORDER BY b.bucket ASC
    `);

    return {
      granularity: bucketSize,
      period: { from: startTime, to: endTime },
      buckets: result.rows as Array<{
        bucket: Date;
        requests: number;
        errors: number;
        avg_duration: number;
        // null on the rollup path, which has no percentile detail
        p50_duration: number | null;
        p95_duration: number | null;
        p99_duration: number | null;
      }>,
    };
  }

  /** Finds one log row by service, id, and timestamp. */
  async getSingleLog(serviceId: string, logId: string, timestamp: Date) {
    const result = await db
      .select()
      .from(logEvent)
      .where(
        and(
          eq(logEvent.serviceId, serviceId),
          eq(logEvent.id, logId),
          eq(logEvent.timestamp, timestamp),
        ),
      )
      .limit(1);

    return result[0] ?? null;
  }

  /**
   * Builds status-code distribution as either exact status codes or categories.
   * Percentages are computed against the same filtered total.
   */
  async getStatusCodeBreakdown({
    serviceId,
    period,
    environment,
    groupBy,
  }: StatusBreakdownParams): Promise<StatusCodeBreakdown> {
    const { rows } = await db.execute(sql`
      WITH scoped AS (
        SELECT status, SUM(n)::bigint AS n
        FROM service_status_counts
        WHERE ${rollupScope(serviceId, period, environment)}
        GROUP BY status
      )
      SELECT
        ${
          groupBy === "code"
            ? sql`status`
            : sql`CASE
              WHEN status >= 200 AND status < 300 THEN '2xx'
              WHEN status >= 300 AND status < 400 THEN '3xx'
              WHEN status >= 400 AND status < 500 THEN '4xx'
              WHEN status >= 500 THEN '5xx'
              ELSE 'Other'
            END`
        } AS "key",
        ${
          groupBy === "code"
            ? sql`NULL::text`
            : sql`CASE
              WHEN status >= 200 AND status < 300 THEN 'Success'
              WHEN status >= 300 AND status < 400 THEN 'Redirection'
              WHEN status >= 400 AND status < 500 THEN 'Client Error'
              WHEN status >= 500 THEN 'Server Error'
              ELSE 'Other'
            END`
        } AS "label",
        SUM(n)::bigint AS "count"
      FROM scoped
      GROUP BY 1, 2
      ORDER BY ${groupBy === "code" ? sql`1 ASC` : sql`3 DESC, 1 ASC`}
    `);

    const total = rows.reduce((sum, row) => sum + Number(row.count), 0);

    const breakdown = rows.map((row) =>
      groupBy === "code"
        ? {
            status: Number(row.key),
            count: Number(row.count),
            percentage: total > 0 ? (Number(row.count) / total) * 100 : 0,
          }
        : {
            category: String(row.key),
            label: String(row.label),
            count: Number(row.count),
            percentage: total > 0 ? (Number(row.count) / total) * 100 : 0,
          },
    );

    return { breakdown, total } as StatusCodeBreakdown;
  }

  /** Computes severity-level distribution for filtered logs. */
  async getLogLevelBreakdown({
    serviceId,
    period,
    environment,
  }: LogLevelBreakdownParams): Promise<LogLevelBreakdown> {
    const { rows } = await db.execute(sql`
      SELECT level AS "level", SUM(n)::bigint AS "count"
      FROM service_status_counts
      WHERE ${rollupScope(serviceId, period, environment)}
      GROUP BY level
      ORDER BY level ASC
    `);

    const total = rows.reduce((sum, row) => sum + Number(row.count), 0);

    return {
      total,
      breakdown: rows.map((row) => ({
        level: String(
          row.level,
        ) as LogLevelBreakdown["breakdown"][number]["level"],
        count: Number(row.count),
        percentage: total > 0 ? (Number(row.count) / total) * 100 : 0,
      })),
    };
  }

  /** Ranks endpoint shapes by the requested metric (traffic, errors, latency, etc). */
  async getTopEndpoints(
    filters: TopEndpointsFilters,
  ): Promise<{ endpoints: TopEndpoint[]; total: number }> {
    const {
      serviceId,
      period = "24h",
      from,
      to,
      environment,
      method,
      sortBy = "requests",
      limit = 10,
    } = filters;

    // Build time-range conditions using DB-relative bounds for named periods so the
    // window is anchored to the database clock/timezone, consistent with all other
    // period-filtered queries. Custom from/to ranges bind Date values directly.
    const timeConditions =
      from && to
        ? [gte(logEvent.timestamp, from), lte(logEvent.timestamp, to)]
        : [
            sql`${logEvent.timestamp} >= now() - ${PERIOD_TO_DB_INTERVAL[period]}::interval`,
            sql`${logEvent.timestamp} <= now()`,
          ];

    const conditions = [eq(logEvent.serviceId, serviceId), ...timeConditions];

    // Optional pre-filters narrow the group by before aggregation.
    if (environment) conditions.push(eq(logEvent.environment, environment));
    if (method) conditions.push(eq(logEvent.method, method));

    // Map the sortBy enum value to a raw SQL ORDER BY expression.
    // Using predefined sql`` fragments is safe because sortBy is Zod-enum validated –
    // no user-controlled string ever reaches this switch.
    const orderByExprMap = {
      requests: sql`COUNT(*)`,
      errors: sql`COUNT(*) FILTER (WHERE status >= 400)`,
      error_rate: sql`COUNT(*) FILTER (WHERE status >= 400)::real / NULLIF(COUNT(*), 0)`,
      p95_duration: sql`PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration)`,
      p99_duration: sql`PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration)`,
    } as const;

    // The rollup groups paths into shapes and carries counts and a duration
    // sum, so it answers requests/errors/error_rate/avg exactly. Percentiles
    // need the distribution, which it does not keep.
    const useRollup = sortBy !== "p95_duration" && sortBy !== "p99_duration";

    const rollupOrderBy = {
      requests: sql`SUM(requests)`,
      errors: sql`SUM(errors)`,
      error_rate: sql`SUM(errors)::real / NULLIF(SUM(requests), 0)`,
    } as const;

    const rollupScope = sql`
      service_id = ${serviceId}
      AND bucket >= time_bucket(INTERVAL '15 minutes', now() - ${PERIOD_TO_DB_INTERVAL[period]}::interval)
      AND bucket <= time_bucket(INTERVAL '15 minutes', now())
      ${environment ? sql`AND environment = ${environment}` : sql``}
      ${method ? sql`AND method = ${method}` : sql``}
    `;

    // COUNT(*) OVER () counts the groups before LIMIT, giving the total in the
    // same round-trip.
    const result = useRollup
      ? await db.execute(sql`
          SELECT
            method,
            path_shape AS path,
            SUM(requests)::int AS requests,
            SUM(errors)::int AS errors,
            ROUND(COALESCE(SUM(duration_sum)::numeric / NULLIF(SUM(requests), 0), 0), 3)::real AS "avgDuration",
            NULL::real AS "p95Duration",
            NULL::real AS "p99Duration",
            COUNT(*) OVER ()::int AS total
          FROM service_endpoint_counts
          WHERE ${rollupScope}
          GROUP BY method, path_shape
          ORDER BY ${rollupOrderBy[sortBy]} DESC NULLS LAST
          LIMIT ${limit}
        `)
      : await db.execute(sql`
          SELECT
            method,
            regexp_replace(path, '/[0-9]+', '/:id', 'g') AS path,
            COUNT(*)::int AS requests,
            COUNT(*) FILTER (WHERE status >= 400)::int AS errors,
            ROUND(COALESCE(AVG(duration), 0)::numeric, 3)::real AS "avgDuration",
            ROUND(COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration), 0)::numeric, 3)::real AS "p95Duration",
            ROUND(COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration), 0)::numeric, 3)::real AS "p99Duration",
            COUNT(*) OVER ()::int AS total
          FROM log_event
          WHERE ${and(...conditions)}
          GROUP BY 1, 2
          ORDER BY ${orderByExprMap[sortBy]} DESC NULLS LAST
          LIMIT ${limit}
        `);

    const rows = result.rows as Array<{
      method: MethodType;
      path: string;
      requests: number;
      errors: number;
      avgDuration: number;
      p95Duration: number | null;
      p99Duration: number | null;
      total: number;
    }>;

    // errorRate is computed in TypeScript to avoid a second DB round-trip.
    // It is expressed as a percentage (0–100), consistent with the overview stats endpoint.
    return {
      total: rows[0]?.total ?? 0,
      endpoints: rows.map((row) => ({
        method: row.method,
        path: row.path,
        requests: row.requests,
        errors: row.errors,
        errorRate: row.requests > 0 ? (row.errors / row.requests) * 100 : 0,
        avgDuration: row.avgDuration,
        p95Duration: row.p95Duration,
        p99Duration: row.p99Duration,
      })),
    };
  }

  /**
   * Groups recurring errors by fingerprint (method, path, status, message).
   * Returns both the top groups and the distinct-group total before limit.
   */
  async getErrorGroups(
    filters: ErrorGroupFilters,
  ): Promise<ErrorGroupsResponse> {
    const {
      serviceId,
      period = "24h",
      from,
      to,
      environment,
      limit = 20,
      offset = 0,
    } = filters;

    const conditions = [
      eq(logEvent.serviceId, serviceId),
      gte(logEvent.status, 400),
    ];

    // Use DB-relative bounds for named periods, consistent with all other
    // period-filtered queries. Custom from/to ranges bind Date values directly.
    if (from && to) {
      conditions.push(gte(logEvent.timestamp, from));
      conditions.push(lte(logEvent.timestamp, to));
    } else {
      conditions.push(
        sql`${logEvent.timestamp} >= now() - ${PERIOD_TO_DB_INTERVAL[period]}::interval`,
      );
      conditions.push(sql`${logEvent.timestamp} <= now()`);
    }

    if (environment) conditions.push(eq(logEvent.environment, environment));

    const result = await db.execute(sql`
      SELECT
        method,
        path,
        status::int,
        message,
        COUNT(*)::int AS count,
        -- Convert naive timestamps to explicit UTC instants for client-safe parsing.
        MIN(timestamp AT TIME ZONE 'UTC') AS "firstSeen",
        MAX(timestamp AT TIME ZONE 'UTC') AS "lastSeen",
      -- COUNT(*) OVER() counts the number of rows in the full result set AFTER
      -- GROUP BY but BEFORE LIMIT, so we get the total group count for free
      -- without a separate COUNT subquery.
        COUNT(*) OVER()::int AS "totalGroups"
      FROM log_event
      WHERE ${and(...conditions)}
      GROUP BY method, path, status, message
      -- trailing columns are a tiebreaker: count alone leaves tied groups in an
      -- arbitrary order, so OFFSET paging could show one on two pages, or none
      ORDER BY count DESC, method, path, status, message
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    // Extract the total distinct group count from any row (it's the same on every row).
    let total =
      (result.rows[0] as { totalGroups?: number } | undefined)?.totalGroups ??
      0;

    // COUNT(*) OVER() rides along on a row, so it cannot report anything when
    // OFFSET lands past the end -- the page comes back empty and the total reads
    // as 0. Reuse the same conditions for a standalone count so `total` keeps
    // meaning the full group count for these filters on every request. Only
    // costs a second query on an already-empty page.
    if (total === 0 && offset > 0) {
      const countResult = await db.execute(sql`
        SELECT COUNT(*)::int AS "total" FROM (
          SELECT 1
          FROM log_event
          WHERE ${and(...conditions)}
          GROUP BY method, path, status, message
        ) grouped
      `);
      total =
        (countResult.rows[0] as { total?: number } | undefined)?.total ?? 0;
    }

    return {
      groups: (
        result.rows as Array<{
          method: MethodType;
          path: string;
          status: number;
          message: string | null;
          count: number;
          firstSeen: Date;
          lastSeen: Date;
          totalGroups: number;
        }>
      ).map(({ totalGroups: _totalGroups, ...row }) => ({
        method: row.method,
        path: row.path,
        status: row.status,
        message: row.message,
        count: row.count,
        firstSeen: row.firstSeen,
        lastSeen: row.lastSeen,
      })),
      total,
    };
  }

  /**
   * Lists the distinct `environment` values this service has logged, so the
   * dashboard can populate its environment filter from real data instead of
   * asking the user to type a name that has to match exactly. Bounded to the
   * retention window (30 days) on purpose.
   */
  async getServiceEnvironments(serviceId: string) {
    const result = await db.execute(sql`
      SELECT DISTINCT environment
      FROM log_event
      WHERE service_id = ${serviceId}
        AND timestamp > now() - interval '30 days'
      ORDER BY environment
    `);

    return (result.rows as Array<{ environment: string }>).map(
      (row) => row.environment,
    );
  }

  /**
   * Returns all log rows for a single request trace.
   * Ordered ascending to show request lifecycle from start to finish.
   */
  async getLogsByRequestId(serviceId: string, requestId: string) {
    return await db
      .select()
      .from(logEvent)
      .where(
        and(
          eq(logEvent.serviceId, serviceId),
          eq(logEvent.requestId, requestId),
        ),
      )
      // ascending order exposes the request lifecycle from start to finish
      .orderBy(asc(logEvent.timestamp), asc(logEvent.id))
      .limit(200);
  }
}
