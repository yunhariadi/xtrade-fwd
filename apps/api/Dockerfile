# Fastify API image. Build context is the repo ROOT (see docker-compose.yml)
# so the pnpm workspace and its `workspace:*` packages resolve.
#
#   docker build -f apps/api/Dockerfile -t ict-api .
FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
# Activate the pinned pnpm in the shared base layer so the runtime stage has it
# cached and never needs to download at container start (offline-safe).
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# --- install deps + build api and its workspace deps ---
FROM base AS build
# Copy manifests first so `pnpm install` is cached unless deps change.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.json ./
COPY packages/core/package.json packages/core/
COPY packages/strategies/package.json packages/strategies/
COPY packages/chart-drawings/package.json packages/chart-drawings/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mcp/package.json apps/mcp/
RUN pnpm install --frozen-lockfile
COPY . .
# "@ict-forward-lab/api..." builds the API plus its workspace dependencies in order.
RUN pnpm --filter "@ict-forward-lab/api..." build

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app
EXPOSE 3001
# Apply idempotent migrations (CREATE TABLE IF NOT EXISTS) then start the server.
# The API runs via tsx (like dev): the TS build targets a bundler
# (module: ESNext, moduleResolution: bundler) and emits extensionless ESM
# imports that Node's native loader can't resolve, but tsx resolves them.
#
# `exec node` (not `pnpm start`) so node becomes PID 1 and receives docker's
# SIGTERM directly — through the sh→pnpm→node chain the signal never arrived,
# so graceful shutdown (delta-bucket flush, WS teardown) silently never ran.
CMD ["sh", "-c", "pnpm --filter @ict-forward-lab/api migrate && cd apps/api && exec node --import tsx src/server.ts"]
