import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNowStrict } from "date-fns";

import type { ErrorGroup } from "@repo/db/validators/dashboard.validator";

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

function statusColor(status: number): string {
  if (status >= 500) return "text-red-600 dark:text-red-400";
  if (status >= 400) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

const formatRelativeTime = (value: Date) => {
  return formatDistanceToNowStrict(value, {
    addSuffix: true,
    roundingMethod: "floor",
  });
};

export const errorGroupColumns = (
  serviceId: string,
): ColumnDef<ErrorGroup>[] => [
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
          path: row.original.path,
          status: row.original.status,
          view: "all",
        }}
        className="flex flex-col gap-0.5 hover:underline"
        title="View matching logs"
      >
        <span className="flex items-center gap-1.5 font-mono text-xs">
          <span
            className={cn(
              "shrink-0 text-[11px] font-semibold",
              METHOD_STYLES[row.original.method] ?? "text-zinc-400",
            )}
          >
            {row.original.method}
          </span>
          <span className="truncate text-foreground/80">
            {row.original.path}
          </span>
          <span
            className={cn(
              "shrink-0 font-semibold",
              statusColor(row.original.status),
            )}
          >
            {row.original.status}
          </span>
        </span>
        {row.original.message && (
          <span className="truncate text-xs text-muted-foreground">
            {row.original.message}
          </span>
        )}
      </Link>
    ),
  },
  {
    accessorKey: "count",
    header: "Occurrences",
    enableSorting: false,
    meta: { headerClassName: "w-28 text-right", cellClassName: "text-right" },
    cell: ({ row }) => (
      <span className="font-mono text-xs tabular-nums">
        {row.original.count.toLocaleString()}
      </span>
    ),
  },
  {
    accessorKey: "firstSeen",
    header: "First Seen",
    enableSorting: false,
    meta: {
      headerClassName: "table-cell w-32 text-right",
      cellClassName: "table-cell text-right",
    },
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {formatRelativeTime(row.original.firstSeen)}
      </span>
    ),
  },
  {
    accessorKey: "lastSeen",
    header: "Last Seen",
    enableSorting: false,
    meta: {
      headerClassName: "table-cell w-32 text-right",
      cellClassName: "table-cell text-right",
    },
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">
        {formatRelativeTime(row.original.lastSeen)}
      </span>
    ),
  },
];
