import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

import { levelEnum, logEvent, methodEnum } from "../schemas/event.schema";

export const LevelEnumSchema = createSelectSchema(levelEnum);
export const MethodEnumSchema = createSelectSchema(methodEnum);
export const PeriodEnumSchema = z.enum(["1h", "24h", "7d"]);
export const GranularityEnumSchema = z.enum([
  "minute",
  "15minute",
  "hour",
  "2hour",
  "day",
]);
export const TopEndpointSortBySchema = z.enum([
  "requests",
  "errors",
  "error_rate",
  "p95_duration",
  "p99_duration",
]);

export const ServiceOverviewQuerySchema = z.object({
  period: PeriodEnumSchema.default("24h"),
  environment: z.string().optional(),
});

export const ServiceOverviewStatsSchema = z.object({
  totalRequests: z.number(),
  errorCount: z.number(),
  errorRate: z.number(),
  avgDuration: z.number(),
  p50Duration: z.number(),
  p95Duration: z.number(),
  p99Duration: z.number(),
  period: z.object({
    // Use strict ISO parsing for API contract fields so OpenAPI/Scalar stays accurate.
    from: z.iso.datetime().transform((n) => new Date(n)),
    to: z.iso.datetime().transform((n) => new Date(n)),
  }),
  comparison: z.object({
    totalRequestsChange: z.number().nullable(),
    errorRateChange: z.number().nullable(),
    avgDurationChange: z.number().nullable(),
  }),
});

export const ServiceTimeseriesQuerySchema = z.object({
  period: PeriodEnumSchema.default("24h"),
  granularity: GranularityEnumSchema.optional(),
  metrics: z.string().optional(),
  environment: z.string().optional(),
  method: MethodEnumSchema.optional(),
  path: z.string().optional(),
  level: LevelEnumSchema.optional(),
});

export const ServiceTimeseriesStatsSchema = z.object({
  granularity: GranularityEnumSchema,
  buckets: z.array(
    z.object({
      // Buckets come from raw DB aggregations and can arrive as Date or datetime-like strings.
      // Coercion keeps parsing resilient across drivers/runtime serialization paths.
      timestamp: z.coerce.date(),
      requests: z.number().optional(),
      errors: z.number().optional(),
      avgDuration: z.number().optional(),
      p50Duration: z.number().optional(),
      p95Duration: z.number().optional(),
      p99Duration: z.number().optional(),
    }),
  ),
});

const LogEventResponseSchema = createSelectSchema(logEvent).extend({
  // Log rows are documented API response fields; keep strict ISO validation for docs and clients.
  timestamp: z.iso.datetime().transform((n) => new Date(n)),
  receivedAt: z.iso.datetime().transform((n) => new Date(n)),
});

export const ServiceLogListSchema = z.object({
  logs: z.array(LogEventResponseSchema),
  pagination: z.object({
    hasNext: z.boolean(),
    nextCursor: z.string().nullable(),
    totalEstimate: z.number().nullable(),
  }),
});

export const ServiceLogSchema = LogEventResponseSchema;

/**
 * The distinct `environment` values a service has logged within the retention
 * window. Backs the environment filter in the dashboard, so the UI can offer a
 * fixed set of options instead of a free-text field.
 *
 * A free-text field would be a silent-failure trap: an unrecognised value simply
 * matches no rows, so a typo renders every chart as "no data" with no error.
 */
export const ServiceEnvironmentsResponseSchema = z.object({
  environments: z.array(z.string()),
});

export const StatusBreakdownQuerySchema = z.object({
  period: PeriodEnumSchema.default("24h"),
  environment: z.string().optional(),
  groupBy: z.enum(["category", "code"]).default("category"),
});

export const StatusCodeBreakdownSchema = z.object({
  breakdown: z.array(
    z.union([
      z.object({
        status: z.number(),
        count: z.number(),
        percentage: z.number(),
      }),
      z.object({
        category: z.string(),
        label: z.string(),
        count: z.number(),
        percentage: z.number(),
      }),
    ]),
  ),
  total: z.number(),
});

export const LogLevelBreakdownQuerySchema = z.object({
  period: PeriodEnumSchema.default("24h"),
  environment: z.string().optional(),
});

export const LogLevelBreakdownSchema = z.object({
  breakdown: z.array(
    z.object({
      level: LevelEnumSchema,
      count: z.number(),
      percentage: z.number(),
    }),
  ),
  total: z.number(),
});

