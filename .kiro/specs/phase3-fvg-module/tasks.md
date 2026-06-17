# Implementation Plan: Phase 3 — FVG Module

## Overview

This plan implements Fair Value Gap (FVG) detection, tracking, real-time broadcasting, REST API, and chart rendering for the ICT Forward Lab. The module uses pure functions for detection logic, a stateful tracker for lifecycle management, WebSocket events for real-time updates, and Lightweight Charts v5 custom primitives for visualization.

## Tasks

- [x] 1. Define shared FVG types in `packages/core`
  - [x] 1.1 Create `packages/core/src/types/fvg.ts` with `FvgZone` interface
    - Fields: `id` (string), `direction` ("bullish" | "bearish"), `fromTime` (number), `toTime` (number), `top` (number), `bottom` (number), `status` ("active" | "mitigated")
    - _Requirements: 1.2, 2.2, 3.4_
  - [x] 1.2 Add FVG WebSocket message types to `packages/core/src/types/ws-messages.ts`
    - Define `WsFvgEventType` = "fvg:created" | "fvg:mitigated"
    - Define `WsFvgCreatedMessage` with `event`, `data: { symbol, timeframe, zone: FvgZone }`
    - Define `WsFvgMitigatedMessage` with `event`, `data: { symbol, timeframe, zoneId, status }`
    - Define union type `WsFvgMessage`
    - Update `parseWsMessage()` to handle FVG event types
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 1.3 Export new types from `packages/core/src/index.ts` barrel
    - Export `FvgZone`, `WsFvgCreatedMessage`, `WsFvgMitigatedMessage`, `WsFvgMessage`
    - _Requirements: 1.2, 5.3_

- [ ] 2. Implement FVG detection pure functions (`packages/strategies/src/fvg/`)
  - [x] 2.1 Create `packages/strategies/src/fvg/detect.ts` with detection functions
    - `isBullishFvg(candles, i)`: return `i >= 2 && candles[i].low > candles[i-2].high`
    - `isBearishFvg(candles, i)`: return `i >= 2 && candles[i].high < candles[i-2].low`
    - `createBullishFvgZone(candles, i)`: return FvgZone with top=candle[i].low, bottom=candle[i-2].high, or null
    - `createBearishFvgZone(candles, i)`: return FvgZone with top=candle[i-2].low, bottom=candle[i].high, or null
    - `detectAllFvgs(candles)`: scan entire array, return FvgZone[] for all detected gaps
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4_
  - [x] 2.2 Create `packages/strategies/src/fvg/mitigation.ts` with mitigation check
    - `checkMitigation(zone, candle)`: for bullish, return `candle.close <= zone.top`; for bearish, return `candle.close >= zone.bottom`
    - _Requirements: 3.2, 3.3_
  - [x] 2.3 Create `packages/strategies/src/fvg/index.ts` barrel export
    - Re-export all functions from detect.ts and mitigation.ts
    - _Requirements: 1.1, 2.1_
  - [x] 2.4 Update `packages/strategies/src/index.ts` to export fvg module
    - Add `export * from "./fvg"`
    - _Requirements: 1.1, 2.1_
  - [~] 2.5 Write property tests for FVG detection (`packages/strategies/src/fvg/__tests__/detect.property.ts`)
    - **Property 1: Bullish FVG Detection Correctness** — For any candle array and index i >= 2, `isBullishFvg` returns true iff `candles[i].low > candles[i-2].high`
    - **Property 2: Bullish FVG Zone Boundaries** — For any valid bullish FVG, zone.top === candles[i].low and zone.bottom === candles[i-2].high
    - **Property 3: Bearish FVG Detection Correctness** — For any candle array and index i >= 2, `isBearishFvg` returns true iff `candles[i].high < candles[i-2].low`
    - **Property 4: Bearish FVG Zone Boundaries** — For any valid bearish FVG, zone.top === candles[i-2].low and zone.bottom === candles[i].high
    - Use `fast-check` with minimum 100 iterations per property
    - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 2.4_
  - [~] 2.6 Write property tests for mitigation (`packages/strategies/src/fvg/__tests__/mitigation.property.ts`)
    - **Property 5: Mitigation Correctness** — For any zone and candle, checkMitigation returns true iff (bullish: candle.close <= zone.top) or (bearish: candle.close >= zone.bottom)
    - Use `fast-check` with minimum 100 iterations
    - _Requirements: 3.2, 3.3_
  - [x] 2.7 Install `fast-check` and `vitest` as devDependencies in `packages/strategies`
    - Run `pnpm add -D fast-check vitest` in packages/strategies
    - Add `"test": "vitest --run"` script to package.json
    - _Requirements: 1.1, 2.1_

