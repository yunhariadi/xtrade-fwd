# Implementation Plan: Phase 2 — Live Market Data

## Overview

This plan implements real-time market data streaming for the ICT Forward Lab. The system connects to Binance Futures WebSocket streams, normalizes kline data to the existing `Candle` interface, persists closed candles to PostgreSQL, and broadcasts live updates to frontend clients. The frontend chart gains WebSocket connectivity for live updates without page refresh.

## Tasks

- [x] 1. Install dependencies and set up shared types
  - [x] 1.1 Install WebSocket dependencies in `apps/api`
    - Add `ws`, `@fastify/websocket` as dependencies
    - Add `@types/ws`, `fast-check`, `vitest` as devDependencies
    - _Requirements: 1.1, 4.1_
  - [x] 1.2 Create shared WebSocket message types in `packages/core/src/types/ws-messages.ts`
    - Define `WsEventType`, `WsCandleMessage` interface
    - Implement `serializeWsMessage()` and `parseWsMessage()` functions
    - Export from `packages/core/src/index.ts` barrel
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [x] 1.3 Add `isClosed` field to `Candle` interface if not already present, and verify existing type compatibility
    - Confirm `Candle` interface in `packages/core/src/types/candle.ts` has `isClosed: boolean`
    - _Requirements: 2.3_

- [x] 2. Implement BinanceWsClient (`apps/api/src/market-data/binance-ws-client.ts`)
  - [x] 2.1 Create `BinanceWsClient` class with EventEmitter pattern
    - Define `BinanceWsClientOptions` and `BinanceKlineEvent` interfaces
    - Implement `connect()` method that opens a WebSocket to the combined streams URL
    - Implement `disconnect()` method for graceful shutdown
    - Implement `handleMessage()` to parse JSON and emit `kline` events
    - Emit `connected`, `disconnected`, `reconnecting`, `error` events
    - _Requirements: 1.1, 1.2, 1.3, 1.6_
  - [x] 2.2 Implement exponential backoff reconnection in `BinanceWsClient`
    - Implement `scheduleReconnect()` with `Math.min(baseDelay * 2^attempt, maxDelay)` pattern
    - Export `getReconnectDelay()` as a testable pure function
    - Suppress reconnection when `disconnect()` was called intentionally
    - _Requirements: 1.4_
  - [ ]* 2.3 Write property test for exponential backoff (`apps/api/src/__tests__/market-data/reconnect.property.ts`)
    - **Property 3: Exponential backoff delay calculation**
    - For any non-negative integer `n`, verify `getReconnectDelay(n)` equals `Math.min(1000 * 2^n, 60000)`
    - **Validates: Requirements 1.4, 5.4**

- [x] 3. Implement KlineNormalizer (`apps/api/src/market-data/kline-normalizer.ts`)
  - [x] 3.1 Create `normalizeKline()` pure function
    - Convert Binance kline timestamp from ms to Unix seconds
    - Map string price/volume fields to numbers
    - Set `isClosed` from kline `x` field
    - Return `NormalizationResult` with candle, symbol, timeframe
    - Return `null` for malformed input without throwing
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 3.2 Create `timeframeToDuration()` helper function
    - Map timeframe strings (5m, 15m, 1h, 4h) to duration in seconds
    - _Requirements: 2.1_
  - [ ]* 3.3 Write property tests for kline normalization (`apps/api/src/__tests__/market-data/kline-normalizer.property.ts`)
    - **Property 1: Kline normalization produces valid Candle**
    - Generate random well-formed BinanceKlineEvent objects, verify output Candle fields match expected transformations
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
  - [ ]* 3.4 Write property test for malformed kline rejection (`apps/api/src/__tests__/market-data/kline-normalizer.property.ts`)
    - **Property 2: Malformed kline events are rejected without throwing**
    - Generate random objects with missing/invalid fields, verify `null` return and no exception
    - **Validates: Requirements 2.5**

