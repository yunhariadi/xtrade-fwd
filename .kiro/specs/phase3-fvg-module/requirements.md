# Requirements Document

## Introduction

Phase 3 adds the Fair Value Gap (FVG) detection module to the ICT Forward Lab. This module detects bullish and bearish FVGs from closed candle data, tracks their lifecycle (active → mitigated), and renders FVG boxes on the Lightweight Charts v5 candlestick chart. FVG detection is a core building block for the ICT/A-Model strategy engine that follows in Phase 4.

## Glossary

- **FVG_Detector**: The pure-function module in `packages/strategies` responsible for identifying bullish and bearish Fair Value Gaps from candle arrays.
- **FVG_Zone**: A data structure representing a detected Fair Value Gap, including its price boundaries, direction, time range, and lifecycle status.
- **FVG_Tracker**: The stateful service that maintains a collection of FVG zones, adds new detections on candle close, and updates mitigation status as price returns to fill gaps.
- **FVG_Renderer**: The chart-drawing plugin in `packages/chart-drawings` that renders FVG zones as semi-transparent box overlays on the Lightweight Charts v5 chart.
- **Mitigation**: The event where price returns into an FVG zone, indicating the gap has been "filled" by the market.
- **Bullish_FVG**: A gap where candle[i].low is greater than candle[i-2].high, indicating upward momentum left an unfilled price gap.
- **Bearish_FVG**: A gap where candle[i].high is less than candle[i-2].low, indicating downward momentum left an unfilled price gap.
- **WS_Server**: The existing WebSocket broadcast server that delivers real-time events to frontend clients.
- **Candle**: The normalized OHLCV data structure defined in `packages/core`.

## Requirements

### Requirement 1: Bullish FVG Detection

**User Story:** As a trader, I want the system to detect bullish Fair Value Gaps from candle data, so that I can identify potential support zones for long entries.

#### Acceptance Criteria

1. WHEN three consecutive closed candles are available and candle[i].low is greater than candle[i-2].high, THE FVG_Detector SHALL identify a bullish FVG.
2. WHEN a bullish FVG is detected, THE FVG_Detector SHALL return an FVG_Zone with direction set to "bullish", top equal to candle[i].low, and bottom equal to candle[i-2].high.
3. WHEN fewer than three candles are available (index less than 2), THE FVG_Detector SHALL return null without error.
4. WHEN candle[i].low is equal to or less than candle[i-2].high, THE FVG_Detector SHALL not identify a bullish FVG.

### Requirement 2: Bearish FVG Detection

**User Story:** As a trader, I want the system to detect bearish Fair Value Gaps from candle data, so that I can identify potential resistance zones for short entries.

#### Acceptance Criteria

1. WHEN three consecutive closed candles are available and candle[i].high is less than candle[i-2].low, THE FVG_Detector SHALL identify a bearish FVG.
2. WHEN a bearish FVG is detected, THE FVG_Detector SHALL return an FVG_Zone with direction set to "bearish", top equal to candle[i-2].low, and bottom equal to candle[i].high.
3. WHEN fewer than three candles are available (index less than 2), THE FVG_Detector SHALL return null without error.
4. WHEN candle[i].high is equal to or greater than candle[i-2].low, THE FVG_Detector SHALL not identify a bearish FVG.

### Requirement 3: FVG Zone Lifecycle Management

**User Story:** As a trader, I want FVG zones to be tracked and updated as price action evolves, so that I can see which gaps are still active and which have been filled.

#### Acceptance Criteria

1. WHEN a new FVG is detected on candle close, THE FVG_Tracker SHALL add the zone to its collection with status "active".
2. WHEN a candle closes with close price less than or equal to the top of a bullish FVG zone, THE FVG_Tracker SHALL update that zone's status to "mitigated".
3. WHEN a candle closes with close price greater than or equal to the bottom of a bearish FVG zone, THE FVG_Tracker SHALL update that zone's status to "mitigated".
4. THE FVG_Tracker SHALL assign a unique identifier to each FVG_Zone using the format "{direction}-fvg-{candle[i].time}".
5. THE FVG_Tracker SHALL preserve all mitigated zones in its collection for historical reference.
6. WHEN processing historical candle data, THE FVG_Tracker SHALL scan all candles sequentially and build the complete FVG state (both active and mitigated zones).

### Requirement 4: No-Repaint Rule for FVG Detection

**User Story:** As a trader, I want FVG detection to occur only on closed candles, so that detected zones do not disappear or change after being confirmed.

#### Acceptance Criteria

1. THE FVG_Detector SHALL only process candles where isClosed equals true.
2. WHEN a candle:update event is received (isClosed is false), THE FVG_Tracker SHALL not run detection or mitigation logic.
3. WHEN a candle:closed event is received, THE FVG_Tracker SHALL run detection for new FVGs and check mitigation for existing active zones.

### Requirement 5: FVG Events via WebSocket

**User Story:** As a frontend developer, I want FVG zone changes to be broadcast via WebSocket, so that the chart can update in real-time without polling.

#### Acceptance Criteria

1. WHEN a new FVG zone is detected, THE WS_Server SHALL broadcast an "fvg:created" event containing the full FVG_Zone object.
2. WHEN an existing FVG zone is mitigated, THE WS_Server SHALL broadcast an "fvg:mitigated" event containing the zone id and updated status.
3. THE WS_Server SHALL include the symbol and timeframe in every FVG event payload.
4. WHEN a frontend client connects, THE system SHALL provide the current list of FVG zones via a REST endpoint so the client can render existing zones on initial chart load.

### Requirement 6: FVG Box Rendering on Chart

**User Story:** As a trader, I want FVG zones displayed as colored boxes on the chart, so that I can visually identify active and mitigated gaps at a glance.

#### Acceptance Criteria

1. WHEN an active bullish FVG zone exists, THE FVG_Renderer SHALL draw a semi-transparent blue/green rectangle from the zone's fromTime to the current time, bounded vertically by top and bottom prices.
2. WHEN an active bearish FVG zone exists, THE FVG_Renderer SHALL draw a semi-transparent red/orange rectangle from the zone's fromTime to the current time, bounded vertically by top and bottom prices.
3. WHEN an FVG zone is mitigated, THE FVG_Renderer SHALL reduce the box opacity or apply a dashed border to visually distinguish it from active zones.
4. WHEN new FVG events are received via WebSocket, THE FVG_Renderer SHALL update the chart without requiring a full page reload.
5. THE FVG_Renderer SHALL use Lightweight Charts v5 custom primitives or plugin API to draw boxes without interfering with the candlestick series interaction (zoom, scroll, crosshair).

### Requirement 7: FVG REST API

**User Story:** As a frontend developer, I want a REST endpoint to fetch current FVG zones, so that I can render them on initial chart load and after timeframe switches.

#### Acceptance Criteria

1. WHEN a GET request is made to /api/fvg with symbol and timeframe query parameters, THE system SHALL return an array of FVG_Zone objects for that symbol and timeframe.
2. THE response SHALL include both active and mitigated zones.
3. IF the symbol or timeframe parameter is missing, THEN THE system SHALL return a 400 error with a descriptive message.