export const TopEndpointsQuerySchema = z.object({
  period: PeriodEnumSchema.default("24h"),
  sortBy: TopEndpointSortBySchema.default("requests"),
  environment: z.string().optional(),
  method: MethodEnumSchema.optional(),
  limit: z.number().min(1).max(50).default(10),
});

export const TopEndpointSchema = z.object({
  method: MethodEnumSchema,
  path: z.string(),
  requests: z.number(),
  errors: z.number(),
  errorRate: z.number(),
  avgDuration: z.number(),
  p95Duration: z.number(),
  p99Duration: z.number(),
});

export const TopEndpointsResponseSchema = z.object({
  endpoints: z.array(TopEndpointSchema),
  sortBy: TopEndpointSortBySchema,
});

export const ErrorGroupQuerySchema = z.object({
  period: PeriodEnumSchema.default("24h"),
  environment: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

export const ErrorGroupSchema = z.object({
  method: MethodEnumSchema,
  path: z.string(),
  status: z.number(),
  message: z.string().nullable(),
  count: z.number(),
  // firstSeen/lastSeen are DB aggregate outputs (MIN/MAX), so coerce for compatibility.
  firstSeen: z.coerce.date(),
  lastSeen: z.coerce.date(),
});

export const ErrorGroupsResponseSchema = z.object({
  groups: z.array(ErrorGroupSchema),
  total: z.number(),
});

export const LogsQuerySchema = z.object({
  period: PeriodEnumSchema.default("24h"),
  level: LevelEnumSchema.optional(),
  status: z.coerce.number().optional(),
  environment: z.string().optional(),
  method: MethodEnumSchema.optional(),
  path: z.string().optional(),
  // Query params are user input; enforce ISO 8601 here to avoid ambiguous date parsing.
  to: z.iso
    .datetime()
    .transform((n) => new Date(n))
    .optional(),
  from: z.iso
    .datetime()
    .transform((n) => new Date(n))
    .optional(),
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  // exactCount is opt-in because exact counts can be expensive on large datasets
  exactCount: z.coerce.boolean().default(false),
});

export const RequestTraceLogsResponseSchema = z.object({
  requestId: z.string(),
  logs: z.array(
    z.object({
      id: z.uuid(),
      serviceId: z.uuid(),
      timestamp: z.iso.datetime().transform((n) => new Date(n)),
      level: LevelEnumSchema,
      method: MethodEnumSchema,
      path: z.string(),
      status: z.number(),
      duration: z.number(),
      environment: z.string(),
      requestId: z.string(),
      message: z.string().nullable(),
      sessionId: z.string().nullable(),
    }),
  ),
  count: z.number(),
});

export const SlowLogsQuerySchema = LogsQuerySchema.extend({
  minDuration: z.coerce.number().min(1).default(1000),
});

export const SlowLogsResponseSchema = z.object({
  logs: z.array(LogEventResponseSchema),
  pagination: z.object({
    hasNext: z.boolean(),
    nextCursor: z.string().nullable(),
    totalEstimate: z.number().nullable(),
  }),
  thresholdMs: z.number(),
});

export type LevelType = z.infer<typeof LevelEnumSchema>;
export type MethodType = z.infer<typeof MethodEnumSchema>;
export type PeriodType = z.infer<typeof PeriodEnumSchema>;
export type GranularityType = z.infer<typeof GranularityEnumSchema>;
export type ServiceOverviewStats = z.infer<typeof ServiceOverviewStatsSchema>;
export type ServiceTimeseriesStats = z.infer<
  typeof ServiceTimeseriesStatsSchema
>;
export type ServiceLogList = z.infer<typeof ServiceLogListSchema>;
export type ServiceLog = z.infer<typeof ServiceLogSchema>;
export type StatusCodeBreakdown = z.infer<typeof StatusCodeBreakdownSchema>;
export type LogLevelBreakdown = z.infer<typeof LogLevelBreakdownSchema>;
export type TopEndpointSortBy = z.infer<typeof TopEndpointSortBySchema>;
export type TopEndpoint = z.infer<typeof TopEndpointSchema>;
export type TopEndpointsResponse = z.infer<typeof TopEndpointsResponseSchema>;
export type ErrorGroup = z.infer<typeof ErrorGroupSchema>;
export type ErrorGroupsResponse = z.infer<typeof ErrorGroupsResponseSchema>;
export type RequestLogsResponse = z.infer<
  typeof RequestTraceLogsResponseSchema
>;
export type SlowLogsResponse = z.infer<typeof SlowLogsResponseSchema>;
