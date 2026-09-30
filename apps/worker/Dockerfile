FROM oven/bun:1.3.14 AS base

# --- PREPARE STAGE ---
FROM base AS prepare
WORKDIR /app

# Install turbo globally
RUN bun add -g turbo@2.9.6

# Copy everything
COPY . .

# Generate a partial monorepo with a pruned lockfile for a target workspace.
RUN turbo prune @repo/worker --docker

# --- BUILDER STAGE ---
FROM base AS builder
WORKDIR /app

# Prune and copy dependencies (as they change less often)
COPY --from=prepare /app/out/json/ .

# Install dependencies
RUN bun install --frozen-lockfile

# Copy the rest of the files (as they change more often)
COPY --from=prepare /app/out/full/ .

# Build the app
RUN bunx turbo run build

# --- RUNNER STAGE ---
FROM base AS runner
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production \
    HOSTNAME="0.0.0.0"

COPY --from=builder /app/apps/worker/worker-exe ./worker-exe

USER bun

ENTRYPOINT [ "/bin/sh", "-c", "./worker-exe" ]