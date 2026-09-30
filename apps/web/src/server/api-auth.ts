import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { extractErrorCode, shouldSurfaceError } from "@/lib/api-errors";
import { $fetchAndThrow } from "@/lib/fetch";
import { queryKeys } from "@/lib/query-keys";

export type ApiAuthProbeResult =
  | { ok: true }
  | { ok: false; code: string; reason: "rejected" | "unreachable" };

// ————— check API auth ———————————————————
// makes a GET req to `/api/services` which is an admin-protected route
// to check if the dashboard instance is authorized to make reqs to the API
export const $checkApiAuth = createServerFn().handler(
  async (): Promise<ApiAuthProbeResult> => {
    try {
      await $fetchAndThrow("/services");

      return { ok: true };
    } catch (error) {
      if (shouldSurfaceError(error)) {
        // deliberately does not print the token, the response, or the request
        // headers. prints only the safe error code.
        console.error(
          `[api-auth] ADMIN_TOKEN was rejected by the Deko API (code: ${extractErrorCode(error)}). ` +
            `The web app's ADMIN_TOKEN does not match the API's. Set an identical ` +
            `ADMIN_TOKEN in both services, then restart the web container. ` +
            `Generate one with: openssl rand -hex 32`,
        );

        return {
          ok: false,
          code: extractErrorCode(error) ?? "INVALID_ADMIN_TOKEN",
          reason: "rejected",
        };
      }

      // network failure, API down, timeout, or a 5xx
      console.error(
        "[api-auth] Could not reach the Deko API to verify ADMIN_TOKEN. " +
          "Is the api service running and is API_URL correct?",
        error,
      );

      return { ok: false, code: "API_UNREACHABLE", reason: "unreachable" };
    }
  },
);

// runs only once at dashboard load, and does not retry
export const apiAuthQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.apiAuth(),
    queryFn: $checkApiAuth,
    retry: false,
    refetchInterval: false,
    staleTime: 60_000,
  });
