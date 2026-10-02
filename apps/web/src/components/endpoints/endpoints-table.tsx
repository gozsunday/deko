import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";

import type { TopEndpoint } from "@repo/db/validators/dashboard.validator";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FilterConfig } from "@/components/ui/data-table";
import { DataTable } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const METHOD_STYLES: Record<string, string> = {
  GET: "text-emerald-600 dark:text-emerald-400",
  POST: "text-blue-600 dark:text-blue-400",
  PUT: "text-amber-600 dark:text-amber-400",
  PATCH: "text-orange-600 dark:text-orange-400",
  DELETE: "text-red-600 dark:text-red-400",
  OPTIONS: "text-zinc-600 dark:text-zinc-400",
  HEAD: "text-zinc-600 dark:text-zinc-400",
};

function formatDuration(ms: number | null | undefined): string {
  // null when the rollup served the row; it has no distribution
  if (ms == null) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(3)}s`;
  return `${ms}ms`;
}

function durationColor(ms: number | null | undefined): string {
  if (ms == null) return "text-muted-foreground";
  if (ms >= 1000) return "text-red-600 dark:text-red-400";
  if (ms >= 500) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

function errorRateColor(rate: number): string {
  if (rate >= 20) return "text-red-600 dark:text-red-400";
  if (rate >= 5) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

// The table lists endpoint shapes like /api/products/:id, but the logs filter
// matches real paths, so a shape's :id segments have to become wildcards.
const shapeToPathFilter = (shape: string) => shape.replaceAll(":id", "*");

export const endpointColumns = (
  serviceId: string,
): ColumnDef<TopEndpoint>[] => [
  {
    id: "endpoint",
    accessorFn: (row) => `${row.method} ${row.path}`,
    header: "Endpoint",
    enableSorting: false,
    cell: ({ row }) => (
      <Link
        to="/services/$serviceId/logs"
        params={{ serviceId }}
        search={{
          method: row.original.method,
          path: shapeToPathFilter(row.original.path),
          view: "all",
        }}
        className="flex items-center gap-1.5 font-mono text-xs hover:underline"
        title="View matching logs"
      >
        <span
          className={cn(
            "shrink-0 text-[11px] font-semibold",
            METHOD_STYLES[row.original.method] ?? "text-zinc-400",
          )}
        >
          {row.original.method}
        </span>
        <span className="truncate text-foreground/80">{row.original.path}</span>
      </Link>
    ),
  },
  {
    accessorKey: "requests",
    header: "Requests",
    enableSorting: false,
    meta: { headerClassName: "w-24 text-right", cellClassName: "text-right" },
    cell: ({ row }) => (
      <span className="font-mono text-xs tabular-nums">
        {row.original.requests.toLocaleString()}
      </span>
    ),
  },
  {
    accessorKey: "errors",
    header: "Errors",
    enableSorting: false,
    meta: { headerClassName: "w-20 text-right", cellClassName: "text-right" },
    cell: ({ row }) => (
      <span className="font-mono text-xs tabular-nums">
        {row.original.errors.toLocaleString()}
      </span>
    ),
  },
  {
    accessorKey: "errorRate",
    header: "Error Rate",
    enableSorting: false,
    meta: { headerClassName: "w-24 text-right", cellClassName: "text-right" },
    cell: ({ row }) => (
      <span
        className={cn(
          "font-mono text-xs tabular-nums",
          errorRateColor(row.original.errorRate),
        )}
      >
        {row.original.errorRate.toFixed(1)}%
      </span>
    ),
  },
  {
    accessorKey: "avgDuration",
    header: "Avg",
    enableSorting: false,
    meta: {
      headerClassName: "w-20 text-right",
      cellClassName: "text-right",
    },
    cell: ({ row }) => (
      <span
        className={cn(
          "font-mono text-xs",
          durationColor(row.original.avgDuration),
        )}
      >
        {formatDuration(row.original.avgDuration)}
      </span>
    ),
  },
  {
    accessorKey: "p95Duration",
    header: "P95",
    enableSorting: false,
    meta: {
      headerClassName: "w-20 text-right",
      cellClassName: "text-right",
    },
    cell: ({ row }) => (
      <span
        className={cn(
          "font-mono text-xs",
          durationColor(row.original.p95Duration),
        )}
      >
        {formatDuration(row.original.p95Duration)}
      </span>
    ),
  },
  {
    accessorKey: "p99Duration",
    header: "P99",
    enableSorting: false,
    meta: {
      headerClassName: "w-20 text-right",
      cellClassName: "text-right",
    },
    cell: ({ row }) => (
      <span
        className={cn(
          "font-mono text-xs",
          durationColor(row.original.p99Duration),
        )}
      >
        {formatDuration(row.original.p99Duration)}
      </span>
    ),
  },
];

export const endpointFilters: FilterConfig[] = [
  {
    type: "single-dropdown",
    columnId: "endpoint",
    label: "Method",
    options: [
      { value: "GET", label: "GET" },
      { value: "POST", label: "POST" },
      { value: "PUT", label: "PUT" },
      { value: "PATCH", label: "PATCH" },
      { value: "DELETE", label: "DELETE" },
    ],
  },
];

// Full endpoints table (standalone endpoints page)

interface EndpointsTableProps {
  endpoints: TopEndpoint[];
  isLoading?: boolean;
  serviceId: string;
}

const columnKeysOf = (columns: ColumnDef<TopEndpoint>[]) =>
  columns.map((column) => {
    if ("id" in column && typeof column.id === "string") {
      return column.id;
    }
    if ("accessorKey" in column && typeof column.accessorKey === "string") {
      return column.accessorKey;
    }
    return "column";
  });

export function EndpointsTable({
  endpoints,
  isLoading,
  serviceId,
}: EndpointsTableProps) {
  const columns = endpointColumns(serviceId);
  const tableBodyAppend = isLoading ? (
    <LoadingRows columnKeys={columnKeysOf(columns)} />
  ) : undefined;

  return (
    <DataTable
      columns={columns}
      data={endpoints}
      emptyMessage="No endpoints found for the selected period."
      defaultPagination={{ pageIndex: 0, pageSize: 50 }}
      tableBodyAppend={tableBodyAppend}
    />
  );
}

function LoadingRows({ columnKeys }: { columnKeys: string[] }) {
  const rowKeys = ["first", "second", "third"] as const;

  return (
    <>
      {rowKeys.map((rowKey) => (
        <TableRow
          key={`endpoints-loading-row-${rowKey}`}
          aria-hidden
          className="pointer-events-none animate-in duration-200 fade-in-0"
        >
          {columnKeys.map((columnKey) => (
            <TableCell key={`endpoints-loading-cell-${rowKey}-${columnKey}`}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// Overview preview (compact, no sort controls)

interface TopEndpointsPreviewProps {
  endpoints: TopEndpoint[];
  isLoading?: boolean;
  serviceId: string;
}

export function TopEndpointsPreview({
  endpoints,
  isLoading,
  serviceId,
}: TopEndpointsPreviewProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="border-b border-border/50 pb-3">
          <Skeleton className="h-4 w-28" />
        </CardHeader>
        <CardContent className="pt-3">
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              // oxlint-disable-next-line react/no-array-index-key
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="border-b border-border/50 pb-3">
        <CardTitle className="text-sm font-medium">Top Endpoints</CardTitle>
      </CardHeader>
      <CardContent className="pt-3 pb-2">
        {endpoints.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No data yet.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border/30">
            {endpoints.slice(0, 5).map((ep) => (
              <Link
                key={`${ep.method}-${ep.path}`}
                to="/services/$serviceId/logs"
                params={{ serviceId }}
                search={{
                  method: ep.method,
                  path: shapeToPathFilter(ep.path),
                  view: "all",
                }}
                className="flex items-center gap-2 py-2 hover:underline"
                title="View matching logs"
              >
                <Badge
                  variant="outline"
                  className={cn(
                    "shrink-0 font-mono text-[10px] font-semibold",
                    METHOD_STYLES[ep.method] ?? "",
                  )}
                >
                  {ep.method}
                </Badge>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/80">
                  {ep.path}
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                  {ep.requests.toLocaleString()}
                </span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
