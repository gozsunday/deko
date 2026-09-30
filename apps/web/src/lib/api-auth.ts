import { useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { ADMIN_AUTH_ERROR_CODES } from "@repo/shared/admin-auth";

// codes that mean "the admin credential was rejected"
export const API_AUTH_ERROR_CODES = [
  ADMIN_AUTH_ERROR_CODES.missing,
  ADMIN_AUTH_ERROR_CODES.invalid,
] as const;

const API_AUTH_ERROR_CODE_SET: ReadonlySet<string> = new Set(
  API_AUTH_ERROR_CODES,
);

export const extractErrorCode = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null) return undefined;

  const parsed = (error as { error?: unknown }).error;
  if (typeof parsed !== "object" || parsed === null) return undefined;

  const candidate = parsed as { code?: unknown; error?: unknown };

  // Shape 2: the inner error object.
  if (typeof candidate.code === "string") return candidate.code;

  // Shape 1: the full response envelope, unwrap one more level.
  const inner = candidate.error;
  if (typeof inner === "object" && inner !== null) {
    const innerCode = (inner as { code?: unknown }).code;
    if (typeof innerCode === "string") return innerCode;
  }

  return undefined;
};

export const isApiAuthError = (error: unknown): boolean => {
  const code = extractErrorCode(error);
  return code !== undefined && API_AUTH_ERROR_CODE_SET.has(code);
};

// checks whether any query in the cache has failed with an auth error
export const useApiAuthFailure = (): boolean => {
  const queryClient = useQueryClient();

  return useSyncExternalStore(
    (onStoreChange) => queryClient.getQueryCache().subscribe(onStoreChange),
    () =>
      queryClient
        .getQueryCache()
        .getAll()
        .some(
          (query) =>
            query.state.status === "error" && isApiAuthError(query.state.error),
        ),
    () => false,
  );
};