- [ ] 3. Implement FvgTracker (`apps/api/src/fvg/`)
  - [x] 3.1 Create `apps/api/src/fvg/fvg-tracker.ts` with `FvgTracker` class
    - Constructor accepts `FvgTrackerOptions` with `wsServer: WsServer`
    - Maintain `zones: Map<string, FvgZone[]>` keyed by `${symbol}:${timeframe}`
    - Implement `onCandleClosed(candle, symbol, timeframe)`:
      1. Get recent candles (maintain last 3 candles per key in a buffer)
      2. Call `isBullishFvg` / `isBearishFvg` on the latest triplet
      3. If detected, create zone, add to collection, broadcast `fvg:created`
      4. Check all active zones for mitigation, update status, broadcast `fvg:mitigated`
    - Implement `loadHistory(candles, symbol, timeframe)`:
      1. Call `detectAllFvgs(candles)` to get all zones
      2. For each subsequent candle, check mitigation on all active zones
    - Implement `getZones(symbol, timeframe)`: return all zones for the key
    - Implement `getActiveZones(symbol, timeframe)`: filter by status === "active"
    - Only process candles where `isClosed === true`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3_
  - [~] 3.2 Write property tests for FvgTracker (`apps/api/src/__tests__/fvg/fvg-tracker.property.ts`)
    - **Property 6: Sequential Processing Builds Complete State** — For any candle array, `loadHistory` produces the same zones as manual sequential processing
    - **Property 7: Zone Preservation Invariant** — For any sequence of candle-close operations, zone count never decreases
    - **Property 8: Closed-Candle-Only Invariant** — For any unclosed candle, tracker state remains unchanged
    - Use `fast-check` with minimum 100 iterations
    - _Requirements: 3.1, 3.5, 3.6, 4.1, 4.2_
  - [~] 3.3 Write unit tests for FvgTracker event emission (`apps/api/src/__tests__/fvg/fvg-tracker.unit.ts`)
    - Verify `fvg:created` event is broadcast when new FVG detected
    - Verify `fvg:mitigated` event is broadcast when zone is mitigated
    - Verify unclosed candles (candle:update) do not trigger detection
    - _Requirements: 4.2, 4.3, 5.1, 5.2_

- [ ] 4. Extend WsServer for FVG events
  - [x] 4.1 Add `broadcastFvg()` method to `WsServer` class in `apps/api/src/market-data/ws-server.ts`
    - Accept `WsFvgMessage` and broadcast to all connected clients
    - Include symbol and timeframe in payload
    - _Requirements: 5.1, 5.2, 5.3_
  - [~] 4.2 Write property test for FVG message format (`apps/api/src/__tests__/fvg/fvg-messages.property.ts`)
    - **Property 9: FVG Event Message Format** — For any FvgZone, serialized message contains event, data.symbol, data.timeframe, and zone/zoneId fields
    - Use `fast-check` with minimum 100 iterations
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 5. Integrate FvgTracker with MarketDataService
  - [x] 5.1 Instantiate FvgTracker in MarketDataService and call `onCandleClosed` on each closed candle
    - In `handleKline()`, after persisting and broadcasting the closed candle, call `fvgTracker.onCandleClosed(candle, symbol, timeframe)`
    - _Requirements: 3.1, 4.3_
  - [x] 5.2 Load historical candles into FvgTracker on startup
    - After MarketDataService starts, query last 500 closed candles per timeframe from DB
    - Call `fvgTracker.loadHistory(candles, symbol, timeframe)` for each
    - _Requirements: 3.6, 5.4_

