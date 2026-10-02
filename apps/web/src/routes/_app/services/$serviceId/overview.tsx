import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import type { TopEndpoint } from "@repo/db/validators/dashboard.validator";

import { TopEndpointsPreview } from "@/components/endpoints/endpoints-table";
import { TokenOnboardingDialog } from "@/components/onboarding/token-onboarding-dialog";
import {
  LogLevelBreakdownChart,
  LogLevelBreakdownChartSkeleton,
  StatusBreakdownChart,
  StatusBreakdownChartSkeleton,
} from "@/components/overview/breakdown-charts";
import { StatCard, StatCardSkeleton } from "@/components/overview/stat-card";
import {
  TimeseriesChart,
  TimeseriesChartSkeleton,
} from "@/components/overview/timeseries-chart";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn, resolvePeriodForLoader } from "@/lib/utils";
import {
  $getLogLevelBreakdown,
  $getOverviewStats,
  $getStatusBreakdown,
  $getTimeseriesStats,
  $getTopEndpoints,
  logLevelBreakdownQueryOptions,
  overviewStatsQueryOptions,
  statusBreakdownQueryOptions,
  timeseriesStatsQueryOptions,
  topEndpointsQueryOptions,
} from "@/server/dashboard";
import { usePeriodStore } from "@/stores/period-store";

// the chart plots requests and errors only
const TIMESERIES_METRICS = "requests,errors";

export const Route = createFileRoute("/_app/services/$serviceId/overview")({
  component: OverviewPage,
  // Without this the loader would not re-run when only the environment
  // changes, because it has no other declared dependency.
  loaderDeps: ({ search }) => ({ environment: search.environment }),
  loader: async ({ context, params, deps }) => {
    const { serviceId } = params;
    const period = resolvePeriodForLoader();
    const { environment } = deps;

    await context.queryClient.ensureQueryData(
      overviewStatsQueryOptions(serviceId, { period, environment }),
    );
    await context.queryClient.ensureQueryData(
      timeseriesStatsQueryOptions(serviceId, {
        period,
        environment,
        metrics: TIMESERIES_METRICS,
      }),
    );
    await context.queryClient.ensureQueryData(
      statusBreakdownQueryOptions(serviceId, { period, environment }),
    );
    await context.queryClient.ensureQueryData(
      logLevelBreakdownQueryOptions(serviceId, { period, environment }),
    );
    await context.queryClient.ensureQueryData(
      topEndpointsQueryOptions(serviceId, {
        period,
        environment,
        sortBy: "requests",
        limit: 5,
      }),
    );
  },
});

const EMPTY_TOP_ENDPOINTS: TopEndpoint[] = [];

