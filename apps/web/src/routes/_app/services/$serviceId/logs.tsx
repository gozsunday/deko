import { useInfiniteQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useDebounce } from "@uidotdev/usehooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { LogDetailPanel } from "@/components/logs/log-detail-panel";
import { LogTimeRange } from "@/components/logs/log-time-range";
import {
  type LogEntry,
  logsColumns,
  logsFilters,
} from "@/components/logs/logs-columns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { queryKeys } from "@/lib/query-keys";
import { $getServiceLogs, $getSlowLogs } from "@/server/dashboard";
import { useNavigationOverlayStore } from "@/stores/navigation-overlay-store";
import { usePeriodStore } from "@/stores/period-store";

const LOGS_PAGE_SIZE = 100;
const MAX_LOG_PAGES = 5;

const logsSearchSchema = z.object({
  view: z.enum(["all", "slow"]).catch("all"),
  search: z.string().optional().catch(undefined),
  level: z.enum(["info", "warn", "error", "debug"]).optional().catch(undefined),
  status: z.coerce.number().optional().catch(undefined),
  method: z
    .enum([
      "GET",
      "POST",
      "PUT",
      "DELETE",
      "PATCH",
      "OPTIONS",
      "HEAD",
      "CONNECT",
      "TRACE",
    ])
    .optional()
    .catch(undefined),
  path: z.string().optional().catch(undefined),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
  logId: z.string().optional().catch(undefined),
  timestamp: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_app/services/$serviceId/logs")({
  validateSearch: logsSearchSchema,
  component: LogsPage,
});

