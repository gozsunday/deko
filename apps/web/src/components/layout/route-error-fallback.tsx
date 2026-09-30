import { AlertCircleIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ErrorComponentProps } from "@tanstack/react-router";

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

export function RouteErrorFallback({ error, reset }: ErrorComponentProps) {
  const banner = useApiFailure();

  const code = extractErrorCode(error);

  if (!shouldSurfaceError(error)) return null;

  // alert banner already reports anything that reached the query cache, which is
  // every error a `beforeLoad`/`loader` throws. this card only shows what the
  // banner cannot see a render-time exception, or a failure the catalog has no
  // specific copy for.
  if (banner !== null && banner.code === code) return null;

  // show the API's `details`, and if absent, fall back to the JS error's own message
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
        <EmptyTitle>Couldn&apos;t load this page</EmptyTitle>
        {details ? (
          <EmptyDescription>{details}</EmptyDescription>
        ) : (
          <EmptyDescription>
            An unexpected error occurred while loading this page.
          </EmptyDescription>
        )}
      </EmptyHeader>
      <Button variant="outline" size="sm" onClick={() => reset?.()}>
        <HugeiconsIcon icon={RefreshIcon} size={14} />
        Try again
      </Button>
    </Empty>
  );
}
