import { describeRoute } from "hono-openapi";
import { z } from "zod";

import {
  ErrorGroupsResponseSchema,
  LogLevelBreakdownSchema,
  RequestTraceLogsResponseSchema,
  ServiceEnvironmentsResponseSchema,
  ServiceLogListSchema,
  ServiceLogSchema,
  ServiceOverviewStatsSchema,
  ServiceTimeseriesStatsSchema,
  SlowLogsResponseSchema,
  StatusCodeBreakdownSchema,
  TopEndpointsResponseSchema,
} from "@repo/db/validators/dashboard.validator";

import HttpStatusCodes from "@/lib/http-status-codes";
import {
  adminAuthMalformedExample,
  createAdminAuthErrorResponse,
  createErrorResponse,
  createGenericErrorResponse,
  createRateLimitErrorResponse,
  createServerErrorResponse,
  createSuccessResponse,
  createTimeoutErrorResponse,
  getErrDetailsFromErrFields,
} from "@/lib/openapi";
import { dashboardExamples } from "@/lib/openapi-examples";

const tags = ["Dashboard"];

export const getCacheStatsDoc = describeRoute({
  description:
    "Cache hit/stale/miss counters for this API process. Counters reset on restart.",
  tags,
  responses: {
    [HttpStatusCodes.OK]: createSuccessResponse("Cache stats retrieved", {
      details: "Cache stats retrieved successfully",
      dataSchema: z.object({
        hits: z.number(),
        stale: z.number(),
        misses: z.number(),
        refreshes: z.number(),
      }),
    }),
    [HttpStatusCodes.UNAUTHORIZED]: createAdminAuthErrorResponse(),
  },
});

export const getServiceEnvironmentsDoc = describeRoute({
  description:
    "List the distinct `environment` values this service has logged within the retention window",
  tags,
  responses: {
    [HttpStatusCodes.OK]: createSuccessResponse(
      "Service environments retrieved",
      {
        details: "Service environments retrieved successfully",
        dataSchema: ServiceEnvironmentsResponseSchema,
      },
    ),
    [HttpStatusCodes.BAD_REQUEST]: createErrorResponse("Invalid request data", {
      malformedAdminToken: adminAuthMalformedExample,
      invalidUUID: {
        summary: "Invalid service ID",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields({
          serviceId: "Invalid UUID",
        }),
        fields: {
          serviceId: "Invalid UUID",
        },
      },
    }),
    [HttpStatusCodes.NOT_FOUND]: createGenericErrorResponse(
      "Service not found",
      { code: "NOT_FOUND", details: "Service not found" },
    ),
    [HttpStatusCodes.UNAUTHORIZED]: createAdminAuthErrorResponse(),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: createRateLimitErrorResponse(),
    [HttpStatusCodes.GATEWAY_TIMEOUT]: createTimeoutErrorResponse(),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: createServerErrorResponse(),
  },
});

export const getServiceOverviewStatsDoc = describeRoute({
  description: "Get overview statistics for a service",
  tags,
  responses: {
    [HttpStatusCodes.OK]: createSuccessResponse(
      "Service overview statistics retrieved",
      {
        details: "Service overview statistics retrieved successfully",
        dataSchema: ServiceOverviewStatsSchema,
      },
    ),
    [HttpStatusCodes.BAD_REQUEST]: createErrorResponse("Invalid request data", {
      malformedAdminToken: adminAuthMalformedExample,
      invalidUUID: {
        summary: "Invalid service ID",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          dashboardExamples.serviceOverviewStatsValErrs.idErrors,
        ),
        fields: dashboardExamples.serviceOverviewStatsValErrs.idErrors,
      },
      validationError: {
        summary: "Invalid request data",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          dashboardExamples.serviceOverviewStatsValErrs.invalidData,
        ),
        fields: dashboardExamples.serviceOverviewStatsValErrs.invalidData,
      },
    }),
    [HttpStatusCodes.UNAUTHORIZED]: createAdminAuthErrorResponse(),
    [HttpStatusCodes.NOT_FOUND]: createGenericErrorResponse(
      "Service not found",
      {
        code: "NOT_FOUND",
        details: "Service not found",
      },
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: createRateLimitErrorResponse(),
    [HttpStatusCodes.GATEWAY_TIMEOUT]: createTimeoutErrorResponse(),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: createServerErrorResponse(),
  },
});

