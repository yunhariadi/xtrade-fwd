# Design Document: Phase 1 — Foundation

## Overview

Phase 1 establishes the foundational infrastructure for the ICT Forward Lab. The system consists of three main components: a Next.js frontend that renders BTCUSDT candlestick charts, a Fastify API that serves candle data from a PostgreSQL/TimescaleDB database, and a shared core package defining the data contracts.

The architecture follows a clean separation: the frontend only communicates with the API via REST, the API handles all database interaction and data transformation, and the core package provides shared TypeScript types ensuring type safety across the monorepo.

## Architecture

```mermaid
graph TB
    subgraph Monorepo["pnpm Monorepo"]
        subgraph Apps["apps/"]
            Web["apps/web<br/>Next.js + Lightweight Charts"]
            API["apps/api<br/>Fastify REST"]
        end
        subgraph Packages["packages/"]
            Core["packages/core<br/>Candle type + utilities"]
            Strategies["packages/strategies<br/>(stubs)"]
            ChartDrawings["packages/chart-drawings<br/>(stubs)"]
        end
    end
    
    subgraph Infra["Docker Compose"]
        DB["PostgreSQL + TimescaleDB<br/>candles table"]
    end
    
    Web -->|"GET /api/candles"| API
    Web -->|"GET /api/health"| API
    API -->|SQL queries| DB
    Web -.->|imports types| Core
    API -.->|imports types| Core
```

### Key Design Decisions

1. **pnpm over npm/yarn** — Strict dependency isolation, faster installs, and native workspace support without hoisting issues.

2. **Fastify over Express** — Built-in TypeScript support, JSON schema validation, and significantly faster request handling. Aligns with the README's recommendation.

3. **Lightweight Charts v5 API** — Uses the new `chart.addSeries(CandlestickSeries)` pattern (not the deprecated v4 `addCandlestickSeries()`). This is a hard requirement for future compatibility.

4. **Unix seconds at all boundaries** — The `Candle.time` field uses Unix seconds. Database stores `TIMESTAMPTZ` (which is lossless), and the API layer converts to Unix seconds on read. This matches Lightweight Charts' expected time format.

5. **NUMERIC columns for prices** — PostgreSQL `NUMERIC` avoids floating-point precision issues for financial data. Conversion to JavaScript `number` happens at the API layer (acceptable for display/charting purposes).

6. **Idempotent migrations** — SQL migrations use `IF NOT EXISTS` patterns so they can be re-run safely during development.

## Components and Interfaces

### 1. Core Package (`packages/core`)

Exports shared TypeScript types and utility functions used by both the web app and API.

```typescript
// packages/core/src/types/candle.ts
export interface Candle {
  time: number;      // Unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
}

// packages/core/src/types/api.ts
export interface CandleQueryParams {
  symbol: string;
  timeframe: string;
  limit?: number;
}

export interface HealthResponse {
  status: "ok" | "error";
  timestamp: number;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}
```

```typescript
// packages/core/src/candles/serialize.ts
export function dbRowToCandle(row: CandleRow): Candle {
  return {
    time: Math.floor(new Date(row.open_time).getTime() / 1000),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
    isClosed: row.is_closed,
  };
}

export function candleToJson(candle: Candle): string {
  return JSON.stringify(candle);
}

export function jsonToCandle(json: string): Candle {
  return JSON.parse(json) as Candle;
}
```

### 2. API Service (`apps/api`)

A Fastify application with two routes and a database connection pool.

```typescript
// apps/api/src/server.ts
import Fastify from "fastify";
import { candleRoutes } from "./routes/candles";
import { healthRoutes } from "./routes/health";
import { dbPlugin } from "./plugins/database";

const app = Fastify({ logger: true });

app.register(dbPlugin);
app.register(healthRoutes);
app.register(candleRoutes, { prefix: "/api" });

app.listen({ port: 3001, host: "0.0.0.0" });
```

```typescript
// apps/api/src/routes/candles.ts
interface CandleQuery {
  symbol: string;
  timeframe: string;
  limit?: number;
}

// GET /api/candles?symbol=BTCUSDT&timeframe=5m&limit=500
async function handler(request, reply) {
  const { symbol, timeframe, limit = 500 } = request.query as CandleQuery;
  const cappedLimit = Math.min(limit, 1500);
  
  const rows = await db.query(
    `SELECT * FROM candles 
     WHERE symbol = $1 AND timeframe = $2 AND is_closed = true
     ORDER BY open_time ASC 
     LIMIT $3`,
    [symbol, timeframe, cappedLimit]
  );
  
  return rows.map(dbRowToCandle);
}
```

```typescript
// apps/api/src/routes/health.ts
// GET /api/health
async function handler(request, reply) {
  try {
    await db.query("SELECT 1");
    return { status: "ok" };
  } catch {
    reply.status(503);
    return { status: "error", message: "Database unavailable" };
  }
}
```

