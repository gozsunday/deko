import { validator } from "hono-openapi";
import { HTTPException } from "hono/http-exception";
import { timeout } from "hono/timeout";
import { z } from "zod";

import {
  ErrorGroupQuerySchema,
  LogLevelBreakdownQuerySchema,
  LogsQuerySchema,
  ServiceOverviewQuerySchema,
  ServiceOverviewStats,
  ServiceTimeseriesQuerySchema,
  ServiceTimeseriesStats,
  SlowLogsQuerySchema,
  StatusBreakdownQuerySchema,
  TopEndpointsQuerySchema,
} from "@repo/db/validators/dashboard.validator";

import { createRouter } from "@/app";
import { getOrSetCache } from "@/lib/cache";
import HttpStatusCodes from "@/lib/http-status-codes";
import { errorResponse, successResponse } from "@/lib/utils";
import { validationHook } from "@/middleware/validation-hook";
import {
  DashboardRepository,
  type IDashboardRepository,
} from "@/repositories/dashboard.repository";
import {
  ServiceRepository,
  type IServiceRepository,
} from "@/repositories/service.repository";
import {
  getCountFromCache,
  getPrevPeriod,
  makeCountCacheKey,
  setCountInCache,
} from "@/services/dashboard.service";

import {
  getErrorGroupsDoc,
  getLogLevelBreakdownDoc,
  getLogsByRequestIdDoc,
  getServiceEnvironmentsDoc,
  getServiceLogsDoc,
  getServiceOverviewStatsDoc,
  getServiceTimeseriesStatsDoc,
  getSingleLogDoc,
  getSlowLogsDoc,
  getStatusCodeBreakdownDoc,
  getTopEndpointsDoc,
} from "./dashboard.docs";

const TIMEOUT_MS = 90_000;

const timeoutException = () =>
  new HTTPException(HttpStatusCodes.GATEWAY_TIMEOUT, {
    message: "Request timed out. Please try again later.",
  });

type DashboardRouteDeps = {
  dashboardRepository: IDashboardRepository;
  serviceRepository: IServiceRepository;
};