export const getServiceTimeseriesStatsDoc = describeRoute({
  description: "Get timeseries statistics for a service",
  tags,
  responses: {
    [HttpStatusCodes.OK]: createSuccessResponse(
      "Service timeseries statistics retrieved",
      {
        details: "Service timeseries statistics retrieved successfully",
        dataSchema: ServiceTimeseriesStatsSchema,
      },
    ),
    [HttpStatusCodes.BAD_REQUEST]: createErrorResponse("Invalid request data", {
      malformedAdminToken: adminAuthMalformedExample,
      invalidUUID: {
        summary: "Invalid service ID",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          dashboardExamples.serviceTimeseriestatsValErrs.idErrors,
        ),
        fields: dashboardExamples.serviceTimeseriestatsValErrs.idErrors,
      },
      validationError: {
        summary: "Invalid request data",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          dashboardExamples.serviceTimeseriestatsValErrs.invalidData,
        ),
        fields: dashboardExamples.serviceTimeseriestatsValErrs.invalidData,
      },
      invalidMetric: {
        summary: "Invalid metric",
        code: "INVALID_DATA",
        details: "Invalid metric requested",
      },
    }),
    [HttpStatusCodes.UNAUTHORIZED]: createAdminAuthErrorResponse(),
    [HttpStatusCodes.NOT_FOUND]: createGenericErrorResponse(
      "Service not found",
      {
        code: "NOT_FOUND",
        details: "Service not found",
      },
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: createRateLimitErrorResponse(),
    [HttpStatusCodes.GATEWAY_TIMEOUT]: createTimeoutErrorResponse(),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: createServerErrorResponse(),
  },
});

export const getServiceLogsDoc = describeRoute({
  description: "Get service logs",
  tags,
  responses: {
    [HttpStatusCodes.OK]: createSuccessResponse("Service logs retrieved", {
      details: "Service logs retrieved successfully",
      dataSchema: ServiceLogListSchema,
    }),
    [HttpStatusCodes.BAD_REQUEST]: createErrorResponse("Invalid request data", {
      malformedAdminToken: adminAuthMalformedExample,
      invalidUUID: {
        summary: "Invalid service ID",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          dashboardExamples.serviceLogsValErrs.idErrors,
        ),
        fields: dashboardExamples.serviceLogsValErrs.idErrors,
      },
      validationError: {
        summary: "Invalid request data",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          dashboardExamples.serviceLogsValErrs.invalidData,
        ),
        fields: dashboardExamples.serviceLogsValErrs.invalidData,
      },
      invalidCursor: {
        summary: "Invalid cursor",
        code: "INVALID_CURSOR",
        details: "Invalid pagination cursor",
      },
    }),
    [HttpStatusCodes.UNAUTHORIZED]: createAdminAuthErrorResponse(),
    [HttpStatusCodes.NOT_FOUND]: createGenericErrorResponse(
      "Service not found",
      {
        code: "NOT_FOUND",
        details: "Service not found",
      },
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: createRateLimitErrorResponse(),
    [HttpStatusCodes.GATEWAY_TIMEOUT]: createTimeoutErrorResponse(),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: createServerErrorResponse(),
  },
});

export const getSingleLogDoc = describeRoute({
  description: "Get details of a single log event",
  tags,
  responses: {
    [HttpStatusCodes.OK]: createSuccessResponse("Log event retrieved", {
      details: "Log event retrieved successfully",
      dataSchema: ServiceLogSchema,
    }),
    [HttpStatusCodes.BAD_REQUEST]: createErrorResponse("Invalid request data", {
      malformedAdminToken: adminAuthMalformedExample,
      invalidUUID: {
        summary: "Invalid service ID",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          dashboardExamples.singleServiceLogValErrs.idErrors,
        ),
        fields: dashboardExamples.singleServiceLogValErrs.idErrors,
      },
      validationError: {
        summary: "Invalid request data",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          dashboardExamples.singleServiceLogValErrs.invalidData,
        ),
        fields: dashboardExamples.singleServiceLogValErrs.invalidData,
      },
    }),
    [HttpStatusCodes.UNAUTHORIZED]: createAdminAuthErrorResponse(),
    [HttpStatusCodes.NOT_FOUND]: createErrorResponse("Service not found", {
      serviceNotFound: {
        summary: "Service not found",
        code: "NOT_FOUND",
        details: "Service not found",
      },
      logNotFound: {
        summary: "Log not found",
        code: "NOT_FOUND",
        details: "Log not found",
      },
    }),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: createRateLimitErrorResponse(),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: createServerErrorResponse(),
  },
});

