import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import { ADMIN_TOKEN_PATTERN } from "@repo/shared/admin-auth";

const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    API_URL: z.url(),
    WEB_URL: z.url(),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    ENCRYPTION_KEY: z.string().min(1),
    ADMIN_TOKEN: z
      .string()
      .min(32, "must be at least 32 characters")
      .regex(
        ADMIN_TOKEN_PATTERN,
        "must contain only letters, digits and . _ ~ + / - = characters — generate with: openssl rand -hex 32",
      ),
    // Comma-separated list of allowed CORS origins (e.g., "http://localhost:3120,https://app.example.com")
    CORS_ORIGINS: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

export default env;