export const createDashboardRouter = ({
  dashboardRepository,
  serviceRepository,
}: DashboardRouteDeps) => {
  const dashboard = createRouter();

  // Apply timeout middleware to all dashboard routes
  dashboard.use("*", timeout(TIMEOUT_MS, timeoutException));

  // ---------------------------------------------------------------------------
  // OVERVIEW STATS
  // Produces KPI cards: total requests, error rate, and latency percentiles.
  // Compares current period against previous equal-length period for deltas.
  // ---------------------------------------------------------------------------
  dashboard.get(
    "/:serviceId/stats/overview",
    getServiceOverviewStatsDoc,
    validator("param", z.object({ serviceId: z.uuid() }), validationHook),
    validator("query", ServiceOverviewQuerySchema, validationHook),
    async (c) => {
      const { serviceId } = c.req.valid("param");
      const { period, environment } = c.req.valid("query");

      const service = await serviceRepository.getSingleService(serviceId);
      if (!service) {
        return c.json(
          errorResponse("NOT_FOUND", "Service not found"),
          HttpStatusCodes.NOT_FOUND,
        );
      }

      const cacheKey = `overview:${serviceId}:${period}:${environment ?? "all"}`;

      const response = await getOrSetCache(
        cacheKey,
        async () => {
          const serviceOverviewStats =
            await dashboardRepository.getServiceOverviewStats({
              serviceId,
              period,
              environment,
            });

          if (serviceOverviewStats.totalRequests === 0) {
            return null;
          }

          const prevPeriod = getPrevPeriod(period);
          const prevPeriodOverviewStats =
            await dashboardRepository.getServiceOverviewStats({
              serviceId,
              from: prevPeriod.from,
              to: prevPeriod.to,
              environment,
            });

          return {
            current: serviceOverviewStats,
            previous: prevPeriodOverviewStats,
          };
        },
        30,
      );

      const defaultOverviewStats: ServiceOverviewStats = {
        totalRequests: 0,
        errorCount: 0,
        errorRate: 0,
        avgDuration: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        period: {
          from: getPrevPeriod(period).to,
          to: new Date(),
        },
        comparison: {
          totalRequestsChange: null,
          errorRateChange: null,
          avgDurationChange: null,
        },
      };

      if (response === null) {
        return c.json(
          successResponse(
            defaultOverviewStats,
            "Service overview statistics retrieved successfully",
          ),
          HttpStatusCodes.OK,
        );
      }

      const { current, previous } = response;

      const finalResponse: ServiceOverviewStats = {
        ...current,
        period: {
          from: current.period.from,
          to: current.period.to,
        },
        comparison: {
          totalRequestsChange:
            previous.totalRequests > 0
              ? ((current.totalRequests - previous.totalRequests) /
                  previous.totalRequests) *
                100
              : null,
          errorRateChange:
            previous.errorRate > 0
              ? ((current.errorRate - previous.errorRate) /
                  previous.errorRate) *
                100
              : null,
          avgDurationChange:
            previous.avgDuration > 0
              ? ((current.avgDuration - previous.avgDuration) /
                  previous.avgDuration) *
                100
              : null,
        },
      };

      return c.json(
        successResponse(
          finalResponse,
          "Service overview statistics retrieved successfully",
        ),
        HttpStatusCodes.OK,
      );
    },
  );

  // ---------------------------------------------------------------------------
  // TIMESERIES STATS
  // Returns bucketed metrics for charting trends over time.
  // Supports metric projection and dimension filters (environment, method, path, level).
  // ---------------------------------------------------------------------------
  dashboard.get(
    "/:serviceId/stats/timeseries",
    getServiceTimeseriesStatsDoc,
    validator("param", z.object({ serviceId: z.uuid() }), validationHook),
    validator(
      "query",
      ServiceTimeseriesQuerySchema.extend({
        metrics: z
          .string()
          .default(
            "requests,errors,avg_duration,p50_duration,p95_duration,p99_duration",
          )
          .describe(
            "Comma separated list of metrics to retrieve. Valid values: requests, errors, avg_duration, p50_duration, p95_duration, p99_duration",
          ),
      }),
      validationHook,
    ),
    async (c) => {
      const { serviceId } = c.req.valid("param");
      const { period, granularity, metrics, environment, method, path, level } =
        c.req.valid("query");

      const service = await serviceRepository.getSingleService(serviceId);
      if (!service) {
        return c.json(
          errorResponse("NOT_FOUND", "Service not found"),
          HttpStatusCodes.NOT_FOUND,
        );
      }

      // if there's no valid metrics, return an error
      const metricsArray = metrics.split(",");
      if (
        !metricsArray.includes("requests") &&
        !metricsArray.includes("errors") &&
        !metricsArray.includes("avg_duration") &&
        !metricsArray.includes("p50_duration") &&
        !metricsArray.includes("p95_duration") &&
        !metricsArray.includes("p99_duration")
      ) {
        return c.json(
          errorResponse("INVALID_DATA", "Invalid metric requested"),
          HttpStatusCodes.BAD_REQUEST,
        );
      }

      const timeseriesCacheKey = `timeseries:${serviceId}:${period}:${granularity}:${environment ?? "all"}:${method ?? "all"}:${path ?? "all"}:${level ?? "all"}`;

      const serviceTimeseries = await getOrSetCache(
        timeseriesCacheKey,
        async () =>
          dashboardRepository.getLogTimeseries({
            serviceId,
            period,
            granularity,
            environment,
            method,
            path,
            level,
          }),
        180,
      );

      const serviceTimeseriesStats: ServiceTimeseriesStats = {
        granularity: serviceTimeseries.granularity,
        buckets: serviceTimeseries.buckets.map((bucket) => ({
          timestamp: bucket.bucket,
          requests: metricsArray.includes("requests")
            ? bucket.requests
            : undefined,
          errors: metricsArray.includes("errors") ? bucket.errors : undefined,
          avgDuration: metricsArray.includes("avg_duration")
            ? bucket.avg_duration
            : undefined,
          p50Duration: metricsArray.includes("p50_duration")
            ? bucket.p50_duration
            : undefined,
          p95Duration: metricsArray.includes("p95_duration")
            ? bucket.p95_duration
            : undefined,
          p99Duration: metricsArray.includes("p99_duration")
            ? bucket.p99_duration
            : undefined,
        })),
      };

      return c.json(
        successResponse(
          serviceTimeseriesStats,
          "Service timeseries statistics retrieved successfully",
        ),
        HttpStatusCodes.OK,
      );
    },
  );

  // ---------------------------------------------------------------------------
  // SERVICE LOGS
  // Main paginated log feed with rich filtering and cursor-based pagination.
  // Optionally computes exact filtered totals with in-memory cache for performance.
  // Redacts sensitive fields (ipHash, userAgent) before response.
  // ---------------------------------------------------------------------------
  dashboard.get(
    "/:serviceId/logs",
    getServiceLogsDoc,
    validator("param", z.object({ serviceId: z.uuid() }), validationHook),
    validator("query", LogsQuerySchema, validationHook),
    async (c) => {
      const { serviceId } = c.req.valid("param");
      const {
        period,
        level,
        status,
        environment,
        method,
        path,
        to,
        from,
        search,
        cursor,
        limit,
        exactCount,
      } = c.req.valid("query");

      // ensure the service exists
      const service = await serviceRepository.getSingleService(serviceId);
      if (!service) {
        return c.json(
          errorResponse("NOT_FOUND", "Service not found"),
          HttpStatusCodes.NOT_FOUND,
        );
      }

      let cursorTimestamp: number | undefined;
      let cursorId: string | undefined;

      // Decode cursor if present
      if (cursor) {
        try {
          // handle potential space vs plus issue in base64 from URL
          const normalizedCursor = cursor.replace(/ /g, "+");
          const decoded = Buffer.from(normalizedCursor, "base64").toString(
            "utf-8",
          );
          const [timestampStr, idStr] = decoded.split(":");
          if (!timestampStr || !idStr) {
            throw new Error("Invalid cursor format");
          }

          const timestamp = parseInt(timestampStr);
          if (isNaN(timestamp) || !z.uuid().safeParse(idStr).success) {
            throw new Error("Invalid cursor values");
          }

          cursorTimestamp = timestamp;
          cursorId = idStr;
        } catch (err) {
          // Reject invalid cursors explicitly
          console.error("Failed to decode cursor:", cursor, err);
          return c.json(
            errorResponse("INVALID_CURSOR", "Invalid pagination cursor"),
            HttpStatusCodes.BAD_REQUEST,
          );
        }
      }

      const logs = await dashboardRepository.getServiceLogs({
        serviceId,
        period,
        level,
        status,
        environment,
        method,
        path,
        to,
        from,
        search,
        limit,
        cursor:
          cursorTimestamp && cursorId
            ? {
                timestamp: new Date(cursorTimestamp),
                id: cursorId,
              }
            : undefined,
      });

      // generate next cursor
      let nextCursor: string | null = null;
      if (logs.length === limit) {
        const lastLog = logs[logs.length - 1];
        const cursorStr = `${lastLog.timestamp.getTime()}:${lastLog.id}`;
        nextCursor = Buffer.from(cursorStr).toString("base64");
      }

      // totalEstimate defaults to null and is only computed when exactCount=true
      let totalEstimate: number | null = null;

      if (exactCount) {
        const cacheKey = makeCountCacheKey({
          serviceId,
          period,
          level,
          status,
          environment,
          method,
          path,
          to,
          from,
          search,
        });

        const cached = await getCountFromCache(cacheKey);

        if (cached !== null) {
          // if cached data exist, serve to reduce repeated count load
          totalEstimate = cached;
        } else {
          // if there's no cached data, fetch & serve fresh data
          totalEstimate = await dashboardRepository.getServiceLogsCount({
            serviceId,
            period,
            level,
            status,
            environment,
            method,
            path,
            to,
            from,
            search,
          });

          await setCountInCache(cacheKey, totalEstimate);
        }
      }

      const logList = {
        logs,
        pagination: {
          hasNext: logs.length === limit,
          nextCursor,
          totalEstimate,
        },
      };

      return c.json(
        successResponse(logList, "Service logs retrieved successfully"),
        HttpStatusCodes.OK,
      );
    },
  );

  // ---------------------------------------------------------------------------
  // LOGS BY REQUEST ID
  // Returns all log events for a given request ID, ordered chronologically.
  // Enables full request trace reconstruction. Must be defined before
  // /:serviceId/logs/:logId to prevent route collision.
  // ---------------------------------------------------------------------------
  dashboard.get(
    "/:serviceId/logs/by-request/:requestId",
    getLogsByRequestIdDoc,
    validator(
      "param",
      z.object({ serviceId: z.uuid(), requestId: z.string().min(1) }),
      validationHook,
    ),
    async (c) => {
      const { serviceId, requestId } = c.req.valid("param");

      const service = await serviceRepository.getSingleService(serviceId);
      if (!service) {
        return c.json(
          errorResponse("NOT_FOUND", "Service not found"),
          HttpStatusCodes.NOT_FOUND,
        );
      }

      // Strip ipHash and userAgent from each row
      const rawLogs = await dashboardRepository.getLogsByRequestId(
        serviceId,
        requestId,
      );
      const logs = rawLogs.map(
        ({ ipHash: _ih, userAgent: _ua, ...log }) => log,
      );

      if (logs.length === 0) {
        return c.json(
          errorResponse("NOT_FOUND", "No logs found for this request ID"),
          HttpStatusCodes.NOT_FOUND,
        );
      }

      return c.json(
        successResponse(
          { requestId, logs, count: logs.length },
          "Request logs retrieved successfully",
        ),
        HttpStatusCodes.OK,
      );
    },
  );

  // ---------------------------------------------------------------------------
  // SLOW LOGS
  // Convenience wrapper around /logs with pre-applied duration filter (default 1000ms).
  // Echoes back the effective threshold so clients know which cutoff was applied.
  // ---------------------------------------------------------------------------
  dashboard.get(
    "/:serviceId/logs/slow",
    getSlowLogsDoc,
    validator("param", z.object({ serviceId: z.uuid() }), validationHook),
    validator("query", SlowLogsQuerySchema, validationHook),
    async (c) => {
      const { serviceId } = c.req.valid("param");
      const {
        period,
        minDuration,
        level,
        status,
        environment,
        method,
        path,
        to,
        from,
        search,
        cursor,
        limit,
        exactCount,
      } = c.req.valid("query");

      const service = await serviceRepository.getSingleService(serviceId);
      if (!service) {
        return c.json(
          errorResponse("NOT_FOUND", "Service not found"),
          HttpStatusCodes.NOT_FOUND,
        );
      }

      // Decode cursor
      let cursorTimestamp: number | undefined;
      let cursorId: string | undefined;

      if (cursor) {
        try {
          const normalizedCursor = cursor.replace(/ /g, "+");
          const decoded = Buffer.from(normalizedCursor, "base64").toString(
            "utf-8",
          );
          const [timestampStr, idStr] = decoded.split(":");
          if (!timestampStr || !idStr) throw new Error("Invalid cursor format");

          const timestamp = parseInt(timestampStr);
          if (isNaN(timestamp) || !z.uuid().safeParse(idStr).success) {
            throw new Error("Invalid cursor values");
          }

          cursorTimestamp = timestamp;
          cursorId = idStr;
        } catch {
          return c.json(
            errorResponse("INVALID_CURSOR", "Invalid pagination cursor"),
            HttpStatusCodes.BAD_REQUEST,
          );
        }
      }

      const logs = await dashboardRepository.getServiceLogs({
        serviceId,
        period,
        level,
        status,
        environment,
        method,
        path,
        to,
        from,
        search,
        limit,
        minDuration,
        cursor:
          cursorTimestamp && cursorId
            ? { timestamp: new Date(cursorTimestamp), id: cursorId }
            : undefined,
      });

      // Generate next cursor
      let nextCursor: string | null = null;
      if (logs.length === limit) {
        const lastLog = logs[logs.length - 1];
        nextCursor = Buffer.from(
          `${lastLog.timestamp.getTime()}:${lastLog.id}`,
        ).toString("base64");
      }

      // Optional exact count
      let totalEstimate: number | null = null;
      if (exactCount) {
        const cacheKey = makeCountCacheKey({
          serviceId,
          period,
          level,
          status,
          environment,
          method,
          path,
          to,
          from,
          search,
          minDuration,
        });

        const cached = await getCountFromCache(cacheKey);

        if (cached !== null) {
          totalEstimate = cached;
        } else {
          totalEstimate = await dashboardRepository.getServiceLogsCount({
            serviceId,
            period,
            level,
            status,
            environment,
            method,
            path,
            to,
            from,
            search,
            minDuration,
          });
          await setCountInCache(cacheKey, totalEstimate);
        }
      }

      return c.json(
        successResponse(
          {
            logs,
            pagination: {
              hasNext: logs.length === limit,
              nextCursor,
              totalEstimate,
            },
            // echo the threshold so the client knows what "slow" meant for this request
            thresholdMs: minDuration,
          },
          "Slow logs retrieved successfully",
        ),
        HttpStatusCodes.OK,
      );
    },
  );

  // ---------------------------------------------------------------------------
  // SINGLE LOG
  // Returns details of one log record for drill-down interactions.
  // Requires both logId and timestamp for selective hypertable lookup.
  // ---------------------------------------------------------------------------
  dashboard.get(
    "/:serviceId/logs/:logId",
    getSingleLogDoc,
    validator(
      "param",
      z.object({ serviceId: z.uuid(), logId: z.uuid() }),
      validationHook,
    ),
    validator(
      "query",
      z.object({
        timestamp: z.iso.datetime().transform((n) => new Date(n)),
      }),
      validationHook,
    ),
    async (c) => {
      const { serviceId, logId } = c.req.valid("param");
      const { timestamp } = c.req.valid("query");

      const service = await serviceRepository.getSingleService(serviceId);
      if (!service) {
        return c.json(
          errorResponse("NOT_FOUND", "Service not found"),
          HttpStatusCodes.NOT_FOUND,
        );
      }

      const log = await dashboardRepository.getSingleLog(
        serviceId,
        logId,
        new Date(timestamp),
      );
      if (!log) {
        return c.json(
          errorResponse("NOT_FOUND", "Log not found"),
          HttpStatusCodes.NOT_FOUND,
        );
      }

      return c.json(
        successResponse(
          {
            ...log,
            timestamp: log.timestamp,
            receivedAt: log.receivedAt,
          },
          "Log retrieved successfully",
        ),
        HttpStatusCodes.OK,
      );
    },
  );

  // ---------------------------------------------------------------------------
  // SERVICE ENVIRONMENTS
  // Distinct `environment` values this service has logged, so the dashboard can
  // populate its environment filter from real data.
  // ---------------------------------------------------------------------------
  dashboard.get(
    "/:serviceId/environments",
    getServiceEnvironmentsDoc,
    validator("param", z.object({ serviceId: z.uuid() }), validationHook),
    async (c) => {
      const { serviceId } = c.req.valid("param");

      const service = await serviceRepository.getSingleService(serviceId);
      if (!service) {
        return c.json(
          errorResponse("NOT_FOUND", "Service not found"),
          HttpStatusCodes.NOT_FOUND,
        );
      }

      // cached because environments change rarely, so a new deployment target
      // shows up within minutes of its first event
      const environments = await getOrSetCache(
        `environments:${serviceId}`,
        () => dashboardRepository.getServiceEnvironments(serviceId),
        300,
      );

      return c.json(
        successResponse(
          { environments },
          "Service environments retrieved successfully",
        ),
        HttpStatusCodes.OK,
      );
    },
  );

  // ---------------------------------------------------------------------------
  // STATUS BREAKDOWN
  // Returns status distribution for charting as codes or grouped categories (2xx/3xx/4xx/5xx).
  // ---------------------------------------------------------------------------
  dashboard.get(
    "/:serviceId/stats/status-breakdown",
    getStatusCodeBreakdownDoc,
    validator("param", z.object({ serviceId: z.uuid() }), validationHook),
    validator("query", StatusBreakdownQuerySchema, validationHook),
    async (c) => {
      const { serviceId } = c.req.valid("param");
      const { period, environment, groupBy } = c.req.valid("query");

      const service = await serviceRepository.getSingleService(serviceId);
      if (!service) {
        return c.json(
          errorResponse("NOT_FOUND", "Service not found"),
          HttpStatusCodes.NOT_FOUND,
        );
      }

      const statusCacheKey = `status-breakdown:${serviceId}:${period}:${groupBy}:${environment ?? "all"}`;

      const breakdown = await getOrSetCache(
        statusCacheKey,
        async () =>
          dashboardRepository.getStatusCodeBreakdown({
            serviceId,
            period,
            groupBy,
            environment,
          }),
        120,
      );

      return c.json(
        successResponse(
          breakdown,
          "Status code breakdown retrieved successfully",
        ),
        HttpStatusCodes.OK,
      );
    },
  );

  // ---------------------------------------------------------------------------
  // LOG LEVEL BREAKDOWN
  // Shows severity distribution (debug/info/warn/error) for alerting and
  // operational health trend monitoring.
  // ---------------------------------------------------------------------------
  dashboard.get(
    "/:serviceId/stats/log-level-breakdown",
    getLogLevelBreakdownDoc,
    validator("param", z.object({ serviceId: z.uuid() }), validationHook),
    validator("query", LogLevelBreakdownQuerySchema, validationHook),
    async (c) => {
      const { serviceId } = c.req.valid("param");
      const { period, environment } = c.req.valid("query");

      const service = await serviceRepository.getSingleService(serviceId);
      if (!service) {
        return c.json(
          errorResponse("NOT_FOUND", "Service not found"),
          HttpStatusCodes.NOT_FOUND,
        );
      }

      const levelCacheKey = `level-breakdown:${serviceId}:${period}:${environment ?? "all"}`;

      const breakdown = await getOrSetCache(
        levelCacheKey,
        async () =>
          dashboardRepository.getLogLevelBreakdown({
            serviceId,
            period,
            environment,
          }),
        120,
      );

      return c.json(
        successResponse(
          breakdown,
          "Log level breakdown retrieved successfully",
        ),
        HttpStatusCodes.OK,
      );
    },
  );

  // ---------------------------------------------------------------------------
  // TOP ENDPOINTS
  // Ranks unique (method, path) pairs by a chosen metric.
  // Surfaces hotspots for traffic, errors, error rate, or latency analysis.
  // ---------------------------------------------------------------------------
  dashboard.get(
    "/:serviceId/stats/top-endpoints",
    getTopEndpointsDoc,
    validator("param", z.object({ serviceId: z.uuid() }), validationHook),
    validator(
      "query",
      TopEndpointsQuerySchema.extend({
        limit: z.coerce.number().min(1).max(50).default(10),
      }),
      validationHook,
    ),
    async (c) => {
      const { serviceId } = c.req.valid("param");
      const { period, sortBy, environment, method, limit } =
        c.req.valid("query");

      const service = await serviceRepository.getSingleService(serviceId);
      if (!service) {
        return c.json(
          errorResponse("NOT_FOUND", "Service not found"),
          HttpStatusCodes.NOT_FOUND,
        );
      }

      const endpointsCacheKey = `top-endpoints:${serviceId}:${period}:${sortBy}:${environment ?? "all"}:${method ?? "all"}:${limit}`;

      const endpoints = await getOrSetCache(
        endpointsCacheKey,
        async () =>
          dashboardRepository.getTopEndpoints({
            serviceId,
            period,
            sortBy,
            environment,
            method,
            limit,
          }),
        180,
      );

      return c.json(
        successResponse(
          { endpoints, sortBy },
          "Top endpoints retrieved successfully",
        ),
        HttpStatusCodes.OK,
      );
    },
  );

  // ---------------------------------------------------------------------------
  // ERROR GROUPS
  // Fingerprints recurring errors by (method, path, status, message).
  // Aggregates identical error patterns to show recurring issues clearly.
  // ---------------------------------------------------------------------------
  dashboard.get(
    "/:serviceId/errors/groups",
    getErrorGroupsDoc,
    validator("param", z.object({ serviceId: z.uuid() }), validationHook),
    validator(
      "query",
      ErrorGroupQuerySchema.extend({
        limit: z.coerce.number().min(1).max(100).default(20),
      }),
      validationHook,
    ),
    async (c) => {
      const { serviceId } = c.req.valid("param");
      const { period, environment, limit } = c.req.valid("query");

      const service = await serviceRepository.getSingleService(serviceId);
      if (!service) {
        return c.json(
          errorResponse("NOT_FOUND", "Service not found"),
          HttpStatusCodes.NOT_FOUND,
        );
      }

      const errorGroupsCacheKey = `error-groups:${serviceId}:${period}:${environment ?? "all"}:${limit}`;

      const result = await getOrSetCache(
        errorGroupsCacheKey,
        async () =>
          dashboardRepository.getErrorGroups({
            serviceId,
            period,
            environment,
            limit,
          }),
        120,
      );

      return c.json(
        successResponse(result, "Error groups retrieved successfully"),
        HttpStatusCodes.OK,
      );
    },
  );

  return dashboard;
};

const dashboard = createDashboardRouter({
  dashboardRepository: new DashboardRepository(),
  serviceRepository: new ServiceRepository(),
});

export default dashboard;