function LogsPage() {
  const searchParams = useSearch({ from: "/_app/services/$serviceId/logs" });
  const { serviceId } = useParams({ from: "/_app/services/$serviceId/logs" });
  const navigate = useNavigate();

  const suppressOverlay = useNavigationOverlayStore((s) => s.suppress);
  const releaseOverlay = useNavigationOverlayStore((s) => s.release);

  const getServiceLogs = useServerFn($getServiceLogs);
  const getSlowLogs = useServerFn($getSlowLogs);

  const period = usePeriodStore((s) => s.period);
  const [searchValue, setSearchValue] = useState(searchParams.search ?? "");
  const debouncedSearch = useDebounce(searchValue, 300);
  const searchParamsRef = useRef(searchParams);

  const isSlowView = searchParams.view === "slow";

  const selectedLog =
    searchParams.logId && searchParams.timestamp
      ? { logId: searchParams.logId, timestamp: searchParams.timestamp }
      : null;

  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  // Sync debounced search value to URL
  useEffect(() => {
    const trimmed = debouncedSearch.trim();
    const current = searchParamsRef.current.search ?? "";
    if (trimmed === current) return;
    suppressOverlay();
    void navigate({
      to: "/services/$serviceId/logs",
      params: { serviceId },
      search: { ...searchParamsRef.current, search: trimmed || undefined },
      replace: true,
      resetScroll: false,
    }).finally(releaseOverlay);
  }, [debouncedSearch, navigate, serviceId, suppressOverlay, releaseOverlay]);

  const allLogsQuery = useInfiniteQuery({
    queryKey: queryKeys.logs(serviceId, {
      period,
      environment: searchParams.environment,
      search: searchParams.search,
      level: searchParams.level,
      method: searchParams.method,
      status: searchParams.status,
      path: searchParams.path,
      from: searchParams.from,
      to: searchParams.to,
      view: "all",
    }),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const cursor = typeof pageParam === "string" ? pageParam : undefined;
      return getServiceLogs({
        data: {
          serviceId,
          period,
          environment: searchParams.environment,
          search: searchParams.search,
          level: searchParams.level,
          method: searchParams.method,
          status: searchParams.status,
          path: searchParams.path,
          from: searchParams.from,
          to: searchParams.to,
          cursor,
          limit: LOGS_PAGE_SIZE,
        },
      });
    },
    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor ?? undefined,
    // an unbounded infinite query refetches every page it holds,
    // so 20 scrolled pages meant 20 requests every interval.
    // Older pages past the cap are dropped.
    maxPages: MAX_LOG_PAGES,
    enabled: !isSlowView,
  });

  const slowLogsQuery = useInfiniteQuery({
    queryKey: queryKeys.logs(serviceId, {
      period,
      environment: searchParams.environment,
      search: searchParams.search,
      level: searchParams.level,
      method: searchParams.method,
      status: searchParams.status,
      from: searchParams.from,
      to: searchParams.to,
      view: "slow",
    }),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const cursor = typeof pageParam === "string" ? pageParam : undefined;
      return getSlowLogs({
        data: {
          serviceId,
          period,
          environment: searchParams.environment,
          search: searchParams.search,
          level: searchParams.level,
          method: searchParams.method,
          status: searchParams.status,
          from: searchParams.from,
          to: searchParams.to,
          cursor,
          limit: LOGS_PAGE_SIZE,
          minDuration: 500,
        },
      });
    },
    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor ?? undefined,
    maxPages: MAX_LOG_PAGES,
    enabled: isSlowView,
  });

  const logsQuery = isSlowView ? slowLogsQuery : allLogsQuery;

  const logs = useMemo(
    () => logsQuery.data?.pages.flatMap((p) => p.logs) ?? [],
    [logsQuery.data?.pages],
  );
  const loadingColumnKeys = useMemo(
    () =>
      logsColumns.map((column) => {
        if ("id" in column && typeof column.id === "string") {
          return column.id;
        }
        if ("accessorKey" in column && typeof column.accessorKey === "string") {
          return column.accessorKey;
        }
        return "column";
      }),
    [],
  );

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = logsQuery;

  /**
   * Changing search params still puts the router in a transitioning state,
   * which raises the blocking nav overlay. Nothing is navigating away, so
   * suppress it and leave the table skeleton as the only loading signal,
   * otherwise the overlay covers the filters the user is still clicking.
   */
  const navigateWithSearch = useCallback(
    async (
      newSearch: Partial<z.infer<typeof logsSearchSchema>>,
      replace = false,
      resetScroll = true,
    ) => {
      suppressOverlay();
      try {
        await navigate({
          to: "/services/$serviceId/logs",
          params: { serviceId },
          search: { ...searchParamsRef.current, ...newSearch },
          replace,
          resetScroll,
        });
      } finally {
        releaseOverlay();
      }
    },
    [navigate, serviceId, suppressOverlay, releaseOverlay],
  );

  const handleViewChange = useCallback(
    (view: string) => {
      navigateWithSearch({ view: view as "all" | "slow" });
    },
    [navigateWithSearch],
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearchValue(value);
  }, []);

  const handleFilterChange = useCallback(
    (columnId: string, values: string[]) => {
      const selected = values[0];

      if (columnId === "level") {
        navigateWithSearch(
          {
            level: selected as z.infer<typeof logsSearchSchema>["level"],
          },
          true,
        );
        return;
      }

      if (columnId === "request") {
        navigateWithSearch(
          {
            method: selected as z.infer<typeof logsSearchSchema>["method"],
          },
          true,
        );
        return;
      }

      if (columnId === "status") {
        const statusValue = selected ? Number(selected) : undefined;
        navigateWithSearch(
          {
            status:
              statusValue !== undefined && !Number.isNaN(statusValue)
                ? statusValue
                : undefined,
          },
          true,
        );
      }
    },
    [navigateWithSearch],
  );

  const handleClearAllFilters = useCallback(() => {
    navigateWithSearch(
      {
        level: undefined,
        method: undefined,
        status: undefined,
      },
      true,
    );
  }, [navigateWithSearch]);

  const handleTimeRangeChange = useCallback(
    (next: { from?: string; to?: string }) => {
      navigateWithSearch(next, true);
    },
    [navigateWithSearch],
  );

  const activeFilterValues = useMemo(
    () => ({
      level: searchParams.level ? [searchParams.level] : [],
      request: searchParams.method ? [searchParams.method] : [],
      status:
        searchParams.status !== undefined ? [String(searchParams.status)] : [],
    }),
    [searchParams.level, searchParams.method, searchParams.status],
  );

  const handleSelectLog = useCallback(
    (log: LogEntry) => {
      const ts =
        typeof log.timestamp === "string"
          ? log.timestamp
          : log.timestamp.toISOString();
      navigateWithSearch({ logId: log.id, timestamp: ts }, false, false);
    },
    [navigateWithSearch],
  );

  const handleCloseDetail = useCallback(() => {
    navigateWithSearch(
      { logId: undefined, timestamp: undefined },
      false,
      false,
    );
  }, [navigateWithSearch]);

  const handleLoadMore = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const tableBodyAppend = useMemo(
    () =>
      logsQuery.isPending || isFetchingNextPage ? (
        <InfiniteLoadingRows columnKeys={loadingColumnKeys} />
      ) : undefined,
    [logsQuery.isPending, isFetchingNextPage, loadingColumnKeys],
  );

  const tableElement = useMemo(
    () => (
      <DataTable
        columns={logsColumns}
        data={logs}
        filters={logsFilters}
        searchValue={searchValue}
        onSearchChange={handleSearchChange}
        activeFilterValues={activeFilterValues}
        onFilterChange={handleFilterChange}
        onClearAllFilters={handleClearAllFilters}
        manualFiltering
        virtualize
        onReachEnd={handleLoadMore}
        emptyMessage="No logs found. Try adjusting your filters or time range."
        onRowClick={handleSelectLog}
        tableBodyAppend={tableBodyAppend}
      />
    ),
    [
      logs,
      searchValue,
      handleSearchChange,
      activeFilterValues,
      handleFilterChange,
      handleClearAllFilters,
      handleSelectLog,
      tableBodyAppend,
      handleLoadMore,
    ],
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Logs</h1>
        <p className="text-sm text-muted-foreground">
          Inspect and search API request logs.
        </p>
      </div>

      <Tabs value={searchParams.view} onValueChange={handleViewChange}>
        <TabsList>
          <TabsTrigger value="all">All Logs</TabsTrigger>
          <TabsTrigger value="slow">Slow Requests</TabsTrigger>
        </TabsList>
      </Tabs>

      <LogTimeRange
        from={searchParams.from}
        to={searchParams.to}
        onChange={handleTimeRangeChange}
      />

      {logsQuery.isError ? (
        <LogsTableError onRetry={() => logsQuery.refetch()} />
      ) : (
        <>{tableElement}</>
      )}

      {/* maxPages drops the oldest rows, so the list would otherwise just stop
          with no hint that earlier logs exist */}
      {!logsQuery.isError &&
        hasNextPage &&
        (logsQuery.data?.pages.length ?? 0) >= MAX_LOG_PAGES && (
          <p className="text-xs text-muted-foreground">
            Showing the {logs.length.toLocaleString()} most recent matching
            logs. Older rows are released as you scroll to keep things fast —
            narrow the time range above or add a filter to reach earlier ones.
          </p>
        )}

      {selectedLog && (
        <LogDetailPanel
          serviceId={serviceId}
          logId={selectedLog.logId}
          timestamp={selectedLog.timestamp}
          open
          onClose={handleCloseDetail}
        />
      )}
    </div>
  );
}

function InfiniteLoadingRows({ columnKeys }: { columnKeys: string[] }) {
  const rowKeys = ["first", "second", "third"] as const;

  return (
    <>
      {rowKeys.map((rowKey) => (
        <TableRow
          key={`logs-loading-row-${rowKey}`}
          aria-hidden
          className="pointer-events-none animate-in duration-200 fade-in-0"
        >
          {columnKeys.map((columnKey) => (
            <TableCell key={`logs-loading-cell-${rowKey}-${columnKey}`}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function LogsTableError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Alert variant="destructive" className="max-w-2xl">
        <AlertTitle>Failed to load logs</AlertTitle>
        <AlertDescription>
          We couldn&apos;t fetch logs right now. Try again.
        </AlertDescription>
      </Alert>

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-fit"
        onClick={onRetry}
      >
        Retry
      </Button>
    </div>
  );
}
