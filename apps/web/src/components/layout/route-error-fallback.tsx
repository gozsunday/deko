import { AlertCircleIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  type ErrorComponentProps,
  useRouterState,
} from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useApiFailure } from "@/hooks/use-api-failure";
import { extractErrorCode, shouldSurfaceError } from "@/lib/api-errors";
import { extractApiErrorBody } from "@/lib/error";
import { getCatalogEntry, toSurfacedEntry } from "@/lib/error-catalog";

// Route id of the layout that renders `ApiErrorAlert`
const APP_ROUTE_ID = "/_app";

export function RouteErrorFallback({ error, reset }: ErrorComponentProps) {
  const banner = useApiFailure();

  const code = extractErrorCode(error);

  if (!shouldSurfaceError(error)) return null;

  // Is the banner actually on screen? It renders inside the `_app` layout, so
  // it survives every failure except that layout's own, which replaces it.
  // Reading match status rather than the query cache matters: the cache holds
  // the failure either way, so trusting it would suppress this card in the one
  // case the banner never rendered, leaving a blank page.
  const isAppLayoutMounted = useRouterState({
    select: (state) =>
      state.matches.some(
        (match) => match.routeId === APP_ROUTE_ID && match.status !== "error",
      ),
  });

  // when mounted, the banner owns load-time failures and this card is redundant
  if (banner !== null && isAppLayoutMounted && banner.code === code)
    return null;

  // catalog copy beats `details`: it says what to do, where `details` is aimed
  // at API consumers. a codeless error may just be a render exception, so only
  // claim catalog copy when there is a code to look up.
  const entry =
    code === undefined ? null : toSurfacedEntry(getCatalogEntry(code));

  // the raw API `details`, or the JS error's own message, kept as a footnote
  const details =
    extractApiErrorBody(error)?.details ??
    (error instanceof Error && error.message ? error.message : undefined);

  return (
    <Empty className="p-6 pt-32">
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="bg-destructive/10 text-destructive"
        >
          <HugeiconsIcon icon={AlertCircleIcon} />
        </EmptyMedia>
        <EmptyTitle>{entry?.title ?? "Couldn't load this page"}</EmptyTitle>
        <EmptyDescription>
          {entry?.body ??
            details ??
            "An unexpected error occurred while loading this page."}
        </EmptyDescription>
        {/* only worth showing alongside the catalog copy, which it elaborates on */}
        {entry && details ? (
          <span className="mt-1 block font-mono text-[10px] text-muted-foreground">
            {details}
          </span>
        ) : null}
      </EmptyHeader>
      <Button variant="outline" size="sm" onClick={() => reset?.()}>
        <HugeiconsIcon icon={RefreshIcon} size={14} />
        Try again
      </Button>
    </Empty>
  );
}