function fmtDuration(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(3)}s`;
  return `${ms}ms`;
}

function OverviewPage() {
  const { serviceId } = useParams({
    from: "/_app/services/$serviceId/overview",
  });
  const { environment } = useSearch({
    from: "/_app/services/$serviceId/overview",
  });

  const getOverviewStats = useServerFn($getOverviewStats);
  const getTimeseriesStats = useServerFn($getTimeseriesStats);
  const getStatusBreakdown = useServerFn($getStatusBreakdown);
  const getLogLevelBreakdown = useServerFn($getLogLevelBreakdown);
  const getTopEndpoints = useServerFn($getTopEndpoints);

  const period = usePeriodStore((s) => s.period);

  const overviewQuery = useQuery({
    ...overviewStatsQueryOptions(serviceId, { period, environment }),
    queryFn: () =>
      getOverviewStats({ data: { serviceId, period, environment } }),
  });

  const timeseriesQuery = useQuery({
    ...timeseriesStatsQueryOptions(serviceId, {
      period,
      environment,
      metrics: TIMESERIES_METRICS,
    }),
    queryFn: () =>
      getTimeseriesStats({
        data: { serviceId, period, environment, metrics: TIMESERIES_METRICS },
      }),
  });

  const statusQuery = useQuery({
    ...statusBreakdownQueryOptions(serviceId, { period, environment }),
    queryFn: () =>
      getStatusBreakdown({
        data: { serviceId, period, environment, groupBy: "category" },
      }),
  });

  const levelQuery = useQuery({
    ...logLevelBreakdownQueryOptions(serviceId, { period, environment }),
    queryFn: () =>
      getLogLevelBreakdown({ data: { serviceId, period, environment } }),
  });

  const topEndpointsQuery = useQuery({
    ...topEndpointsQueryOptions(serviceId, {
      period,
      environment,
      sortBy: "requests",
      limit: 5,
    }),
    queryFn: () =>
      getTopEndpoints({
        data: { serviceId, period, environment, sortBy: "requests", limit: 5 },
      }),
  });

  const stats = overviewQuery.data;
  const topEndpoints = topEndpointsQuery.data?.endpoints ?? EMPTY_TOP_ENDPOINTS;

  return (
    <>
      {/* Alert Dialog that gets shown after the user creates their first service */}
      <TokenOnboardingDialog />

      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-lg font-semibold">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Service health and performance at a glance.
          </p>
        </div>

        {/* KPI stat cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {overviewQuery.isPending ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : overviewQuery.isError ? (
            <>
              <ErrorCard
                title="Total Requests"
                description="Could not load this metric."
              />
              <ErrorCard
                title="Error Rate"
                description="Could not load this metric."
              />
              <ErrorCard
                title="Avg Duration"
                description="Could not load this metric."
              />
              <ErrorCard
                title="P95 Duration"
                description="Could not load this metric."
              />
              <ErrorCard
                title="P99 Duration"
                description="Could not load this metric."
              />
            </>
          ) : !stats ? (
            <EmptyCard
              title="Overview Metrics"
              description="No metrics available for the selected period."
              className="sm:col-span-2 lg:col-span-3 2xl:col-span-5"
            />
          ) : (
            <>
              <StatCard
                title="Total Requests"
                value={stats.totalRequests.toLocaleString()}
                change={stats.comparison.totalRequestsChange}
                positiveIsGood={true}
              />
              <StatCard
                title="Error Rate"
                value={`${stats.errorRate.toFixed(2)}%`}
                change={stats.comparison.errorRateChange}
                positiveIsGood={false}
              />
              <StatCard
                title="Avg Duration"
                value={fmtDuration(stats.avgDuration)}
                change={stats.comparison.avgDurationChange}
                positiveIsGood={false}
                suffix="avg"
              />
              <StatCard
                title="P95 Duration"
                value={fmtDuration(stats.p95Duration)}
                positiveIsGood={false}
              />
              <StatCard
                title="P99 Duration"
                value={fmtDuration(stats.p99Duration)}
                positiveIsGood={false}
              />
            </>
          )}
        </div>

        {/* Timeseries chart */}
        {timeseriesQuery.isPending ? (
          <TimeseriesChartSkeleton />
        ) : timeseriesQuery.isError ? (
          <ErrorCard
            title="Requests & Errors"
            description={"Could not load timeseries data."}
            className="py-16"
            centered
          />
        ) : !timeseriesQuery.data ||
          timeseriesQuery.data.buckets.length === 0 ? (
          <EmptyCard
            title="Requests & Errors"
            description="No timeseries data available for the selected period."
            className="py-16"
          />
        ) : (
          <TimeseriesChart
            data={timeseriesQuery.data}
            serviceId={serviceId}
            environment={environment}
          />
        )}

        {/* Breakdown charts */}
        <div className="grid gap-4 lg:grid-cols-2">
          {statusQuery.isPending ? (
            <StatusBreakdownChartSkeleton />
          ) : statusQuery.isError ? (
            <ErrorCard
              title="Status Codes"
              description={"Could not load status breakdown."}
              className="py-16"
              centered
            />
          ) : !statusQuery.data || statusQuery.data.breakdown.length === 0 ? (
            <EmptyCard
              title="Status Codes"
              description="No status breakdown available for the selected period."
              className="py-16"
            />
          ) : (
            <StatusBreakdownChart data={statusQuery.data} />
          )}

          {levelQuery.isPending ? (
            <LogLevelBreakdownChartSkeleton />
          ) : levelQuery.isError ? (
            <ErrorCard
              title="Log Levels"
              description={"Could not load log-level breakdown."}
              className="py-16"
              centered
            />
          ) : !levelQuery.data || levelQuery.data.breakdown.length === 0 ? (
            <EmptyCard
              title="Log Levels"
              description="No log-level breakdown available for the selected period."
              className="py-16"
            />
          ) : (
            <LogLevelBreakdownChart data={levelQuery.data} />
          )}
        </div>

        {/* Top endpoints preview */}
        {topEndpointsQuery.isPending ? (
          <TopEndpointsPreview
            endpoints={EMPTY_TOP_ENDPOINTS}
            isLoading
            serviceId={serviceId}
          />
        ) : topEndpointsQuery.isError ? (
          <ErrorCard
            title="Top Endpoints"
            description={"Could not load top endpoints."}
            className="py-16"
            centered
          />
        ) : topEndpoints.length === 0 ? (
          <EmptyCard
            title="Top Endpoints"
            description="No endpoint data available for the selected period."
            className="py-16"
          />
        ) : (
          <TopEndpointsPreview
            endpoints={topEndpoints}
            isLoading={false}
            serviceId={serviceId}
          />
        )}
      </div>
    </>
  );
}

function EmptyCard({
  title,
  description,
  className,
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{title}</EmptyTitle>
            <EmptyDescription>{description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CardContent>
    </Card>
  );
}

function ErrorCard({
  title,
  description,
  className,
  centered = false,
}: {
  title: string;
  description: string;
  className?: string;
  centered?: boolean;
}) {
  return (
    <Card className="border border-destructive/40 bg-destructive/5">
      <CardContent
        className={cn(
          "space-y-1",
          centered
            ? "flex h-full flex-col items-center justify-center text-center"
            : "",
          className,
        )}
      >
        <CardTitle className="text-sm font-medium text-destructive">
          {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
