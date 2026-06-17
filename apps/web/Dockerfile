# Next.js web image. Build context is the repo ROOT (see docker-compose.yml).
#
#   docker build -f apps/web/Dockerfile -t ict-web .
#
# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time, so the
# public WS URL must be passed as a build arg (rebuild to change it). The /api
# proxy target is read at server START from API_PROXY_TARGET (runtime env).
FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
# Activate the pinned pnpm in the shared base layer so the runtime stage has it
# cached and never needs to download at container start (offline-safe).
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# --- install deps + build web and its workspace deps ---
FROM base AS build
ARG NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
ARG NEXT_PUBLIC_REQUIRE_LOGIN=false
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_REQUIRE_LOGIN=$NEXT_PUBLIC_REQUIRE_LOGIN
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.json ./
COPY packages/core/package.json packages/core/
COPY packages/strategies/package.json packages/strategies/
COPY packages/chart-drawings/package.json packages/chart-drawings/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mcp/package.json apps/mcp/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter "@ict-forward-lab/web..." build

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
