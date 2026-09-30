import { extractApiErrorBody } from "./error";
import {
  getCatalogEntry,
  shouldSurfaceGlobally,
  type ErrorCatalogEntry,
} from "./error-catalog";

/**
 * Read the API error code off a failure, or undefined when the request never
 * produced an API response body.
 */
export const extractErrorCode = (error: unknown): string | undefined =>
  extractApiErrorBody(error)?.code;

/**
 * True when the failure should be surfaced globally, i.e. it is `blocking` or
 * `transient` in the catalog.
 */
export const shouldSurfaceError = (error: unknown): boolean =>
  shouldSurfaceGlobally(getCatalogEntry(extractErrorCode(error)));

/**
 * Failures from one error code, collapsed across every query that hit it.
 */
export type ApiFailureGroup = {
  /** The API error code, or undefined for a network-level failure. */
  code: string | undefined;
  entry: ErrorCatalogEntry;
  /** How many queries failed with this code. */
  count: number;
};
