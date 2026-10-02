import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import type { ServiceTimeseriesStats } from "@repo/db/validators/dashboard.validator";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";

interface TimeseriesChartProps {
  data: ServiceTimeseriesStats;
  serviceId: string;
  environment?: string;
}

// a bucket is inclusive of its start, so jump to the moment it ends: the log
// feed pages backwards from `to`, which lands the user on that bucket first
const GRANULARITY_MS: Record<string, number> = {
  minute: 60_000,
  "15minute": 900_000,
  hour: 3_600_000,
  "2hour": 7_200_000,
  day: 86_400_000,
};

const chartConfig: ChartConfig = {
  requests: {
    label: "Requests",
    color: "#3b82f6",
  },
  errors: {
    label: "Errors",
    color: "#ef4444",
  },
};

function formatBucketLabel(ts: Date, granularity: string): string {
  if (granularity === "minute") return format(ts, "HH:mm");
  if (granularity === "hour") return format(ts, "HH:mm");
  return format(ts, "MMM dd");
}

export function TimeseriesChart({
  data,
  serviceId,
  environment,
}: TimeseriesChartProps) {
  const navigate = useNavigate();

  const chartData = useMemo(
    () =>
      data.buckets.map((b) => ({
        ts: b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp),
        requests: b.requests ?? 0,
        errors: b.errors ?? 0,
      })),
    [data.buckets],
  );

  return (
    <Card>
      <CardHeader className="border-b border-border/50 pb-3">
        <CardTitle className="text-sm font-medium">Requests & Errors</CardTitle>
        <p className="text-xs text-muted-foreground">
          Click anywhere on the chart to jump to those logs.
        </p>
      </CardHeader>
      <CardContent className="pt-4 pb-2">
        <ChartContainer config={chartConfig} className="h-52 w-full">
          <AreaChart
            accessibilityLayer
            data={chartData}
            margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
            className="cursor-pointer"
            onClick={(state) => {
              const label = state?.activeLabel;
              if (!label) return;
              const start = new Date(label as string | number | Date);
              if (Number.isNaN(start.getTime())) return;
              const span = GRANULARITY_MS[data.granularity] ?? 900_000;
              void navigate({
                to: "/services/$serviceId/logs",
                params: { serviceId },
                search: {
                  to: new Date(start.getTime() + span).toISOString(),
                  environment,
                  view: "all",
                },
              });
            }}
          >
            <defs>
              <linearGradient id="fillRequests" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-requests)"
                  stopOpacity={0.5}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-requests)"
                  stopOpacity={0.05}
                />
              </linearGradient>
              <linearGradient id="fillErrors" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-errors)"
                  stopOpacity={0.5}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-errors)"
                  stopOpacity={0.05}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="ts"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
              tickFormatter={(v: Date) =>
                formatBucketLabel(v, data.granularity)
              }
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const ts = payload?.[0]?.payload?.ts as Date | undefined;
                    return ts ? format(ts, "MMM dd, HH:mm") : "";
                  }}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="requests"
              stroke="var(--color-requests)"
              strokeWidth={2}
              fill="url(#fillRequests)"
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="errors"
              stroke="var(--color-errors)"
              strokeWidth={2}
              fill="url(#fillErrors)"
              dot={false}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export function TimeseriesChartSkeleton() {
  return (
    <Card>
      <CardHeader className="border-b border-border/50 pb-3">
        <Skeleton className="h-4 w-40" />
      </CardHeader>
      <CardContent className="pt-4 pb-2">
        <Skeleton className="h-52 w-full" />
      </CardContent>
    </Card>
  );
}
