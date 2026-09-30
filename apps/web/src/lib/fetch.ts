import { createFetch } from "@better-fetch/fetch";
import "@tanstack/react-start/server-only";

import { ADMIN_AUTH_HEADER, ADMIN_AUTH_SCHEME } from "@repo/shared/admin-auth";

import { errorResSchema } from "@/lib/schemas";

import { env } from "./env";

const baseURL = `${env.API_URL}/api`;
const FETCH_TIMEOUT_MS = 90_000;

// header name and scheme come from the shared package so this cannot drift from
// what the API's `bearerAuth` parses
const adminAuthHeaders = {
  [ADMIN_AUTH_HEADER]: `${ADMIN_AUTH_SCHEME} ${env.ADMIN_TOKEN}`,
};

export const $fetch = createFetch({
  baseURL,
  headers: adminAuthHeaders,
  credentials: "include",
  errorSchema: errorResSchema,
  timeout: FETCH_TIMEOUT_MS,
});

export const $fetchAndThrow = createFetch({
  baseURL,
  headers: adminAuthHeaders,
  throw: true,
  credentials: "include",
  errorSchema: errorResSchema,
  timeout: FETCH_TIMEOUT_MS,
});

export const $fetchAndRetry = createFetch({
  baseURL,
  headers: adminAuthHeaders,
  retry: {
    type: "linear",
    attempts: 2,
    delay: 500,
  },
  credentials: "include",
  errorSchema: errorResSchema,
  timeout: FETCH_TIMEOUT_MS,
});