export const getStatusCodeBreakdownDoc = describeRoute({
  description: "Get status code breakdown for a service",
  tags,
  responses: {
    [HttpStatusCodes.OK]: createSuccessResponse(
      "Status code breakdown retrieved",
      {
        details: "Status code breakdown retrieved successfully",
        dataSchema: StatusCodeBreakdownSchema,
      },
    ),
    [HttpStatusCodes.BAD_REQUEST]: createErrorResponse("Invalid request data", {
      malformedAdminToken: adminAuthMalformedExample,
      invalidUUID: {
        summary: "Invalid service ID",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          dashboardExamples.breakdownValErrs.idErrors,
        ),
        fields: dashboardExamples.breakdownValErrs.idErrors,
      },
      validationError: {
        summary: "Invalid request data",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          dashboardExamples.breakdownValErrs.invalidData,
        ),
        fields: dashboardExamples.breakdownValErrs.invalidData,
      },
    }),
    [HttpStatusCodes.UNAUTHORIZED]: createAdminAuthErrorResponse(),
    [HttpStatusCodes.NOT_FOUND]: createErrorResponse("Service not found", {
      serviceNotFound: {
        summary: "Service not found",
        code: "NOT_FOUND",
        details: "Service not found",
      },
    }),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: createRateLimitErrorResponse(),
    [HttpStatusCodes.GATEWAY_TIMEOUT]: createTimeoutErrorResponse(),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: createServerErrorResponse(),
  },
});

export const getLogLevelBreakdownDoc = describeRoute({
  description: "Get log level breakdown for a service",
  tags,
  responses: {
    [HttpStatusCodes.OK]: createSuccessResponse(
      "Log level breakdown retrieved",
      {
        details: "Log level breakdown retrieved successfully",
        dataSchema: LogLevelBreakdownSchema,
      },
    ),
    [HttpStatusCodes.BAD_REQUEST]: createErrorResponse("Invalid request data", {
      malformedAdminToken: adminAuthMalformedExample,
      invalidUUID: {
        summary: "Invalid service ID",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          dashboardExamples.breakdownValErrs.idErrors,
        ),
        fields: dashboardExamples.breakdownValErrs.idErrors,
      },
      validationError: {
        summary: "Invalid request data",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          dashboardExamples.breakdownValErrs.invalidData,
        ),
        fields: dashboardExamples.breakdownValErrs.invalidData,
      },
    }),
    [HttpStatusCodes.UNAUTHORIZED]: createAdminAuthErrorResponse(),
    [HttpStatusCodes.NOT_FOUND]: createErrorResponse("Service not found", {
      serviceNotFound: {
        summary: "Service not found",
        code: "NOT_FOUND",
        details: "Service not found",
      },
    }),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: createRateLimitErrorResponse(),
    [HttpStatusCodes.GATEWAY_TIMEOUT]: createTimeoutErrorResponse(),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: createServerErrorResponse(),
  },
});

export const getTopEndpointsDoc = describeRoute({
  description: "Rank unique (method, path) endpoints by a chosen metric",
  tags,
  responses: {
    [HttpStatusCodes.OK]: createSuccessResponse("Top endpoints retrieved", {
      details: "Top endpoints retrieved successfully",
      dataSchema: TopEndpointsResponseSchema,
    }),
    [HttpStatusCodes.BAD_REQUEST]: createErrorResponse("Invalid request data", {
      malformedAdminToken: adminAuthMalformedExample,
      invalidUUID: {
        summary: "Invalid service ID",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          dashboardExamples.topEndpointsValErrs.idErrors,
        ),
        fields: dashboardExamples.topEndpointsValErrs.idErrors,
      },
      validationError: {
        summary: "Invalid request data",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          dashboardExamples.topEndpointsValErrs.invalidData,
        ),
        fields: dashboardExamples.topEndpointsValErrs.invalidData,
      },
    }),
    [HttpStatusCodes.UNAUTHORIZED]: createAdminAuthErrorResponse(),
    [HttpStatusCodes.NOT_FOUND]: createGenericErrorResponse(
      "Service not found",
      { code: "NOT_FOUND", details: "Service not found" },
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: createRateLimitErrorResponse(),
    [HttpStatusCodes.GATEWAY_TIMEOUT]: createTimeoutErrorResponse(),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: createServerErrorResponse(),
  },
});

