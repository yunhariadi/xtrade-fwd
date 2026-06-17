# Requirements Document

## Introduction

Phase 2 adds live market data capabilities to the ICT Forward Lab. The system connects to Binance Futures WebSocket streams for BTCUSDT kline data, normalizes the incoming candle format to the existing `Candle` interface, persists closed candles to PostgreSQL/TimescaleDB, and broadcasts real-time candle updates to connected frontend clients via a server-side WebSocket. The frontend chart updates in real-time as new candle data arrives.

## Glossary

- **Binance_WS_Client**: The service component that establishes and maintains a WebSocket connection to the Binance Futures streaming API
- **Normalizer**: The module responsible for converting Binance kline event payloads into the application's `Candle` interface format
- **Candle_Store**: The module responsible for persisting finalized (closed) candle records to the PostgreSQL database
- **WS_Server**: The WebSocket server that broadcasts candle updates from the API service to connected frontend clients
- **Market_Data_Service**: The orchestrating service that coordinates Binance_WS_Client, Normalizer, Candle_Store, and WS_Server
- **Chart_Component**: The frontend CandlestickChart React component that renders live candle data
- **Kline_Event**: A raw WebSocket message from Binance containing candle (kline) data for a specific symbol and timeframe
- **Closed_Candle**: A candle whose timeframe period has ended and whose OHLCV values are finalized (will not change)
- **Open_Candle**: A candle whose timeframe period is still active and whose values may change with each tick
- **Backfill**: The process of fetching missed candles via REST API after a reconnection event

## Requirements

### Requirement 1: Binance WebSocket Connection

**User Story:** As a system operator, I want the API service to maintain a persistent WebSocket connection to Binance Futures, so that the system receives real-time BTCUSDT kline data.

#### Acceptance Criteria

1. WHEN the Market_Data_Service starts, THE Binance_WS_Client SHALL establish a WebSocket connection to `wss://fstream.binance.com/ws`
2. WHEN the connection is established, THE Binance_WS_Client SHALL subscribe to kline streams for timeframes 5m, 15m, 1h, and 4h for BTCUSDT
3. WHILE the connection is active, THE Binance_WS_Client SHALL process incoming Kline_Event messages and forward them to the Normalizer
4. IF the WebSocket connection drops, THEN THE Binance_WS_Client SHALL attempt reconnection using exponential backoff starting at 1 second with a maximum delay of 60 seconds
5. IF the WebSocket connection is re-established after a disconnect, THEN THE Market_Data_Service SHALL trigger a backfill of missed candles via the Binance REST API
6. WHILE the connection is active, THE Binance_WS_Client SHALL respond to WebSocket ping frames to maintain the connection

### Requirement 2: Kline Normalization

**User Story:** As a developer, I want Binance kline events normalized to the application's Candle format, so that all downstream components use a consistent data contract.

#### Acceptance Criteria

1. WHEN a Kline_Event is received, THE Normalizer SHALL convert the Binance kline timestamp from milliseconds to Unix seconds
2. WHEN a Kline_Event is received, THE Normalizer SHALL map the kline open, high, low, close, and volume string fields to numeric values in the Candle interface
3. WHEN a Kline_Event is received, THE Normalizer SHALL set the Candle `isClosed` field based on the kline event's `x` (is closed) boolean field
4. THE Normalizer SHALL produce a valid Candle object for every well-formed Kline_Event input
5. IF a Kline_Event contains malformed or missing required fields, THEN THE Normalizer SHALL reject the event and log a warning without crashing

### Requirement 3: Closed Candle Persistence

**User Story:** As a system operator, I want closed candles persisted to the database, so that historical data is preserved for strategy analysis and chart loading.

#### Acceptance Criteria

