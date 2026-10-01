import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  ErrorGroupQuerySchema,
  ErrorGroupsResponseSchema,
  LogLevelBreakdownQuerySchema,
  LogLevelBreakdownSchema,
  LogsQuerySchema,
  ServiceEnvironmentsResponseSchema,
  ServiceLogListSchema,
  ServiceLogSchema,
  ServiceOverviewQuerySchema,
  ServiceOverviewStatsSchema,
  ServiceTimeseriesQuerySchema,
  ServiceTimeseriesStatsSchema,
  SlowLogsQuerySchema,
  SlowLogsResponseSchema,
  StatusBreakdownQuerySchema,
  StatusCodeBreakdownSchema,
  TopEndpointsQuerySchema,
  TopEndpointsResponseSchema,
} from "@repo/db/validators/dashboard.validator";

import { $fetchAndThrow } from "@/lib/fetch";
import { queryKeys } from "@/lib/query-keys";
import { successResSchema } from "@/lib/schemas";

// ————— get service logs ———————————————————
export const $getServiceLogs = createServerFn()
  .inputValidator(
    LogsQuerySchema.extend({
      serviceId: z.uuid(),
    }).omit({
      to: true,
      from: true,
    }),
  )
  .handler(async ({ data }) => {
    const { serviceId, ...filters } = data;

    const res = await $fetchAndThrow(`/dashboard/:serviceId/logs`, {
      params: { serviceId },
      query: filters,
      output: successResSchema(ServiceLogListSchema),
    });

    return res.data;
  });

// ————— get slow logs ———————————————————
export const $getSlowLogs = createServerFn()
  .inputValidator(
    SlowLogsQuerySchema.extend({
      serviceId: z.uuid(),
    }).omit({
      to: true,
      from: true,
    }),
  )
  .handler(async ({ data }) => {
    const { serviceId, ...filters } = data;

    const res = await $fetchAndThrow(`/dashboard/:serviceId/logs/slow`, {
      params: { serviceId },
      query: filters,
      output: successResSchema(SlowLogsResponseSchema),
    });

    return res.data;
  });

