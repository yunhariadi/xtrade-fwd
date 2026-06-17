# Requirements Document

## Introduction

Phase 1 (Foundation) establishes the foundational infrastructure for the ICT Forward Lab project — a web-based BTCUSDT Futures forward-testing system. This phase delivers the monorepo structure, a basic Next.js web app with a TradingView Lightweight Charts candlestick chart, a Fastify REST API serving candle data, and a PostgreSQL/TimescaleDB database with the candles schema. All subsequent phases build upon this foundation.

## Glossary

- **Web_App**: The Next.js frontend application located at `apps/web` that renders the BTCUSDT chart
- **API_Service**: The Fastify backend service located at `apps/api` that serves candle data via REST endpoints
- **Database**: The PostgreSQL instance with TimescaleDB extension storing candle time-series data
- **Candle**: A single OHLCV price bar representing price movement over a specific timeframe
- **Core_Package**: The shared TypeScript package at `packages/core` containing types and candle utilities
- **Chart_Component**: The React component using TradingView Lightweight Charts v5 to render candlestick data
- **Monorepo**: The pnpm workspace containing all apps and packages in a single repository
- **TimescaleDB**: A PostgreSQL extension optimized for time-series data, used for efficient candle storage and queries
- **Lightweight_Charts**: TradingView's open-source charting library (version 5) used for rendering candlestick charts

## Requirements

### Requirement 1: Monorepo Initialization

**User Story:** As a developer, I want a pnpm monorepo with clearly defined workspaces, so that all apps and packages share dependencies and build tooling consistently.

#### Acceptance Criteria

1. THE Monorepo SHALL use pnpm workspaces with a `pnpm-workspace.yaml` defining `apps/*` and `packages/*` as workspace directories
2. THE Monorepo SHALL contain a root `package.json` with shared development scripts for building, linting, and type-checking all workspaces
3. THE Monorepo SHALL include the following workspace packages: `apps/web`, `apps/api`, `packages/core`, `packages/strategies`, `packages/chart-drawings`
4. THE Core_Package SHALL export a `Candle` TypeScript interface with fields: `time` (number, Unix seconds), `open` (number), `high` (number), `low` (number), `close` (number), `volume` (number), `isClosed` (boolean)
5. THE Monorepo SHALL use TypeScript across all workspaces with a shared base `tsconfig.json` at the root

### Requirement 2: Next.js Web Application

**User Story:** As a developer, I want a Next.js web application with Tailwind CSS and ShadCN UI configured, so that I can build the trading interface with consistent styling.

#### Acceptance Criteria

1. THE Web_App SHALL be a Next.js application using the App Router and TypeScript
2. THE Web_App SHALL use Tailwind CSS for styling with a dark theme suitable for trading interfaces
3. THE Web_App SHALL have a single chart page at the root route (`/`) that renders the Chart_Component
4. THE Web_App SHALL depend on the Core_Package for shared type definitions

### Requirement 3: Fastify API Service

**User Story:** As a frontend developer, I want a REST API that serves historical candle data, so that the chart can display BTCUSDT price history.

#### Acceptance Criteria

1. THE API_Service SHALL be a Fastify application written in TypeScript
2. WHEN a GET request is made to `/api/health`, THE API_Service SHALL respond with HTTP 200 and a JSON body containing `{ "status": "ok" }`
3. WHEN a GET request is made to `/api/candles` with query parameters `symbol`, `timeframe`, and `limit`, THE API_Service SHALL return an array of Candle objects ordered by `time` ascending
4. WHEN the `limit` query parameter is not provided, THE API_Service SHALL default to returning 500 candles
5. WHEN the `limit` query parameter exceeds 1500, THE API_Service SHALL cap the result at 1500 candles
6. IF the Database connection fails, THEN THE API_Service SHALL respond with HTTP 503 and an error message indicating the service is unavailable
7. THE API_Service SHALL convert database `open_time` (TIMESTAMPTZ) to Unix seconds when returning Candle objects to the client
8. THE API_Service SHALL depend on the Core_Package for shared type definitions

### Requirement 4: Database Schema and Infrastructure

**User Story:** As a developer, I want a PostgreSQL database with TimescaleDB running in Docker, so that I can store and query time-series candle data efficiently.

#### Acceptance Criteria

1. THE Database SHALL be provisioned via a `docker-compose.yml` using the `timescale/timescaledb:latest-pg16` image
2. THE Database SHALL contain a `candles` table with columns: `id` (BIGSERIAL PRIMARY KEY), `exchange` (TEXT NOT NULL), `symbol` (TEXT NOT NULL), `timeframe` (TEXT NOT NULL), `open_time` (TIMESTAMPTZ NOT NULL), `close_time` (TIMESTAMPTZ NOT NULL), `open` (NUMERIC NOT NULL), `high` (NUMERIC NOT NULL), `low` (NUMERIC NOT NULL), `close` (NUMERIC NOT NULL), `volume` (NUMERIC NOT NULL), `is_closed` (BOOLEAN NOT NULL), `created_at` (TIMESTAMPTZ DEFAULT now())
3. THE Database SHALL enforce a unique constraint on `(exchange, symbol, timeframe, open_time)` to prevent duplicate candle entries
4. THE Database SHALL include a SQL migration file that creates the candles table and can be run idempotently
5. THE Docker Compose configuration SHALL expose PostgreSQL on port 5432 with credentials configurable via environment variables

### Requirement 5: Candlestick Chart Rendering

**User Story:** As a trader, I want to see BTCUSDT candlestick data rendered on a TradingView Lightweight Charts chart, so that I can visually analyze price action.

#### Acceptance Criteria

1. THE Chart_Component SHALL use TradingView Lightweight Charts version 5 with the `addSeries(CandlestickSeries)` pattern
2. WHEN the chart page loads, THE Chart_Component SHALL fetch candle data from the API_Service and render it as a candlestick chart
3. THE Chart_Component SHALL display a dark-themed chart with background color `#0b0f14`, text color `#d1d4dc`, and grid lines color `#1f2937`
4. THE Chart_Component SHALL enable time-axis visibility with `timeVisible: true` and `secondsVisible: false`
5. WHEN the API_Service returns an error, THE Chart_Component SHALL display an error state to the user instead of an empty chart
6. THE Chart_Component SHALL render candle data using the `time` field (Unix seconds) as the x-axis value

### Requirement 6: Candle Data Serialization

**User Story:** As a developer, I want consistent candle data serialization between the API and the frontend, so that data flows correctly through the system without format mismatches.

#### Acceptance Criteria

1. THE API_Service SHALL serialize candle records from the Database into the Core_Package `Candle` interface format
2. WHEN converting database rows to Candle objects, THE API_Service SHALL convert `open_time` TIMESTAMPTZ to Unix seconds (integer)
3. WHEN converting database rows to Candle objects, THE API_Service SHALL convert NUMERIC columns (`open`, `high`, `low`, `close`, `volume`) to JavaScript numbers
4. FOR ALL valid Candle objects, serializing to JSON and deserializing back SHALL produce an equivalent Candle object (round-trip property)
