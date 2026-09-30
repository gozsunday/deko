import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import { ADMIN_TOKEN_PATTERN } from "@repo/shared/admin-auth";

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    API_URL: z.url(),
    DATABASE_URL: z.url(),
    ADMIN_TOKEN: z
      .string()
      .min(32, "must be at least 32 characters")
      .regex(
        ADMIN_TOKEN_PATTERN,
        "must contain only letters, digits and . _ ~ + / - = characters — generate with: openssl rand -hex 32",
      ),
  },

  clientPrefix: "VITE_",
  client: {},

  runtimeEnv: {
    // Server
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    API_URL: process.env.API_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    ADMIN_TOKEN: process.env.ADMIN_TOKEN,
  },
  emptyStringAsUndefined: true,
});
