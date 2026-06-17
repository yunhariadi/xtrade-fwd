# Requirements Document

## Introduction

Phase 4 implements the ICT / A-Model multi-timeframe strategy engine for the ICT Forward Lab. This phase adds the core trading logic modules — 4H directional bias detection, 15m liquidity sweep detection, 15m market structure shift (MSS/ChoCh) detection, and 5m FVG entry — then combines them into a structured strategy that generates actionable signals. All strategy logic is implemented as pure functions in `packages/strategies`, with a StrategyRunner in the API layer that triggers evaluation on each 5m candle close.

## Glossary

- **Strategy_Engine**: The collection of pure function modules that analyze multi-timeframe candle data and produce trading signals
- **Swing_Point**: A local price extreme identified by comparing a candle's high or low against N candles on each side (pivot point)
- **Bias_Module**: The 4H timeframe module that determines directional market bias (bullish, bearish, or neutral) using swing structure
- **Liquidity_Sweep**: A price event where a wick extends beyond a previous swing point level but the close returns inside, indicating trapped liquidity
- **MSS**: Market Structure Shift — a break of a swing point that confirms a trend change
- **ChoCh**: Change of Character — synonymous with MSS in this system
- **FVG_Entry**: A 5m Fair Value Gap that serves as the trade entry zone after a confirmed MSS
- **Strategy_Signal**: A structured output containing trade direction, entry, stop loss, take profit, and reasoning
- **Strategy_Context**: A data structure containing candle arrays for all four timeframes (5m, 15m, 1h, 4h)
- **Strategy_Runner**: The API-layer service that invokes the strategy engine on each 5m candle close and broadcasts signals
- **Chart_Drawing**: A visual annotation (box, line, marker, label) rendered on the trading chart
- **Risk_Reward_Ratio**: The ratio of potential profit to potential loss for a trade setup

## Requirements

### Requirement 1: Swing Point Detection

**User Story:** As a strategy developer, I want a shared utility that identifies swing highs and swing lows from candle data, so that all modules can use consistent pivot detection.

#### Acceptance Criteria

1. WHEN provided a candle array and left/right bar counts, THE Swing_Point detector SHALL identify swing highs where the candle high is greater than the high of all N candles on each side
2. WHEN provided a candle array and left/right bar counts, THE Swing_Point detector SHALL identify swing lows where the candle low is less than the low of all N candles on each side
3. THE Swing_Point detector SHALL return an array of SwingPoint objects containing type, price, time, and index
4. WHEN the candle array contains fewer candles than required for pivot detection (less than leftBars + rightBars + 1), THE Swing_Point detector SHALL return an empty array
5. THE Swing_Point detector SHALL use a default of 5 bars for both left and right lookback when no parameters are specified

### Requirement 2: 4H Bias Detection

**User Story:** As a strategy engine, I want to determine the directional bias from the 4H timeframe, so that I can filter trade setups to align with the higher-timeframe trend.

#### Acceptance Criteria

1. WHEN the last two significant swing points on 4H form a Higher High and Higher Low pattern, THE Bias_Module SHALL return "bullish"
2. WHEN the last two significant swing points on 4H form a Lower High and Lower Low pattern, THE Bias_Module SHALL return "bearish"
3. WHEN the last two significant swing points on 4H do not form either a clear HH/HL or LH/LL pattern, THE Bias_Module SHALL return "neutral"
4. THE Bias_Module SHALL analyze the last 20 candles of 4H data for swing detection
5. WHEN fewer than 4 swing points are found in the lookback period, THE Bias_Module SHALL return "neutral"
6. THE Bias_Module SHALL be a pure function accepting a Candle array and returning a bias string

### Requirement 3: 15m Liquidity Sweep Detection

**User Story:** As a strategy engine, I want to detect liquidity sweeps on the 15m timeframe, so that I can identify potential reversal points where trapped orders have been collected.

#### Acceptance Criteria

1. WHEN a candle's low wick extends below a previous swing low and the candle closes above that swing low, THE Liquidity_Sweep detector SHALL identify a sell-side liquidity sweep
2. WHEN a candle's high wick extends above a previous swing high and the candle closes below that swing high, THE Liquidity_Sweep detector SHALL identify a buy-side liquidity sweep
3. THE Liquidity_Sweep detector SHALL return the swept price level, the sweep candle data, and the sweep type
4. WHEN no liquidity sweep is detected in the recent candles, THE Liquidity_Sweep detector SHALL return null
5. THE Liquidity_Sweep detector SHALL use 5-bar pivots for swing point identification on the 15m timeframe
6. THE Liquidity_Sweep detector SHALL examine the most recent candle against all swing points found in the lookback window

### Requirement 4: 15m MSS / ChoCh Detection

**User Story:** As a strategy engine, I want to detect Market Structure Shifts on the 15m timeframe, so that I can confirm trend reversals after liquidity sweeps.