### 3. Web App (`apps/web`)

A Next.js App Router application with a single chart page.

```typescript
// apps/web/app/page.tsx
export default function ChartPage() {
  return (
    <main className="h-screen w-screen bg-[#0b0f14]">
      <CandlestickChart symbol="BTCUSDT" timeframe="5m" />
    </main>
  );
}
```

```typescript
// apps/web/components/chart/CandlestickChart.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries } from "lightweight-charts";
import type { Candle } from "@ict-forward-lab/core";

interface Props {
  symbol: string;
  timeframe: string;
}

export function CandlestickChart({ symbol, timeframe }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: "solid", color: "#0b0f14" },
        textColor: "#d1d4dc",
      },
      grid: {
        vertLines: { color: "#1f2937" },
        horzLines: { color: "#1f2937" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries);

    fetch(`/api/candles?symbol=${symbol}&timeframe=${timeframe}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch candles");
        return res.json();
      })
      .then((data: Candle[]) => {
        candleSeries.setData(data);
        chart.timeScale().fitContent();
      })
      .catch((err) => setError(err.message));

    return () => chart.remove();
  }, [symbol, timeframe]);

  if (error) return <div className="text-red-500 p-4">{error}</div>;
  return <div ref={containerRef} className="w-full h-full" />;
}
```

### 4. Database Plugin (`apps/api/src/plugins/database.ts`)

Uses `pg` (node-postgres) with a connection pool.

```typescript
import { Pool } from "pg";
import fp from "fastify-plugin";

export const dbPlugin = fp(async (fastify) => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 
      "postgresql://postgres:postgres@localhost:5432/ict_forward_lab",
  });

  fastify.decorate("db", pool);
  fastify.addHook("onClose", () => pool.end());
});
```

### 5. Stub Packages

```typescript
// packages/strategies/src/index.ts
export interface StrategyModule {
  name: string;
  version: string;
  run: (candles: Candle[]) => void; // stub
}

// packages/chart-drawings/src/index.ts
export interface ChartDrawingPlugin {
  id: string;
  type: string;
  render: () => void; // stub
}
```

## Data Models

### Database: `candles` Table

| Column      | Type         | Constraints              | Description                         |
|-------------|--------------|--------------------------|-------------------------------------|
| id          | BIGSERIAL    | PRIMARY KEY              | Auto-increment identifier           |
| exchange    | TEXT         | NOT NULL                 | Exchange name (e.g., "binance")     |
| symbol      | TEXT         | NOT NULL                 | Trading pair (e.g., "BTCUSDT")      |
| timeframe   | TEXT         | NOT NULL                 | Candle timeframe (e.g., "5m")       |
| open_time   | TIMESTAMPTZ  | NOT NULL                 | Candle open timestamp               |
| close_time  | TIMESTAMPTZ  | NOT NULL                 | Candle close timestamp              |
| open        | NUMERIC      | NOT NULL                 | Open price                          |
| high        | NUMERIC      | NOT NULL                 | High price                          |
| low         | NUMERIC      | NOT NULL                 | Low price                           |
| close       | NUMERIC      | NOT NULL                 | Close price                         |
| volume      | NUMERIC      | NOT NULL                 | Trading volume                      |
| is_closed   | BOOLEAN      | NOT NULL                 | Whether candle is finalized         |
| created_at  | TIMESTAMPTZ  | DEFAULT now()            | Row insertion timestamp             |

**Unique constraint:** `(exchange, symbol, timeframe, open_time)`

### API Response: `Candle` (JSON)

```json
{
  "time": 1700000000,
  "open": 37250.5,
  "high": 37300.0,
  "low": 37200.0,
  "close": 37280.3,
  "volume": 125.7,
  "isClosed": true
}
```

### Data Flow

```mermaid
graph LR
    DB["PostgreSQL<br/>TIMESTAMPTZ + NUMERIC"] -->|"dbRowToCandle()"| API["API Layer<br/>Candle interface"]
    API -->|"JSON response"| Web["Web App<br/>Lightweight Charts"]