export const getErrorGroupsDoc = describeRoute({
  description:
    "Return recurring errors fingerprinted by (method, path, status, message), ordered by occurrence count. Paged via `limit`/`offset`; the response's `total` is the full group count for the filters, not the page length.",
  tags,
  responses: {
    [HttpStatusCodes.OK]: createSuccessResponse("Error groups retrieved", {
      details: "Error groups retrieved successfully",
      dataSchema: ErrorGroupsResponseSchema,
    }),
    [HttpStatusCodes.BAD_REQUEST]: createErrorResponse("Invalid request data", {
      malformedAdminToken: adminAuthMalformedExample,
      invalidUUID: {
        summary: "Invalid service ID",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          dashboardExamples.errorGroupsValErrs.idErrors,
        ),
        fields: dashboardExamples.errorGroupsValErrs.idErrors,
      },
      validationError: {
        summary: "Invalid request data",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          dashboardExamples.errorGroupsValErrs.invalidData,
        ),
        fields: dashboardExamples.errorGroupsValErrs.invalidData,
      },
    }),
    [HttpStatusCodes.UNAUTHORIZED]: createAdminAuthErrorResponse(),
    [HttpStatusCodes.NOT_FOUND]: createGenericErrorResponse(
      "Service not found",
      { code: "NOT_FOUND", details: "Service not found" },
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: createRateLimitErrorResponse(),
    [HttpStatusCodes.GATEWAY_TIMEOUT]: createTimeoutErrorResponse(),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: createServerErrorResponse(),
  },
});

export const getLogsByRequestIdDoc = describeRoute({
  description:
    "Fetch all log events that share the same requestId, ordered chronologically.",
  tags,
  responses: {
    [HttpStatusCodes.OK]: createSuccessResponse("Request logs retrieved", {
      details: "Request logs retrieved successfully",
      dataSchema: RequestTraceLogsResponseSchema,
    }),
    [HttpStatusCodes.BAD_REQUEST]: createErrorResponse("Invalid request data", {
      malformedAdminToken: adminAuthMalformedExample,
      invalidUUID: {
        summary: "Invalid service ID",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          dashboardExamples.requestLogsValErrs.idErrors,
        ),
        fields: dashboardExamples.requestLogsValErrs.idErrors,
      },
    }),
    [HttpStatusCodes.UNAUTHORIZED]: createAdminAuthErrorResponse(),
    [HttpStatusCodes.NOT_FOUND]: createErrorResponse("Not found", {
      serviceNotFound: {
        summary: "Service not found",
        code: "NOT_FOUND",
        details: "Service not found",
      },
      noLogs: {
        summary: "No logs found for this request ID",
        code: "NOT_FOUND",
        details: "No logs found for this request ID",
      },
    }),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: createRateLimitErrorResponse(),
    [HttpStatusCodes.GATEWAY_TIMEOUT]: createTimeoutErrorResponse(),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: createServerErrorResponse(),
  },
});

export const getSlowLogsDoc = describeRoute({
  description:
    "Paginated list of log events whose duration exceeds minDuration (default 1000 ms)",
  tags,
  responses: {
    [HttpStatusCodes.OK]: createSuccessResponse("Slow logs retrieved", {
      details: "Slow logs retrieved successfully",
      dataSchema: SlowLogsResponseSchema,
    }),
    [HttpStatusCodes.BAD_REQUEST]: createErrorResponse("Invalid request data", {
      malformedAdminToken: adminAuthMalformedExample,
      invalidUUID: {
        summary: "Invalid service ID",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          dashboardExamples.slowLogsValErrs.idErrors,
        ),
        fields: dashboardExamples.slowLogsValErrs.idErrors,
      },
      validationError: {
        summary: "Invalid request data",
        code: "INVALID_DATA",
        details: getErrDetailsFromErrFields(
          dashboardExamples.slowLogsValErrs.invalidData,
        ),
        fields: dashboardExamples.slowLogsValErrs.invalidData,
      },
      invalidCursor: {
        summary: "Invalid cursor",
        code: "INVALID_CURSOR",
        details: "Invalid pagination cursor",
      },
    }),
    [HttpStatusCodes.UNAUTHORIZED]: createAdminAuthErrorResponse(),
    [HttpStatusCodes.NOT_FOUND]: createGenericErrorResponse(
      "Service not found",
      { code: "NOT_FOUND", details: "Service not found" },
    ),
    [HttpStatusCodes.TOO_MANY_REQUESTS]: createRateLimitErrorResponse(),
    [HttpStatusCodes.GATEWAY_TIMEOUT]: createTimeoutErrorResponse(),
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: createServerErrorResponse(),
  },
});