#### Acceptance Criteria

1. WHEN price breaks above the last lower high during a downtrend, THE MSS detector SHALL identify a bullish market structure shift
2. WHEN price breaks below the last higher low during an uptrend, THE MSS detector SHALL identify a bearish market structure shift
3. THE MSS detector SHALL return the break level, the break candle, and the shift direction
4. WHEN no structure shift is detected, THE MSS detector SHALL return null
5. THE MSS detector SHALL use swing point analysis to determine the current trend structure before identifying breaks
6. THE MSS detector SHALL require at least 3 swing points to determine the existing trend structure

### Requirement 5: 5m FVG Entry Detection

**User Story:** As a strategy engine, I want to find FVG entry opportunities on the 5m timeframe after a confirmed MSS, so that I can generate precise entry signals with defined risk.

#### Acceptance Criteria

1. WHEN a bullish bias is confirmed and a bullish FVG exists on 5m, THE FVG_Entry detector SHALL calculate entry at the top edge of the FVG zone
2. WHEN a bearish bias is confirmed and a bearish FVG exists on 5m, THE FVG_Entry detector SHALL calculate entry at the bottom edge of the FVG zone
3. THE FVG_Entry detector SHALL set the stop loss below the swept swing low for bullish entries and above the swept swing high for bearish entries
4. THE FVG_Entry detector SHALL calculate take profit using a 2:1 risk-reward ratio
5. WHEN no qualifying FVG is found on the 5m timeframe, THE FVG_Entry detector SHALL return null
6. THE FVG_Entry detector SHALL return entry price, stop loss, take profit, risk-reward ratio, and the FVG zone used

### Requirement 6: Multi-Timeframe Strategy Orchestration

**User Story:** As the system, I want to combine all ICT modules into a single strategy evaluation, so that signals are only generated when all confluence factors align.

#### Acceptance Criteria

1. WHEN 4H bias is bullish AND a sell-side liquidity sweep is detected on 15m AND a bullish MSS is confirmed on 15m AND a bullish FVG entry exists on 5m, THE Strategy_Engine SHALL generate a long signal
2. WHEN 4H bias is bearish AND a buy-side liquidity sweep is detected on 15m AND a bearish MSS is confirmed on 15m AND a bearish FVG entry exists on 5m, THE Strategy_Engine SHALL generate a short signal
3. WHEN any confluence factor is missing, THE Strategy_Engine SHALL return a signal with side "none"
4. THE Strategy_Engine SHALL include reasons array listing each satisfied condition in the signal
5. THE Strategy_Engine SHALL include chart drawings for the detected FVG zone, sweep level, and MSS break level in the signal
6. THE Strategy_Engine SHALL accept a StrategyContext containing candle arrays for all four timeframes
7. THE Strategy_Engine SHALL be a pure function that produces no side effects

### Requirement 7: Strategy Signal Structure

**User Story:** As a frontend developer, I want strategy signals to follow a consistent structure, so that I can render signal information and chart annotations.

#### Acceptance Criteria

1. THE Strategy_Signal SHALL contain side, symbol, timeframe, signalTime, entry, stopLoss, takeProfit, riskReward, reasons, drawings, and optional metadata fields
2. WHEN a valid trade setup is detected, THE Strategy_Signal SHALL include numeric values for entry, stopLoss, takeProfit, and riskReward
3. WHEN no trade setup is detected, THE Strategy_Signal SHALL have side "none" with empty reasons and drawings arrays
4. THE Strategy_Signal SHALL include Chart_Drawing objects for each visual annotation (FVG box, sweep marker, MSS line)

### Requirement 8: Strategy Runner and Signal Broadcasting

**User Story:** As a system operator, I want the strategy to run automatically on each 5m candle close and broadcast signals, so that the frontend receives real-time trade alerts.

#### Acceptance Criteria

1. WHEN a 5m candle closes, THE Strategy_Runner SHALL invoke the strategy engine with the current multi-timeframe context
2. THE Strategy_Runner SHALL only evaluate closed candles to prevent signal repainting
3. WHEN the strategy engine returns a signal with side not equal to "none", THE Strategy_Runner SHALL broadcast the signal via WebSocket using the "signal:new" event
4. THE Strategy_Runner SHALL expose a REST endpoint GET /api/signals that returns recent signals
5. WHEN the strategy engine returns a signal with side not equal to "none", THE Strategy_Runner SHALL persist the signal for historical retrieval

### Requirement 9: No-Repaint Guarantee

**User Story:** As a trader, I want signals to only be generated from closed candles, so that I can trust that signals would have appeared in real-time conditions.

#### Acceptance Criteria

1. THE Strategy_Engine SHALL only process candles where isClosed is true
2. WHEN an unclosed candle is received, THE Strategy_Runner SHALL skip strategy evaluation
3. THE Strategy_Signal signalTime SHALL correspond to the close time of the triggering candle
