import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { PaginationState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { z } from "zod";

import type { ErrorGroup } from "@repo/db/validators/dashboard.validator";

import { errorGroupColumns } from "@/components/errors/error-group-columns";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DataTable } from "@/components/ui/data-table";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { resolvePeriodForLoader } from "@/lib/utils";
import { $getErrorGroups, errorGroupsQueryOptions } from "@/server/dashboard";
import { usePeriodStore } from "@/stores/period-store";

const errorsSearchSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
});

/** Rows per page. Also the `limit` sent to the API. */
const PAGE_SIZE = 10;

export const Route = createFileRoute("/_app/services/$serviceId/errors")({
  validateSearch: errorsSearchSchema,
  loaderDeps: ({ search }) => ({
    environment: search.environment,
    offset: (search.page - 1) * PAGE_SIZE,
  }),
  loader: async ({ context, params, deps }) => {
    const { serviceId } = params;
    const period = resolvePeriodForLoader();

    await context.queryClient.ensureQueryData(
      errorGroupsQueryOptions(serviceId, {
        period,
        environment: deps.environment,
        limit: PAGE_SIZE,
        offset: deps.offset,
      }),
    );
  },
  component: ErrorsPage,
});

const EMPTY_ERROR_GROUPS: ErrorGroup[] = [];
const ERROR_GROUP_LOADING_COLUMN_KEYS = errorGroupColumns.map((column) => {
  if ("id" in column && typeof column.id === "string") {
    return column.id;
  }
  if ("accessorKey" in column && typeof column.accessorKey === "string") {
    return column.accessorKey;
  }
  return "column";
});

function ErrorsPage() {
  const searchParams = useSearch({ from: "/_app/services/$serviceId/errors" });
  const { serviceId } = useParams({
    from: "/_app/services/$serviceId/errors",
  });
  const { environment } = useSearch({
    from: "/_app/services/$serviceId/errors",
  });
  const navigate = useNavigate();

  const getErrorGroups = useServerFn($getErrorGroups);

  const period = usePeriodStore((s) => s.period);
  const searchParamsRef = useRef(searchParams);

  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  const pagination = useMemo<PaginationState>(
    () => ({ pageIndex: searchParams.page - 1, pageSize: PAGE_SIZE }),
    [searchParams.page],
  );

  // server-side paging: the API returns one page plus the full group count
  const offset = (searchParams.page - 1) * PAGE_SIZE;

  const handlePaginationChange = useCallback(
    (
      updater: PaginationState | ((old: PaginationState) => PaginationState),
    ) => {
      const nextPagination =
        typeof updater === "function" ? updater(pagination) : updater;

      void navigate({
        to: "/services/$serviceId/errors",
        params: { serviceId },
        search: {
          ...searchParamsRef.current,
          page: nextPagination.pageIndex + 1,
        },
        replace: true,
        resetScroll: false,
      });
    },
    [navigate, pagination, serviceId],
  );

  const errorGroupsQuery = useQuery({
    ...errorGroupsQueryOptions(serviceId, {
      period,
      environment,
      limit: PAGE_SIZE,
      offset,
    }),
    queryFn: () =>
      getErrorGroups({
        data: { serviceId, period, environment, limit: PAGE_SIZE, offset },
      }),
  });

  const total = errorGroupsQuery.data?.total;

  // switching period or environment can leave the URL on a page past the end.
  // without this the table renders "no error groups" while groups do exist, just
  // not on the requested page.
  useEffect(() => {
    if (total === undefined || offset === 0) return;
    const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (searchParams.page > lastPage) {
      void navigate({
        to: "/services/$serviceId/errors",
        params: { serviceId },
        search: { ...searchParamsRef.current, page: lastPage },
        replace: true,
        resetScroll: false,
      });
    }
  }, [navigate, offset, searchParams.page, serviceId, total]);

  const tableBodyAppend = useMemo(
    () =>
      errorGroupsQuery.isPending ? (
        <LoadingRows columnKeys={ERROR_GROUP_LOADING_COLUMN_KEYS} />
      ) : undefined,
    [errorGroupsQuery.isPending],
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Errors</h1>
        <p className="text-sm text-muted-foreground">
          Recurring error patterns grouped by fingerprint.
        </p>
      </div>

      {errorGroupsQuery.isError ? (
        <Alert variant="destructive" className="max-w-2xl">
          <AlertTitle>Could not load errors</AlertTitle>
          <AlertDescription>
            An unexpected error occurred while loading error groups.
          </AlertDescription>
        </Alert>
      ) : null}

      {!errorGroupsQuery.isPending &&
      errorGroupsQuery.data?.groups.length === 0 ? (
        <Empty className="p-6 pt-40">
          <EmptyHeader>
            <EmptyTitle>No errors</EmptyTitle>
            <EmptyDescription>
              No error groups found for the selected period.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <DataTable
          columns={errorGroupColumns}
          data={errorGroupsQuery.data?.groups ?? EMPTY_ERROR_GROUPS}
          emptyMessage="No error groups found for the selected period."
          rowCount={total ?? 0}
          pagination={pagination}
          onPaginationChange={handlePaginationChange}
          tableBodyAppend={tableBodyAppend}
        />
      )}
    </div>
  );
}

function LoadingRows({ columnKeys }: { columnKeys: string[] }) {
  const rowKeys = ["first", "second", "third"] as const;

  return (
    <>
      {rowKeys.map((rowKey) => (
        <TableRow
          key={`errors-loading-row-${rowKey}`}
          aria-hidden
          className="pointer-events-none animate-in duration-200 fade-in-0"
        >
          {columnKeys.map((columnKey) => (
            <TableCell key={`errors-loading-cell-${rowKey}-${columnKey}`}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
