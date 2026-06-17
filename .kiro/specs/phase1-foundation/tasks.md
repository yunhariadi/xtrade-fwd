# Implementation Plan: Phase 1 — Foundation

## Overview

This plan implements the ICT Forward Lab monorepo foundation: pnpm workspace configuration, shared core package, Fastify API with candle endpoints, PostgreSQL/TimescaleDB via Docker Compose, and a Next.js web app rendering BTCUSDT candlesticks on TradingView Lightweight Charts v5.

## Tasks

- [x] 1. Initialize monorepo and workspace structure
  - [x] 1.1 Create root `package.json` with `name: "ict-forward-lab"`, scripts for `build`, `lint`, `typecheck` across all workspaces
    - Use `pnpm -r run` pattern for workspace-wide scripts
    - _Requirements: 1.1, 1.2_
  - [x] 1.2 Create `pnpm-workspace.yaml` with `apps/*` and `packages/*` entries
    - _Requirements: 1.1_
  - [x] 1.3 Create root `tsconfig.json` as a shared base TypeScript configuration
    - Set `strict: true`, `module: "ESNext"`, `target: "ES2022"`, `moduleResolution: "bundler"`
    - All workspace packages will extend this config
    - _Requirements: 1.5_
  - [x] 1.4 Create directory scaffolding for `apps/web`, `apps/api`, `packages/core`, `packages/strategies`, `packages/chart-drawings`
    - Each package gets its own `package.json` and `tsconfig.json` extending root
    - _Requirements: 1.3_

- [x] 2. Implement core package (`packages/core`)
  - [x] 2.1 Create `packages/core/src/types/candle.ts` with the `Candle` interface
    - Fields: `time` (number, Unix seconds), `open`, `high`, `low`, `close`, `volume` (all number), `isClosed` (boolean)
    - Also create `CandleRow` interface matching database column names/types (for internal use)
    - _Requirements: 1.4_
  - [x] 2.2 Create `packages/core/src/types/api.ts` with `CandleQueryParams`, `HealthResponse`, and `ApiError` interfaces
    - _Requirements: 1.4, 3.2, 3.3_
  - [x] 2.3 Create `packages/core/src/candles/serialize.ts` with `dbRowToCandle`, `candleToJson`, and `jsonToCandle` functions
    - `dbRowToCandle`: converts `open_time` (string/Date) to Unix seconds, NUMERIC strings to numbers, `is_closed` to `isClosed`
    - `candleToJson`: JSON.stringify wrapper
    - `jsonToCandle`: JSON.parse wrapper with type assertion
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 3.7_
  - [x] 2.4 Create `packages/core/src/index.ts` barrel export
    - Export all types and utility functions
    - _Requirements: 1.4_
  - [ ]* 2.5 Write property tests for candle serialization (`packages/core/src/__tests__/serialize.property.ts`)
    - **Property 3: Timestamp conversion correctness** — Generate random Date objects, convert to ISO string, run through `dbRowToCandle`, verify `time` equals `Math.floor(date.getTime() / 1000)`
    - **Property 4: Numeric conversion correctness** — Generate random numeric strings, verify `Number()` conversion is correct
    - **Property 5: Candle JSON round-trip** — Generate random valid Candle objects, verify `jsonToCandle(candleToJson(candle))` produces equivalent object
    - **Validates: Requirements 6.2, 6.3, 6.4**

- [x] 3. Implement stub packages
  - [x] 3.1 Create `packages/strategies/src/index.ts` with `StrategyModule` interface stub and `packages/strategies/package.json`
    - _Requirements: 1.3_
  - [x] 3.2 Create `packages/chart-drawings/src/index.ts` with `ChartDrawingPlugin` interface stub and `packages/chart-drawings/package.json`
    - _Requirements: 1.3_

- [x] 4. Set up Docker Compose and database
  - [x] 4.1 Create `docker-compose.yml` with TimescaleDB service
    - Image: `timescale/timescaledb:latest-pg16`
    - Port: 5432
    - Environment: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (default: postgres/postgres/ict_forward_lab)
    - Volume: `postgres_data` for persistence
    - _Requirements: 4.1, 4.5_
  - [x] 4.2 Create SQL migration file at `apps/api/src/database/migrations/001_create_candles.sql`
    - `CREATE TABLE IF NOT EXISTS candles` with all specified columns
    - `CREATE UNIQUE INDEX IF NOT EXISTS` on (exchange, symbol, timeframe, open_time)
    - Idempotent — safe to run multiple times
    - _Requirements: 4.2, 4.3, 4.4_
  - [x] 4.3 Create migration runner script (`apps/api/src/database/migrate.ts`) that connects to DB and executes migration files
    - Reads DATABASE_URL from env
    - Runs all `.sql` files in the migrations directory
    - _Requirements: 4.4_
  - [ ]* 4.4 Write property test for unique constraint enforcement
    - **Property 6: Unique constraint enforcement** — Generate random candle tuples, insert once successfully, insert same tuple again, verify rejection
    - **Validates: Requirements 4.3**

- [x] 5. Checkpoint
  - Ensure all packages build with `pnpm -r run build`, Docker Compose starts, migration runs successfully. Ask the user if questions arise.

