import { useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import { ADMIN_AUTH_ERROR_CODES } from "@repo/shared/admin-auth";

import { extractApiErrorBody } from "./error";

// codes that mean "the admin credential was rejected"
export const API_AUTH_ERROR_CODES = [
  ADMIN_AUTH_ERROR_CODES.missing,
  ADMIN_AUTH_ERROR_CODES.invalid,
] as const;

const API_AUTH_ERROR_CODE_SET: ReadonlySet<string> = new Set(
  API_AUTH_ERROR_CODES,
);

export const extractErrorCode = (error: unknown): string | undefined =>
  extractApiErrorBody(error)?.code;

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
