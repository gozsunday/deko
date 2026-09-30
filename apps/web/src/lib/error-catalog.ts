/**
 * `blocking`  — nothing will load and only a config change fixes it. Non-dismissible.
 * `transient` — the API or network is unavailable; a retry may well succeed.
 * `silent`    — already reported somewhere better. The app toasts every mutation
 *                failure and each data page renders its own inline error state,
 *                so surfacing these globally would double-report a single click.
 */
export type ErrorSeverity = "blocking" | "transient" | "silent";

export type ErrorCatalogEntry =
  | { severity: "blocking" | "transient"; title: string; body: string }
  | { severity: "silent" };

/**
 * The subset of entries that carry copy. A discriminated union on `severity`
 * means callers that hold one of these can read `.title`/`.body` without
 * checking, and callers holding a full `ErrorCatalogEntry` are forced to decide
 * what to do about the `silent` case rather than silently rendering nothing.
 */
export type SurfacedErrorCatalogEntry = Extract<
  ErrorCatalogEntry,
  { severity: "blocking" | "transient" }
>;

/**
 * Used for any code absent from the catalog, and for failures that are not API
 * errors at all. Treated as transient on purpose.
 */
export const FALLBACK_ERROR_ENTRY: ErrorCatalogEntry = {
  severity: "transient",
  title: "Couldn't load data from the Deko API",
  body: "Something went wrong while loading your data. The details are in the api container's logs.",
};

const AUTH_FAILURE_BODY =
  "The web app's ADMIN_TOKEN was rejected by the API, so no data can be loaded. Set an identical ADMIN_TOKEN in both the api and web services, restart the web container, and reload this page.";

export const ERROR_CATALOG: Record<string, ErrorCatalogEntry> = {
  // ── blocking: credential / configuration ──
  MISSING_ADMIN_TOKEN: {
    severity: "blocking",
    title: "Deko API authentication failed",
    body: AUTH_FAILURE_BODY,
  },
  INVALID_ADMIN_TOKEN: {
    severity: "blocking",
    title: "Deko API authentication failed",
    body: AUTH_FAILURE_BODY,
  },
  MALFORMED_ADMIN_TOKEN: {
    severity: "blocking",
    title: "Deko API configuration is invalid",
    body: "The ADMIN_TOKEN contains characters the API cannot accept. Use only letters, digits and . _ ~ + / - =.",
  },
  UNAUTHORIZED: {
    severity: "blocking",
    title: "Deko API authentication failed",
    body: AUTH_FAILURE_BODY,
  },

  // ── transient: API or network unavailable ──
  // the empty-string key is meaningful: a failure with no code at all means the
  // request never produced an API response body. keying it here gives that case
  // real copy instead of the generic fallback.
  "": {
    severity: "transient",
    title: "Cannot reach the Deko API",
    body: "The web app could not reach the API, so no data can be loaded. Check that the api service is running and that API_URL is correct.",
  },
  GATEWAY_TIMEOUT: {
    severity: "transient",
    title: "The Deko API took too long to respond",
    body: "A query exceeded the 90s limit. This usually means a large time range over a lot of data — try selecting a shorter period.",
  },
  TOO_MANY_REQUESTS: {
    severity: "transient",
    title: "Too many requests",
    body: "The API is rate limiting requests. This normally clears on its own within a moment.",
  },
  INTERNAL_SERVER_ERROR: { ...FALLBACK_ERROR_ENTRY },
  BAD_GATEWAY: { ...FALLBACK_ERROR_ENTRY },
  SERVICE_UNAVAILABLE: { ...FALLBACK_ERROR_ENTRY },
  SERVER_ERROR: { ...FALLBACK_ERROR_ENTRY },

  // ── silent: already reported by a toast or a page's inline error state ──
  NOT_FOUND: { severity: "silent" },
  SERVICE_NOT_FOUND: { severity: "silent" },
  TOKEN_NOT_FOUND: { severity: "silent" },
  INVALID_DATA: { severity: "silent" },
  INVALID_CURSOR: { severity: "silent" },
  SERVICE_HAS_TOKENS: { severity: "silent" },
  CONFLICT: { severity: "silent" },
  UNPROCESSABLE_ENTITY: { severity: "silent" },
  BAD_REQUEST: { severity: "silent" },
  FORBIDDEN: { severity: "silent" },
  METHOD_NOT_ALLOWED: { severity: "silent" },
  CLIENT_ERROR: { severity: "silent" },

  // Ingest-only: emitted by POST /api/ingest, which the web app never calls
  // (SDKs and simulators do). Catalogued for completeness so the classification
  // covers the whole API surface.
  MISSING_TOKEN: { severity: "silent" },
  INVALID_TOKEN: { severity: "silent" },
  BATCH_TOO_LARGE: { severity: "silent" },
  PAYLOAD_TOO_LARGE: { severity: "silent" },
  NO_VALID_EVENTS: { severity: "silent" },
};

/**
 * Resolves an error code to its classification.
 *
 * An empty string is a meaningful key (see the catalog entry above), so this
 * distinguishes `undefined` from `""`.
 */
export const getCatalogEntry = (
  code: string | undefined,
): ErrorCatalogEntry => {
  const key = code ?? "";

  return Object.hasOwn(ERROR_CATALOG, key)
    ? ERROR_CATALOG[key]
    : FALLBACK_ERROR_ENTRY;
};

/** True when this failure belongs in the global banner (and the route error card). */
export const shouldSurfaceGlobally = (entry: ErrorCatalogEntry): boolean =>
  entry.severity !== "silent";

/** Narrow an entry to the variant that carries user-facing copy. */
export const toSurfacedEntry = (
  entry: ErrorCatalogEntry,
): SurfacedErrorCatalogEntry =>
  entry.severity === "silent" ? FALLBACK_ERROR_ENTRY : entry;