```

Transformation rules:
- `open_time` (TIMESTAMPTZ) → `Math.floor(date.getTime() / 1000)` → `time` (Unix seconds)
- `NUMERIC` columns → `Number()` → JavaScript `number`
- `is_closed` (boolean) → `isClosed` (boolean, renamed for JS convention)

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Candle ordering invariant

*For any* valid combination of `symbol`, `timeframe`, and `limit` parameters, the array of Candle objects returned by `GET /api/candles` SHALL have each element's `time` field strictly less than or equal to the next element's `time` field (i.e., the result is sorted ascending by time).

**Validates: Requirements 3.3**

### Property 2: Limit capping

*For any* `limit` value greater than 1500, the number of Candle objects returned by `GET /api/candles` SHALL not exceed 1500.

**Validates: Requirements 3.5**

### Property 3: Timestamp conversion correctness

*For any* valid `TIMESTAMPTZ` value stored in the `open_time` column, the `dbRowToCandle` function SHALL produce a `time` field equal to `Math.floor(date.getTime() / 1000)` — the Unix seconds representation of that timestamp.

**Validates: Requirements 3.7, 6.2**

### Property 4: Numeric conversion correctness

*For any* valid PostgreSQL `NUMERIC` string value in the price/volume columns (`open`, `high`, `low`, `close`, `volume`), the `dbRowToCandle` function SHALL produce a JavaScript `number` equal to `Number(numericString)` with no loss of value for values within safe integer range or standard decimal precision.

**Validates: Requirements 6.3**

### Property 5: Candle JSON round-trip

*For any* valid Candle object, serializing it to JSON with `JSON.stringify` and deserializing with `JSON.parse` SHALL produce an object with identical field values to the original.

**Validates: Requirements 6.4**

### Property 6: Unique constraint enforcement

*For any* candle record with a given `(exchange, symbol, timeframe, open_time)` tuple, inserting a second record with the same tuple SHALL be rejected by the database.

**Validates: Requirements 4.3**

## Error Handling

### API Service Errors

| Scenario | HTTP Status | Response Body |
|----------|-------------|---------------|
| Database unreachable | 503 | `{ "error": "service_unavailable", "message": "Database connection failed" }` |
| Missing required query param | 400 | `{ "error": "bad_request", "message": "Parameter 'symbol' is required" }` |
| Invalid timeframe value | 400 | `{ "error": "bad_request", "message": "Invalid timeframe. Valid: 1m, 5m, 15m, 1h, 4h" }` |
| Internal server error | 500 | `{ "error": "internal_error", "message": "An unexpected error occurred" }` |

### Frontend Error Handling

- **API fetch failure**: Display error banner with retry button; do not render empty chart
- **Chart initialization failure**: Display fallback message with diagnostic info
- **Empty data response**: Display message indicating no candle data is available for the selected parameters

### Database Error Handling

- Connection pool retries with exponential backoff (3 attempts)
- Query timeout set to 10 seconds
- Migration failures halt startup with clear error message

## Testing Strategy

### Unit Tests

Focus on specific examples, edge cases, and error conditions:

- `dbRowToCandle()` with known input/output pairs
- API route handlers with mocked database
- Health check endpoint behavior (success and failure scenarios)
- Query parameter validation (missing params, invalid values)
- Limit capping boundary (limit=1500, limit=1501)
- Chart component renders with mock data
- Chart component shows error state on fetch failure

### Property-Based Tests

Using [fast-check](https://github.com/dubzzz/fast-check) for TypeScript property-based testing. Each property test runs a minimum of 100 iterations.

| Property | Test Description | Generator Strategy |
|----------|-----------------|-------------------|
| Property 1: Candle ordering | Seed DB with random candles, query via API, verify ascending order | Random timestamps, random symbols/timeframes |
| Property 2: Limit capping | Generate random limit values > 1500, verify response length ≤ 1500 | `fc.integer({ min: 1501, max: 100000 })` |
| Property 3: Timestamp conversion | Generate random Date objects, convert to TIMESTAMPTZ string, run through `dbRowToCandle`, verify Unix seconds | `fc.date()` converted to ISO strings |
| Property 4: Numeric conversion | Generate random numeric strings with varying precision, verify `Number()` conversion | `fc.float()` and `fc.double()` as string |
| Property 5: JSON round-trip | Generate random valid Candle objects, stringify + parse, compare | Custom `fc.record()` for Candle shape |
| Property 6: Unique constraint | Generate random candle tuples, insert twice, verify second fails | Random exchange/symbol/timeframe/time combos |

**Property test configuration:**
- Library: `fast-check` (latest)
- Minimum iterations: 100 per property
- Each test tagged with: `Feature: phase1-foundation, Property {N}: {title}`

### Integration Tests

- Docker Compose stack starts successfully
- Migration creates candles table
- Full request cycle: insert seed data → GET /api/candles → verify response structure
- Health endpoint returns 503 when DB is stopped

### Test Organization

```
apps/api/src/__tests__/
  routes/
    candles.test.ts          (unit + property tests for candle routes)
    health.test.ts           (unit tests for health endpoint)
  plugins/
    database.test.ts         (connection pool tests)

packages/core/src/__tests__/
  candles/
    serialize.test.ts        (unit + property tests for serialization)
    serialize.property.ts    (property-only tests: round-trip, conversions)
```

