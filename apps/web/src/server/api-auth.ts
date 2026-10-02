import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { extractErrorCode } from "@/lib/api-errors";
import { getCatalogEntry } from "@/lib/error-catalog";
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
      const code = extractErrorCode(error);

      // "blocking" means the API rejected our credentials. shouldSurfaceError
      // can't answer this: a dead API surfaces globally too, and would be
      // misreported as a bad ADMIN_TOKEN.
      if (code && getCatalogEntry(code).severity === "blocking") {
        // deliberately does not print the token, the response, or the request
        // headers. prints only the safe error code.
        console.error(
          `[api-auth] ADMIN_TOKEN was rejected by the Deko API (code: ${code}). ` +
            `The web app's ADMIN_TOKEN does not match the API's. Set an identical ` +
            `ADMIN_TOKEN in both services, then restart the web container. ` +
            `Generate one with: openssl rand -hex 32`,
        );

        return { ok: false, code, reason: "rejected" };
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
