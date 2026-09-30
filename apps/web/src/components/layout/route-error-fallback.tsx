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
import { isApiAuthError } from "@/lib/api-auth";
import { extractApiErrorBody } from "@/lib/error";

export function RouteErrorFallback({ error, reset }: ErrorComponentProps) {
  if (isApiAuthError(error)) return null;

  // Prefer the API's `details`: those strings are written to be read by a
  // person. Fall back to the JS error's own message, which is what a plain
  // render-time exception (as opposed to a failed request) will have.
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
