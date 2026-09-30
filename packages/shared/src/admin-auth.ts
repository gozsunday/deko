// error codes the API returns from the admin-auth middleware
export const ADMIN_AUTH_ERROR_CODES = {
  missing: "MISSING_ADMIN_TOKEN",
  invalid: "INVALID_ADMIN_TOKEN",
  malformed: "MALFORMED_ADMIN_TOKEN",
} as const;

export type AdminAuthErrorCode =
  (typeof ADMIN_AUTH_ERROR_CODES)[keyof typeof ADMIN_AUTH_ERROR_CODES];

export const ADMIN_AUTH_HEADER = "Authorization";
export const ADMIN_AUTH_SCHEME = "Bearer";
export const ADMIN_AUTH_ENV_VAR = "ADMIN_TOKEN";
export const ADMIN_TOKEN_PATTERN = /^[A-Za-z0-9._~+/-]+=*$/;