// ————— get single log ———————————————————
export const $getSingleLog = createServerFn()
  .inputValidator(
    z.object({
      serviceId: z.uuid(),
      logId: z.uuid(),
      timestamp: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const { serviceId, logId, timestamp } = data;

    const res = await $fetchAndThrow(`/dashboard/:serviceId/logs/:logId`, {
      params: { serviceId, logId },
      query: { timestamp },
      output: successResSchema(ServiceLogSchema),
    });

    return res.data;
  });
// get single log query options
export const singleLogQueryOptions = (
  serviceId: string,
  logId: string,
  timestamp: string,
) =>
  queryOptions({
    queryKey: queryKeys.singleLog(serviceId, logId),
    queryFn: () => $getSingleLog({ data: { serviceId, logId, timestamp } }),
  });

// ————— get overview stats ———————————————————
export const $getOverviewStats = createServerFn()
  .inputValidator(ServiceOverviewQuerySchema.extend({ serviceId: z.uuid() }))
  .handler(async ({ data }) => {
    const { serviceId, ...query } = data;

    const res = await $fetchAndThrow(`/dashboard/:serviceId/stats/overview`, {
      params: { serviceId },
      query,
      output: successResSchema(ServiceOverviewStatsSchema),
    });

    return res.data;
  });
// get overview stats query options
export const overviewStatsQueryOptions = (
  serviceId: string,
  filters: Record<string, unknown>,
) =>
  queryOptions({
    queryKey: queryKeys.overviewStats(serviceId, filters),
    queryFn: () => $getOverviewStats({ data: { serviceId, ...filters } }),
  });

// ————— get timeseries stats ———————————————————
export const $getTimeseriesStats = createServerFn()
  .inputValidator(ServiceTimeseriesQuerySchema.extend({ serviceId: z.uuid() }))
  .handler(async ({ data }) => {
    const { serviceId, ...query } = data;

    const res = await $fetchAndThrow(`/dashboard/:serviceId/stats/timeseries`, {
      params: { serviceId },
      query,
      output: successResSchema(ServiceTimeseriesStatsSchema),
    });

    return res.data;
  });
// get timeseries stats query options
export const timeseriesStatsQueryOptions = (
  serviceId: string,
  filters: Record<string, unknown>,
) =>
  queryOptions({
    queryKey: queryKeys.timeseriesStats(serviceId, filters),
    queryFn: () => $getTimeseriesStats({ data: { serviceId, ...filters } }),
  });

// ————— get status code breakdown ———————————————————
export const $getStatusBreakdown = createServerFn()
  .inputValidator(StatusBreakdownQuerySchema.extend({ serviceId: z.uuid() }))
  .handler(async ({ data }) => {
    const { serviceId, ...query } = data;

    const res = await $fetchAndThrow(
      `/dashboard/:serviceId/stats/status-breakdown`,
      {
        params: { serviceId },
        query,
        output: successResSchema(StatusCodeBreakdownSchema),
      },
    );

    return res.data;
  });
// get status code breakdown query options
export const statusBreakdownQueryOptions = (
  serviceId: string,
  filters: Record<string, unknown>,
) =>
  queryOptions({
    queryKey: queryKeys.statusBreakdown(serviceId, filters),
    queryFn: () => $getStatusBreakdown({ data: { serviceId, ...filters } }),
  });

// ————— get log level breakdown ———————————————————
export const $getLogLevelBreakdown = createServerFn()
  .inputValidator(LogLevelBreakdownQuerySchema.extend({ serviceId: z.uuid() }))
  .handler(async ({ data }) => {
    const { serviceId, ...query } = data;

    const res = await $fetchAndThrow(
      `/dashboard/:serviceId/stats/log-level-breakdown`,
      {
        params: { serviceId },
        query,
        output: successResSchema(LogLevelBreakdownSchema),
      },
    );

    return res.data;
  });
// get log level breakdown query options
export const logLevelBreakdownQueryOptions = (
  serviceId: string,
  filters: Record<string, unknown>,
) =>
  queryOptions({
    queryKey: queryKeys.logLevelBreakdown(serviceId, filters),
    queryFn: () => $getLogLevelBreakdown({ data: { serviceId, ...filters } }),
  });

// ————— get top endpoints ———————————————————
export const $getTopEndpoints = createServerFn()
  .inputValidator(TopEndpointsQuerySchema.extend({ serviceId: z.uuid() }))
  .handler(async ({ data }) => {
    const { serviceId, ...query } = data;

    const res = await $fetchAndThrow(
      `/dashboard/:serviceId/stats/top-endpoints`,
      {
        params: { serviceId },
        query,
        output: successResSchema(TopEndpointsResponseSchema),
      },
    );

    return res.data;
  });
// get top endpoints query options
export const topEndpointsQueryOptions = (
  serviceId: string,
  filters: Record<string, unknown>,
) =>
  queryOptions({
    queryKey: queryKeys.topEndpoints(serviceId, filters),
    queryFn: () => $getTopEndpoints({ data: { serviceId, ...filters } }),
  });

// ————— get service environments ———————————————————
// distinct environment values this service has logged, used to populate the
// environment filter
export const $getServiceEnvironments = createServerFn()
  .inputValidator(z.uuid())
  .handler(async ({ data: serviceId }) => {
    const res = await $fetchAndThrow(`/dashboard/:serviceId/environments`, {
      params: { serviceId },
      output: successResSchema(ServiceEnvironmentsResponseSchema),
    });

    return res.data;
  });

export const environmentsQueryOptions = (serviceId: string) =>
  queryOptions({
    queryKey: queryKeys.environments(serviceId),
    queryFn: () => $getServiceEnvironments({ data: serviceId }),
    // doesn't change very often, so has a stale time of 5 mins
    staleTime: 300_000,
  });

// ————— get error groups ———————————————————
export const $getErrorGroups = createServerFn()
  .inputValidator(ErrorGroupQuerySchema.extend({ serviceId: z.uuid() }))
  .handler(async ({ data }) => {
    const { serviceId, ...query } = data;

    const res = await $fetchAndThrow(`/dashboard/:serviceId/errors/groups`, {
      params: { serviceId },
      query,
      output: successResSchema(ErrorGroupsResponseSchema),
    });

    return res.data;
  });
// get error groups query options
export const errorGroupsQueryOptions = (
  serviceId: string,
  filters: Record<string, unknown>,
) =>
  queryOptions({
    queryKey: queryKeys.errorGroups(serviceId, filters),
    queryFn: () => $getErrorGroups({ data: { serviceId, ...filters } }),
  });