- [x] 6. Implement Fastify API service (`apps/api`)
  - [x] 6.1 Set up Fastify app entry point (`apps/api/src/server.ts`)
    - Create Fastify instance with logger enabled
    - Register database plugin, health routes, candle routes
    - Listen on port 3001
    - _Requirements: 3.1_
  - [x] 6.2 Create database plugin (`apps/api/src/plugins/database.ts`)
    - Use `pg` Pool with `DATABASE_URL` from environment
    - Decorate Fastify instance with `db` property
    - Close pool on app shutdown
    - _Requirements: 3.1_
  - [x] 6.3 Implement health route (`apps/api/src/routes/health.ts`)
    - `GET /api/health` — runs `SELECT 1` against DB
    - Returns `{ "status": "ok" }` with 200 on success
    - Returns 503 with error message on DB failure
    - _Requirements: 3.2, 3.6_
  - [x] 6.4 Implement candles route (`apps/api/src/routes/candles.ts`)
    - `GET /api/candles` with query params: `symbol` (required), `timeframe` (required), `limit` (optional, default 500, max 1500)
    - Query database for closed candles matching symbol/timeframe, ordered by open_time ASC
    - Map rows through `dbRowToCandle()` from core package
    - Return JSON array
    - _Requirements: 3.3, 3.4, 3.5, 3.7, 6.1, 6.2, 6.3_
  - [ ]* 6.5 Write property tests for candle API route
    - **Property 1: Candle ordering invariant** — Seed DB with random candles (varying timestamps), call GET /api/candles, verify response array is sorted ascending by `time`
    - **Property 2: Limit capping** — Generate random limit values > 1500, verify response length never exceeds 1500
    - **Validates: Requirements 3.3, 3.5**
  - [ ]* 6.6 Write unit tests for API routes
    - Health endpoint returns 200 with `{ status: "ok" }`
    - Health endpoint returns 503 when DB is unavailable
    - Candles endpoint returns 400 for missing `symbol` param
    - Candles endpoint defaults to 500 limit when not specified
    - Candles endpoint caps limit at 1500
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 7. Create seed data script
  - [x] 7.1 Create `apps/api/src/database/seed.ts` that inserts sample BTCUSDT 5m candles into the database
    - Generate or hardcode ~500 sample candles with realistic BTCUSDT price data
    - Use exchange="binance", symbol="BTCUSDT", timeframe="5m"
    - Timestamps should cover a continuous 5-minute interval series
    - Useful for local development and chart testing
    - _Requirements: 3.3, 5.2_

- [x] 8. Implement Next.js web app (`apps/web`)
  - [x] 8.1 Initialize Next.js app with App Router, TypeScript, Tailwind CSS
    - Configure `next.config.ts` with transpilePackages for workspace dependencies
    - Set up Tailwind with dark trading theme colors (background: #0b0f14, etc.)
    - Add `@ict-forward-lab/core` as dependency
    - _Requirements: 2.1, 2.2, 2.4_
  - [x] 8.2 Create `CandlestickChart` component (`apps/web/components/chart/CandlestickChart.tsx`)
    - Install `lightweight-charts` v5
    - Use `createChart()` and `chart.addSeries(CandlestickSeries)` API pattern
    - Chart options: dark background (#0b0f14), text (#d1d4dc), grid (#1f2937)
    - TimeScale: `timeVisible: true`, `secondsVisible: false`
    - Fetch candles from API on mount, call `candleSeries.setData(candles)`, then `chart.timeScale().fitContent()`
    - Show error state (red text message) if fetch fails
    - Clean up chart on unmount with `chart.remove()`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  - [x] 8.3 Create root page (`apps/web/app/page.tsx`)
    - Full-screen dark layout rendering the `CandlestickChart` component
    - Props: `symbol="BTCUSDT"`, `timeframe="5m"`
    - _Requirements: 2.3_
  - [x] 8.4 Configure Next.js API proxy (rewrites in `next.config.ts`)
    - Rewrite `/api/*` requests to `http://localhost:3001/api/*` during development
    - Allows frontend to call `/api/candles` without CORS issues
    - _Requirements: 5.2_
  - [ ]* 8.5 Write unit tests for CandlestickChart component
    - Verify `createChart` is called with correct theme options
    - Verify `addSeries(CandlestickSeries)` is used (not deprecated v4 API)
    - Verify error state renders when fetch fails
    - _Requirements: 5.1, 5.3, 5.5_

- [x] 9. Create environment configuration
  - [x] 9.1 Create `.env.example` at root with all required environment variables
    - `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ict_forward_lab`
    - `API_PORT=3001`
    - `WEB_PORT=3000`
    - Add `.env` to `.gitignore`
    - _Requirements: 4.5_

- [x] 10. Final checkpoint
  - Run `docker compose up -d` to start TimescaleDB
  - Run migration and seed scripts
  - Start API service, verify `GET /api/health` returns 200
  - Start web app, verify chart renders with seeded candle data
  - Ensure all tests pass. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Property tests use `fast-check` library with minimum 100 iterations per property
- All TypeScript code shares the root `tsconfig.json` base configuration
- The seed data script provides immediate visual feedback when the chart page loads
- Next.js API rewrites avoid CORS complexity during local development