1. WHEN a normalized candle has `isClosed` equal to true, THE Candle_Store SHALL insert the candle record into the PostgreSQL `candles` table
2. THE Candle_Store SHALL only persist candles where `isClosed` is true (no-repaint rule)
3. IF a closed candle with the same `(exchange, symbol, timeframe, open_time)` tuple already exists, THEN THE Candle_Store SHALL skip the insert without raising an error (idempotent upsert)
4. WHEN persisting a candle, THE Candle_Store SHALL store the exchange as "binance", the symbol as the normalized uppercase symbol, and the timeframe as received from the subscription

### Requirement 4: Server-to-Client WebSocket Broadcasting

**User Story:** As a frontend developer, I want the API to broadcast candle updates over WebSocket, so that the chart displays real-time price action.

#### Acceptance Criteria

1. WHEN a client connects to the WebSocket endpoint, THE WS_Server SHALL accept the connection and register the client for candle updates
2. WHEN a normalized candle update is available (open candle tick), THE WS_Server SHALL broadcast a `candle:update` event containing the candle data and metadata (symbol, timeframe) to all connected clients
3. WHEN a candle closes, THE WS_Server SHALL broadcast a `candle:closed` event containing the finalized candle data and metadata to all connected clients
4. IF a client disconnects, THEN THE WS_Server SHALL remove the client from the broadcast registry and release associated resources
5. THE WS_Server SHALL include event type, symbol, and timeframe fields in every broadcast message so clients can filter relevant updates

### Requirement 5: Frontend Live Chart Updates

**User Story:** As a trader, I want the chart to update in real-time with live price data, so that I can observe current market conditions without refreshing the page.

#### Acceptance Criteria

1. WHEN the Chart_Component mounts, THE Chart_Component SHALL establish a WebSocket connection to the API WS_Server
2. WHEN a `candle:update` event is received for the active timeframe, THE Chart_Component SHALL update the current (open) candle on the chart with the new OHLCV values
3. WHEN a `candle:closed` event is received for the active timeframe, THE Chart_Component SHALL finalize the current candle and begin displaying a new open candle
4. IF the frontend WebSocket connection drops, THEN THE Chart_Component SHALL attempt reconnection with exponential backoff
5. IF the frontend WebSocket reconnects after a disconnect, THEN THE Chart_Component SHALL fetch missed candles via the REST API and reconcile the chart state
6. WHILE the WebSocket is disconnected, THE Chart_Component SHALL display a visual indicator showing the connection status to the user

### Requirement 6: WebSocket Message Protocol

**User Story:** As a developer, I want a well-defined message protocol for WebSocket communication, so that frontend and backend evolve independently with a stable contract.

#### Acceptance Criteria

1. THE WS_Server SHALL send messages as JSON objects with a top-level `event` field indicating the message type
2. THE WS_Server SHALL include a `data` field in each message containing the payload specific to the event type
3. WHEN sending a `candle:update` event, THE WS_Server SHALL include `symbol`, `timeframe`, and the full Candle object in the data payload
4. WHEN sending a `candle:closed` event, THE WS_Server SHALL include `symbol`, `timeframe`, and the full Candle object in the data payload
5. THE WS_Server SHALL serialize all messages using JSON with numeric values (not strings) for price and volume fields

### Requirement 7: Reconnection and Data Integrity

**User Story:** As a system operator, I want the system to handle disconnections gracefully, so that no candle data is lost during network interruptions.

#### Acceptance Criteria

1. WHEN the Binance_WS_Client reconnects after a disconnect, THE Market_Data_Service SHALL identify the timestamp of the last persisted closed candle for each subscribed timeframe
2. WHEN backfilling missed candles, THE Market_Data_Service SHALL fetch candles from the Binance REST API starting from the last known closed candle timestamp
3. WHEN backfilled candles are received, THE Candle_Store SHALL persist them using the same idempotent insert logic as live candles
4. WHEN backfilled candles are persisted, THE WS_Server SHALL broadcast `candle:closed` events for each backfilled candle to connected clients so charts stay synchronized
5. IF the Binance REST API is unavailable during backfill, THEN THE Market_Data_Service SHALL retry the backfill with exponential backoff and log the failure