- [x] 6. Checkpoint — Backend FVG pipeline
  - Ensure FVG detection triggers on candle:closed, zones are tracked, and WebSocket events are broadcast. Run all property tests. Ask the user if questions arise.

- [ ] 7. Implement FVG REST endpoint
  - [x] 7.1 Create `apps/api/src/routes/fvg.ts` with GET /api/fvg route
    - Query params: `symbol` (required), `timeframe` (required)
    - Return 400 with descriptive message if either param is missing
    - Return JSON array of FvgZone[] from FvgTracker
    - _Requirements: 7.1, 7.2, 7.3_
  - [x] 7.2 Register FVG route in `apps/api/src/server.ts`
    - Import and register the fvg routes plugin
    - Pass FvgTracker instance via Fastify decoration or plugin options
    - _Requirements: 7.1_
  - [~] 7.3 Write unit tests for FVG REST route (`apps/api/src/__tests__/fvg/fvg-route.unit.ts`)
    - Verify 400 for missing symbol param
    - Verify 400 for missing timeframe param
    - Verify 200 with FvgZone[] for valid params
    - Verify response includes both active and mitigated zones
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 8. Implement FVG chart overlay on frontend
  - [x] 8.1 Create `apps/web/hooks/useFvgWebSocket.ts` hook
    - Subscribe to WebSocket events filtered for `fvg:created` and `fvg:mitigated`
    - Maintain state array of FvgZone[] with real-time updates
    - On `fvg:created`: add zone to state
    - On `fvg:mitigated`: update zone status in state
    - _Requirements: 5.1, 5.2, 6.4_
  - [x] 8.2 Create `apps/web/components/chart/FvgOverlay.tsx` component
    - Accept chart and series refs as props
    - Fetch initial FVG zones from `GET /api/fvg?symbol=...&timeframe=...`
    - Use `useFvgWebSocket` hook for real-time updates
    - Use Lightweight Charts v5 `createBox` or `ISeriesPrimitive` API for box rendering
    - Bullish zones: semi-transparent blue/green (`rgba(0, 150, 136, 0.2)`)
    - Bearish zones: semi-transparent red/orange (`rgba(244, 67, 54, 0.2)`)
    - Mitigated zones: reduced opacity (`0.08`) or dashed border
    - Boxes span from `fromTime` to current visible time (or toTime + extension)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - [x] 8.3 Integrate FvgOverlay into CandlestickChart component
    - Render `FvgOverlay` inside `CandlestickChart` once chart and series are initialized
    - Pass chart ref, series ref, symbol, and timeframe props
    - Ensure FVG boxes don't block candlestick interactions (zoom, scroll, crosshair)
    - _Requirements: 6.4, 6.5_
  - [x] 8.4 Add `/api/fvg` proxy rewrite in `apps/web/next.config.ts`
    - Rewrite `/api/fvg` to `http://localhost:3001/api/fvg` in development
    - _Requirements: 7.1_

- [x] 9. Final checkpoint
  - Verify end-to-end flow: Binance candle:closed → FVG detection → WebSocket broadcast → chart boxes render. Verify FVG REST endpoint returns zones on initial page load. Run all property and unit tests. Ask the user if questions arise.

## Notes

- Property tests use `fast-check` library with minimum 100 iterations per property
- All detection functions are pure — no side effects, no external dependencies
- FVG zones are stored in memory only (no DB table needed for Phase 3)
- The FvgTracker rebuilds state from historical candles on startup
- Lightweight Charts v5 uses the new `createBox` / primitives API (not deprecated v4 `addAreaSeries`)
- The existing `parseWsMessage` function is extended to handle FVG event types

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.7"] },
    { "id": 1, "tasks": ["1.3", "2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "2.4", "2.5", "2.6"] },
    { "id": 3, "tasks": ["3.1", "4.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "4.2"] },
    { "id": 5, "tasks": ["5.1", "5.2"] },
    { "id": 6, "tasks": ["7.1"] },
    { "id": 7, "tasks": ["7.2", "7.3"] },
    { "id": 8, "tasks": ["8.1", "8.4"] },
    { "id": 9, "tasks": ["8.2"] },
    { "id": 10, "tasks": ["8.3"] }
  ]
}
```
