import { BetterFetchError } from "@better-fetch/fetch";
import { createSerializationAdapter } from "@tanstack/react-router";
import { z } from "zod";

import { errorResSchema } from "./schemas";

export type AppBetterFetchError = Omit<BetterFetchError, "error"> & {
  error: z.infer<typeof errorResSchema>["error"] | undefined;
};

// gets the API's error body from whatever shape the error arrived in
export const extractApiErrorBody = (
  error: unknown,
): { code?: string; details?: string } | undefined => {
  if (typeof error !== "object" || error === null) return undefined;

  const parsed = (error as { error?: unknown }).error;
  if (typeof parsed !== "object" || parsed === null) return undefined;

  const candidate = parsed as {
    code?: unknown;
    details?: unknown;
    error?: unknown;
  };

  // Shape 2: already the inner error object.
  if (typeof candidate.code === "string") {
    return {
      code: candidate.code,
      details:
        typeof candidate.details === "string" ? candidate.details : undefined,
    };
  }

  // Shape 1: the full response envelope, unwrap one more level.
  const inner = candidate.error;
  if (typeof inner !== "object" || inner === null) return undefined;

  const { code, details } = inner as { code?: unknown; details?: unknown };
  if (typeof code !== "string") return undefined;

  return {
    code,
    details: typeof details === "string" ? details : undefined,
  };
};

export const betterFetchErrorAdapter = createSerializationAdapter({
  key: "betterFetchError",
  test: (err): err is BetterFetchError => {
    return err instanceof BetterFetchError;
  },
  toSerializable: (err) => {
    const parsed = errorResSchema.safeParse(err.error);

    if (parsed.success) {
      return {
        message: err.message,
        error: parsed.data.error,
        status: err.status,
        statusText: err.statusText,
      };
    }

    return {
      message: err.message,
      status: err.status,
      statusText: err.statusText,
    };
  },
  fromSerializable: (errObj): AppBetterFetchError => {
    return Object.assign(
      new BetterFetchError(errObj.status, errObj.statusText, errObj.error),
      {
        message: errObj.message,
        error: errObj.error,
      },
    );
  },
});

// type BetterFetchErrorPayload = z.infer<typeof errorResSchema>["error"];

// type SerializedBetterFetchError = {
//   message: string;
//   status: number;
//   statusText: string;
//   error?: BetterFetchErrorPayload;
// };

// export const betterFetchErrorAdapter = createSerializationAdapter<
//   BetterFetchError,
//   SerializedBetterFetchError
// >({
