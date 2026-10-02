import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

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
  const [failures, setFailures] = useState<ApiFailureGroup[]>(() =>
    computeFailures(queryClient),
  );

  useEffect(() => {
    const recompute = () => {
      const next = computeFailures(queryClient);

      // Reuse the array when nothing changed. A new one re-renders the
      // layout, the churn notifies the cache, and the loop restarts.
      setFailures((prev) => (sameFailures(prev, next) ? prev : next));
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

const computeFailures = (queryClient: QueryClient): ApiFailureGroup[] => {
  const counts = new Map<string, number>();

  for (const query of queryClient.getQueryCache().getAll()) {
    // skip orphans: an error nobody observes is never retried or cleared,
    // so counting it would pin the banner open forever
    if (query.state.status !== "error" || query.getObserversCount() === 0)
      continue;

    // "" groups every network-level failure into one "Cannot reach" bucket
    const key = extractErrorCode(query.state.error) ?? "";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
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
};

// code picks the entry and count is the only other field read, so those two
// fully determine the rendered banner.
const sameFailures = (a: ApiFailureGroup[], b: ApiFailureGroup[]) =>
  a.length === b.length &&
  a.every((group, i) => group.code === b[i].code && group.count === b[i].count);
