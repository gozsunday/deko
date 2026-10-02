import { Query, QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { ApiFailureGroup, extractErrorCode } from "@/lib/api-errors";
import {
  ErrorSeverity,
  getCatalogEntry,
  shouldSurfaceGlobally,
  SurfacedErrorCatalogEntry,
  toSurfacedEntry,
} from "@/lib/error-catalog";

// group every errored query in the cache by error code, sorted by severity
export const useApiFailures = (): ApiFailureGroup[] => {
  const queryClient = useQueryClient();
  const [failures, setFailures] = useState<ApiFailureGroup[]>(
    () => computeFailures(queryClient).groups,
  );

  // query objects are stable references within the cache, so they can be held
  // across the window where the error itself has been cleared
  const lastFailedQueries = useRef<Query[]>([]);

  useEffect(() => {
    const recompute = () => {
      const next = computeFailures(queryClient);

      const stillRetrying = lastFailedQueries.current.some(
        (query) => query.state.fetchStatus === "fetching",
      );

      // nothing failed and something that had failed is mid-retry: the
      // outcome is not known yet, so keep showing what we had.
      if (next.groups.length === 0 && stillRetrying) return;

      lastFailedQueries.current = next.failedQueries;

      // Hand back the same array when nothing actually changed, so React can
      // bail out of the re-render. computeFailures builds a fresh array every
      // time, and swapping that in on every cache notification is what feeds
      // the loop: re-render churns observers, observers notify the cache,
      // recompute runs again. Returning `prev` cuts the loop at its source.
      setFailures((prev) =>
        sameFailures(prev, next.groups) ? prev : next.groups,
      );
    };

    // the cache may have changed between render and effect, so resync once
    recompute();

    return queryClient.getQueryCache().subscribe(recompute);
  }, [queryClient]);

  return failures;
};

/**
 * A failure the banner should lead with. `entry` is narrowed to the variant
 * that carries copy, so consumers can read `.title`/`.body` directly.
 */
export type SurfacedApiFailure = Omit<ApiFailureGroup, "entry"> & {
  entry: SurfacedErrorCatalogEntry;
};

// the single failure to lead with, or null when nothing worth showing has
// failed. blocking always wins over transient. silent codes never surface.
export const useApiFailure = (): SurfacedApiFailure | null => {
  const surfaced = useApiFailures().find((failure) =>
    shouldSurfaceGlobally(failure.entry),
  );

  return surfaced
    ? { ...surfaced, entry: toSurfacedEntry(surfaced.entry) }
    : null;
};

const SEVERITY_RANK: Record<ErrorSeverity, number> = {
  blocking: 0,
  transient: 1,
  silent: 2,
};

const computeFailures = (
  queryClient: QueryClient,
): { groups: ApiFailureGroup[]; failedQueries: Query[] } => {
  const counts = new Map<string, number>();
  const failedQueries: Query[] = [];

  for (const query of queryClient.getQueryCache().getAll()) {
    if (query.state.status !== "error") continue;

    failedQueries.push(query);

    // undefined is a real grouping key: it collects every network-level
    // failure into the single "Cannot reach the Deko API" bucket
    const key = extractErrorCode(query.state.error) ?? "";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const groups = [...counts.entries()]
    .map(([key, count]) => ({
      // "" is the grouping key for network-level failures, which have no
      // code; surface that as undefined so the UI can tell them apart
      code: key === "" ? undefined : key,
      entry: getCatalogEntry(key),
      count,
    }))
    .toSorted(
      (a, b) =>
        SEVERITY_RANK[a.entry.severity] - SEVERITY_RANK[b.entry.severity] ||
        b.count - a.count,
    );

  return { groups, failedQueries };
};

// `code` picks the catalog entry and `count` is the only other field the UI
// reads, so those two fully determine the rendered banner.
const sameFailures = (a: ApiFailureGroup[], b: ApiFailureGroup[]) =>
  a.length === b.length &&
  a.every((group, i) => group.code === b[i].code && group.count === b[i].count);