- [x] 4. Implement CandleStore (`apps/api/src/market-data/candle-store.ts`)
  - [x] 4.1 Create `CandleStore` class with `persist()` method
    - Only insert candles where `isClosed === true`
    - Use `INSERT ... ON CONFLICT (exchange, symbol, timeframe, open_time) DO NOTHING` for idempotency
    - Return `true` if inserted, `false` if already existed or not closed
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [x] 4.2 Implement `getLastCandleTime()` method in CandleStore
    - Query the most recent closed candle timestamp for a given symbol/timeframe
    - Return Unix seconds or `null` if no candles exist
    - _Requirements: 7.1_
  - [ ]* 4.3 Write property test for closed-only persistence (`apps/api/src/__tests__/market-data/candle-store.property.ts`)
    - **Property 4: Only closed candles are persisted**
    - Generate random Candle objects with varying `isClosed`, verify only closed ones trigger insert
    - **Validates: Requirements 3.2**
  - [ ]* 4.4 Write property test for idempotent insertion (`apps/api/src/__tests__/market-data/candle-store.property.ts`)
    - **Property 5: Idempotent candle insertion**
    - Generate random closed candles, call persist twice, verify exactly one DB record exists
    - **Validates: Requirements 3.3, 7.3**

- [x] 5. Checkpoint — Core modules
  - Ensure BinanceWsClient, KlineNormalizer, and CandleStore compile and all property tests pass. Ask the user if questions arise.

- [x] 6. Implement WsServer (`apps/api/src/market-data/ws-server.ts`)
  - [x] 6.1 Create `WsServer` class with `@fastify/websocket`
    - Register `/ws` route with websocket handler
    - Track connected clients in a `Set<WebSocket>`
    - Handle client connect/disconnect/error events
    - Implement `broadcast()` method that sends to all clients with `readyState === OPEN`
    - Implement `getClientCount()` for monitoring
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [ ]* 6.2 Write property tests for WsServer (`apps/api/src/__tests__/market-data/ws-server.property.ts`)
    - **Property 6: Broadcast reaches all connected clients**
    - Generate random client counts and candle data, verify all OPEN clients receive the message
    - **Validates: Requirements 4.2, 4.3**
  - [ ]* 6.3 Write property test for message protocol conformance (`apps/api/src/__tests__/market-data/ws-server.property.ts`)
    - **Property 7: Message protocol conformance**
    - Generate random candles, serialize via broadcast, verify output has `event`, `data.symbol`, `data.timeframe`, `data.candle` fields
    - **Validates: Requirements 4.5, 6.1, 6.2, 6.3, 6.4**
  - [ ]* 6.4 Write property test for numeric serialization (`apps/api/src/__tests__/market-data/ws-server.property.ts`)
    - **Property 8: Numeric values remain numbers in serialized messages**
    - Generate random Candle objects, stringify, parse, verify typeof price/volume fields === "number"
    - **Validates: Requirements 6.5**

- [x] 7. Implement MarketDataService (`apps/api/src/market-data/market-data-service.ts`)
  - [x] 7.1 Create `MarketDataService` orchestrator class
    - Wire together BinanceWsClient, KlineNormalizer, CandleStore, WsServer
    - On `kline` event: normalize → if closed, persist + broadcast `candle:closed`; if open, broadcast `candle:update`
    - Implement `start()` and `stop()` lifecycle methods
    - _Requirements: 1.1, 1.3, 3.1, 4.2, 4.3_
  - [x] 7.2 Implement backfill logic in MarketDataService
    - On `connected` event from BinanceWsClient, trigger backfill for each subscribed timeframe
    - Fetch from Binance REST API `/fapi/v1/klines` starting from last known closed candle timestamp
    - Persist and broadcast each backfilled candle
    - Log errors if REST API is unavailable
    - _Requirements: 1.5, 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 8. Integrate MarketDataService into Fastify server
  - [x] 8.1 Register `@fastify/websocket` plugin in `apps/api/src/server.ts`
    - Import and register the websocket plugin before MarketDataService
    - _Requirements: 4.1_
  - [x] 8.2 Create market data plugin (`apps/api/src/plugins/market-data.ts`)
    - Instantiate MarketDataService with config from environment variables
    - Add `BINANCE_WS_URL` (default: `wss://fstream.binance.com/ws`) to `.env.example`
    - Add `MARKET_SYMBOL` (default: `BTCUSDT`) and `MARKET_TIMEFRAMES` (default: `5m,15m,1h,4h`)
    - Start on Fastify `ready` hook, stop on `close` hook
    - _Requirements: 1.1, 1.2_
  - [x] 8.3 Update `apps/api/src/server.ts` to register the market data plugin
    - Import and register market-data plugin after database plugin
    - Ensure graceful shutdown calls MarketDataService.stop()
    - _Requirements: 1.1_

