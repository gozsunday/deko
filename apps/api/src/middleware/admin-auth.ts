import { bearerAuth } from "hono/bearer-auth";

import {
  ADMIN_AUTH_ENV_VAR,
  ADMIN_AUTH_ERROR_CODES,
} from "@repo/shared/admin-auth";

import env from "@/lib/env";
import { errorResponse } from "@/lib/utils";

// this gets the admin auth token from the bearer token and authenticates it
export const adminAuth = bearerAuth({
  token: env.ADMIN_TOKEN,

  // appears in the `WWW-Authenticate` challenge so a client knows which
  // protection scheme is in play
  realm: "deko",

  // return custom err res when req does not have an auth header
  noAuthenticationHeader: {
    message: errorResponse(
      ADMIN_AUTH_ERROR_CODES.missing,
      `Missing admin token. Provide an 'Authorization: Bearer <${ADMIN_AUTH_ENV_VAR}>' header.`,
    ),
  },

  // return custom err res when the token in invalid
  invalidToken: {
    message: errorResponse(
      ADMIN_AUTH_ERROR_CODES.invalid,
      "Invalid admin token.",
    ),
  },

  // return custom err res when auth header format is invalid. returns 400.
  invalidAuthenticationHeader: {
    message: errorResponse(
      ADMIN_AUTH_ERROR_CODES.malformed,
      `Malformed Authorization header. Expected 'Authorization: Bearer <${ADMIN_AUTH_ENV_VAR}>'.`,
    ),
  },
});
