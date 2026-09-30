import { AlertCircleIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useApiAuthFailure } from "@/lib/api-auth";
import { $checkApiAuth, apiAuthQueryOptions } from "@/server/api-auth";

export function ApiAuthAlert() {
  const checkApiAuth = useServerFn($checkApiAuth);

  const {
    data: probeResult,
    isFetching,
    refetch,
  } = useQuery({
    ...apiAuthQueryOptions(),
    queryFn: () => checkApiAuth(),
  });

  const hasAuthError = useApiAuthFailure();

  const isRejected =
    probeResult?.ok === false && probeResult.reason === "rejected";
  const isUnreachable =
    probeResult?.ok === false && probeResult.reason === "unreachable";

  if (!hasAuthError && !isRejected && !isUnreachable) return null;

  const title = isUnreachable
    ? "Cannot reach the Deko API"
    : "Deko API authentication failed";

  const description = isUnreachable
    ? "The web app could not reach the API, so no data can be loaded. Check that the api service is running and that API_URL is correct."
    : "The web app's ADMIN_TOKEN was rejected by the API, so no data can be loaded. Set an identical ADMIN_TOKEN in both the api and web services, restart the web container, and reload this page. Generate one with: openssl rand -hex 32";

  return (
    <div className="p-4 pb-0">
      <Alert variant="destructive">
        <HugeiconsIcon icon={AlertCircleIcon} />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          {description}
          {probeResult?.ok === false ? (
            <span className="mt-1 block font-mono text-[10px] opacity-80">
              reported code: {probeResult.code}
            </span>
          ) : null}
          <span className="mt-2 block">
            <Button
              variant="outline"
              size="sm"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              <HugeiconsIcon icon={RefreshIcon} size={14} />
              {isFetching ? "Checking..." : "Check again"}
            </Button>
          </span>
        </AlertDescription>
      </Alert>
    </div>
  );
}
