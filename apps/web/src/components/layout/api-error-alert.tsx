import { AlertCircleIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useApiFailure, useApiFailures } from "@/hooks/use-api-failure";

export function ApiErrorAlert({ className }: { className: string }) {
  const queryClient = useQueryClient();

  // lead with the most severe failure, but keep the full list to report a count
  // when more than one query failed.
  const primary = useApiFailure();
  const failures = useApiFailures();

  if (!primary) return null;

  const totalFailed = failures.reduce((sum, failure) => sum + failure.count, 0);

  // retry only what failed
  const handleRetry = () => {
    void queryClient.refetchQueries({
      predicate: (query) => query.state.status === "error",
    });
  };

  return (
    <div className={className}>
      <Alert variant="destructive">
        <HugeiconsIcon icon={AlertCircleIcon} />
        <AlertTitle>{primary.entry.title}</AlertTitle>
        <AlertDescription>
          {primary.entry.body}
          {primary.code ? (
            <span className="mt-1 block font-mono text-[10px] opacity-80">
              reported code: {primary.code}
            </span>
          ) : null}
          {totalFailed > 1 ? (
            <span className="mt-1 block text-[10px] opacity-80">
              {totalFailed} requests failed
            </span>
          ) : null}
          <span className="mt-2 block">
            <Button variant="outline" size="sm" onClick={handleRetry}>
              <HugeiconsIcon icon={RefreshIcon} size={14} />
              Try again
            </Button>
          </span>
        </AlertDescription>
      </Alert>
    </div>
  );
}