- [x] 9. Checkpoint — Backend integration
  - Ensure API server starts, connects to Binance WS, and `/ws` endpoint accepts connections. Verify candle events flow through the pipeline. Ask the user if questions arise.

- [x] 10. Implement frontend WebSocket hook and live chart updates
  - [x] 10.1 Create `useMarketWebSocket` hook (`apps/web/hooks/useMarketWebSocket.ts`)
    - Establish WebSocket connection to API `/ws` endpoint
    - Parse incoming messages using `parseWsMessage()` from core
    - Filter messages by active symbol/timeframe
    - Call `onCandleUpdate` for open candle ticks, `onCandleClosed` for finalized candles
    - Implement exponential backoff reconnection on disconnect
    - Expose `ConnectionStatus` state (`connecting`, `connected`, `disconnected`)
    - _Requirements: 5.1, 5.4_
  - [x] 10.2 Update `CandlestickChart` component for live WebSocket updates
    - Integrate `useMarketWebSocket` hook
    - On `candle:update`: update the last candle in the series with new OHLCV values
    - On `candle:closed`: finalize current candle, add new candle to series
    - On reconnect: re-fetch candles from REST API and reconcile chart state
    - _Requirements: 5.1, 5.2, 5.3, 5.5_
  - [x] 10.3 Add connection status indicator to the chart UI
    - Display visual indicator (colored dot or banner) showing WebSocket connection status
    - Show "connecting", "connected", "disconnected" states
    - Position indicator in chart header or overlay
    - _Requirements: 5.6_
  - [x] 10.4 Configure Next.js WebSocket proxy for development
    - Add `/ws` rewrite in `next.config.ts` to proxy to `ws://localhost:3001/ws`
    - _Requirements: 5.1_

- [x] 11. Update environment configuration
  - [x] 11.1 Update `.env.example` with new Phase 2 environment variables
    - Add `BINANCE_WS_URL=wss://fstream.binance.com/ws`
    - Add `MARKET_SYMBOL=BTCUSDT`
    - Add `MARKET_TIMEFRAMES=5m,15m,1h,4h`
    - _Requirements: 1.1, 1.2_

- [x] 12. Final checkpoint
  - Ensure all modules compile, property tests pass, API connects to Binance WS, frontend receives live candle updates via WebSocket, and connection status indicator works. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` library with minimum 100 iterations per property
- All new modules live in `apps/api/src/market-data/` directory
- The `@fastify/websocket` plugin shares port 3001 with the existing REST API
- Backfill logic uses the Binance REST API to recover missed candles after reconnection
- The frontend WebSocket connects to the same API origin via `/ws` path

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "3.1", "3.2"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.3", "3.4", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4"] },
    { "id": 4, "tasks": ["6.1"] },
    { "id": 5, "tasks": ["6.2", "6.3", "6.4", "7.1"] },
    { "id": 6, "tasks": ["7.2"] },
    { "id": 7, "tasks": ["8.1", "8.2"] },
    { "id": 8, "tasks": ["8.3", "11.1"] },
    { "id": 9, "tasks": ["10.1", "10.4"] },
    { "id": 10, "tasks": ["10.2"] },
    { "id": 11, "tasks": ["10.3"] }
  ]
}
```
