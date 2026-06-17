# Requirements Document

## Introduction

Phase 5 — Forward-Test Engine adds a virtual trade execution layer to the ICT Forward Lab. When the strategy engine (Phase 4) generates a signal, the forward-test engine creates a virtual trade, tracks its lifecycle from pending through active to closed, calculates PnL with realistic fees and slippage, enforces position sizing based on account risk, and persists results to PostgreSQL. The engine monitors each candle tick to check entry triggers, stop-loss hits, take-profit hits, and timeout expirations.

## Glossary

- **Forward_Test_Engine**: The service component responsible for creating, monitoring, and closing virtual trades based on strategy signals and candle updates.
- **Trade_Store**: The persistence layer that performs CRUD operations on the `forward_trades` PostgreSQL table.
- **Candle_Tick**: A candle update event (closed or in-progress) received from the MarketDataService.
- **Pending_Trade**: A virtual trade that has been created from a signal but whose entry price has not yet been reached by market price.
- **Active_Trade**: A virtual trade whose entry has been triggered and is now being monitored for SL/TP/timeout exit.
- **Position_Sizer**: The pure function that computes position size from account balance, risk percent, entry price, and stop-loss price.
- **Account_Tracker**: The component that maintains virtual account balance, updating it after each closed trade.
- **WS_Server**: The existing WebSocket server that broadcasts events to connected frontend clients.

## Requirements

### Requirement 1: Trade Creation from Signal

**User Story:** As a forward tester, I want virtual trades to be automatically created when the strategy generates a valid signal, so that I can track hypothetical performance without manual intervention.

#### Acceptance Criteria

1. WHEN the Strategy_Runner produces a StrategySignal with side "long" or "short", THE Forward_Test_Engine SHALL create a new ForwardTrade with status "pending" and populate signalId, symbol, side, stopLoss, takeProfit, riskAmount, positionSize, and reasons from the signal data.
2. WHEN creating a pending trade, THE Position_Sizer SHALL calculate positionSize as (accountBalance * riskPercent / 100) / |entry - stopLoss|.
3. IF the calculated positionSize is zero or negative due to invalid entry/stopLoss distance, THEN THE Forward_Test_Engine SHALL reject the trade and log the rejection reason.
4. WHEN a new trade is created, THE Forward_Test_Engine SHALL broadcast a "trade:created" event via WS_Server containing the full ForwardTrade object.
5. WHEN a new trade is created, THE Trade_Store SHALL persist the trade to the forward_trades database table.

### Requirement 2: Trade Entry Trigger

**User Story:** As a forward tester, I want pending trades to become active when market price reaches the entry level, so that the forward test accurately simulates real order fills.

#### Acceptance Criteria

1. WHEN a Candle_Tick is received AND a pending long trade exists whose entry price is at or below the candle high, THE Forward_Test_Engine SHALL transition the trade to "active" status with entryTime set to the candle time.
2. WHEN a Candle_Tick is received AND a pending short trade exists whose entry price is at or above the candle low, THE Forward_Test_Engine SHALL transition the trade to "active" status with entryTime set to the candle time.
3. WHEN a pending trade transitions to active, THE Forward_Test_Engine SHALL apply slippage to the entry price: for long trades, entryPrice = signal.entry * (1 + slippagePercent / 100); for short trades, entryPrice = signal.entry * (1 - slippagePercent / 100).
4. WHEN a trade transitions to active, THE Forward_Test_Engine SHALL broadcast a "trade:updated" event via WS_Server.
5. WHEN a trade transitions to active, THE Trade_Store SHALL update the trade record with entryTime and entryPrice.

### Requirement 3: Stop-Loss and Take-Profit Monitoring

**User Story:** As a forward tester, I want active trades to close automatically when price hits SL or TP, so that PnL is calculated accurately and consistently.

#### Acceptance Criteria

1. WHEN a Candle_Tick is received AND an active long trade's stopLoss is at or above the candle low, THE Forward_Test_Engine SHALL close the trade with exitReason "sl" and exitPrice equal to stopLoss adjusted for slippage.
2. WHEN a Candle_Tick is received AND an active long trade's takeProfit is at or below the candle high, THE Forward_Test_Engine SHALL close the trade with exitReason "tp" and exitPrice equal to takeProfit adjusted for slippage.
3. WHEN a Candle_Tick is received AND an active short trade's stopLoss is at or below the candle high, THE Forward_Test_Engine SHALL close the trade with exitReason "sl" and exitPrice equal to stopLoss adjusted for slippage.
4. WHEN a Candle_Tick is received AND an active short trade's takeProfit is at or above the candle low, THE Forward_Test_Engine SHALL close the trade with exitReason "tp" and exitPrice equal to takeProfit adjusted for slippage.
5. WHEN both SL and TP are triggered on the same candle, THE Forward_Test_Engine SHALL prioritize SL (worst-case assumption) and close the trade with exitReason "sl".

### Requirement 4: PnL Calculation

**User Story:** As a forward tester, I want accurate PnL calculations including fees and slippage, so that forward-test results are realistic.

#### Acceptance Criteria

1. WHEN a trade is closed, THE Forward_Test_Engine SHALL calculate raw PnL as: for long trades, (exitPrice - entryPrice) * positionSize; for short trades, (entryPrice - exitPrice) * positionSize.
2. WHEN a trade is closed, THE Forward_Test_Engine SHALL deduct total fees as: (entryPrice * positionSize * feePercent / 100) + (exitPrice * positionSize * feePercent / 100).
3. WHEN a trade is closed, THE Forward_Test_Engine SHALL calculate net pnl as rawPnl minus totalFees.
4. WHEN a trade is closed, THE Forward_Test_Engine SHALL calculate pnlPercent as (netPnl / accountBalanceAtEntry) * 100.
5. WHEN a trade is closed, THE Forward_Test_Engine SHALL calculate rrResult as netPnl / riskAmount.
6. WHEN a trade is closed, THE Forward_Test_Engine SHALL set status to "closed_win" if netPnl > 0, "closed_loss" if netPnl < 0, or "closed_breakeven" if netPnl equals zero.

### Requirement 5: Account Balance Tracking

**User Story:** As a forward tester, I want the virtual account balance to update after each trade, so that position sizing reflects cumulative performance.

#### Acceptance Criteria

1. THE Account_Tracker SHALL initialize with the configured initialBalance from ForwardTestConfig.
2. WHEN a trade is closed, THE Account_Tracker SHALL add the net pnl to the current account balance.
3. THE Account_Tracker SHALL provide the current balance to the Position_Sizer for subsequent trade calculations.
4. IF the account balance reaches zero or negative, THEN THE Forward_Test_Engine SHALL reject new trade creation and log an "account depleted" warning.

### Requirement 6: Trade Limits Enforcement

**User Story:** As a forward tester, I want configurable trade limits enforced, so that the forward test simulates disciplined trading rules.

#### Acceptance Criteria

1. WHILE the number of active or pending trades equals maxOpenTrades, THE Forward_Test_Engine SHALL reject new trade creation from incoming signals.
2. WHILE the number of trades created today (UTC) equals maxTradesPerDay, THE Forward_Test_Engine SHALL reject new trade creation from incoming signals.
3. WHEN a signal's riskReward is below the configured minRiskReward, THE Forward_Test_Engine SHALL reject trade creation and log the rejection reason.

### Requirement 7: Trade Timeout and Cancellation

**User Story:** As a forward tester, I want trades to expire after a configurable number of candles and support manual cancellation, so that capital is not tied up indefinitely.

#### Acceptance Criteria

1. WHEN a closed candle is received AND an active trade has been open for tradeTimeoutCandles or more closed candles since entry, THE Forward_Test_Engine SHALL close the trade with exitReason "timeout" and exitPrice equal to the candle's close price.
2. WHEN a closed candle is received AND a pending trade has been pending for tradeTimeoutCandles or more closed candles since creation, THE Forward_Test_Engine SHALL cancel the trade with status "expired" and exitReason "cancelled".
3. WHEN a manual close request is received for an active trade, THE Forward_Test_Engine SHALL close the trade with exitReason "manual" and exitPrice equal to the most recent candle close price, then set status to "closed_manual".
4. WHEN a cancel request is received for a pending trade, THE Forward_Test_Engine SHALL set the trade status to "cancelled" and exitReason to "cancelled".
5. WHEN a trade is closed or cancelled, THE Forward_Test_Engine SHALL broadcast a "trade:closed" event via WS_Server.

### Requirement 8: Trade Persistence and Retrieval

**User Story:** As a forward tester, I want all trades stored in PostgreSQL and retrievable via REST API, so that I can review historical performance.

#### Acceptance Criteria

1. THE Trade_Store SHALL persist all ForwardTrade fields to the forward_trades PostgreSQL table using parameterized queries.
2. WHEN a GET request is made to /api/forward-trades, THE API SHALL return trades sorted by created_at descending with optional filters for status, symbol, and side.
3. WHEN a POST request is made to /api/forward-trades/:id/manual-close, THE API SHALL invoke the Forward_Test_Engine manual close logic and return the updated trade.
4. WHEN a POST request is made to /api/forward-trades/:id/cancel, THE API SHALL invoke the Forward_Test_Engine cancel logic and return the updated trade.
5. IF a manual-close or cancel request targets a trade that is already closed or cancelled, THEN THE API SHALL return a 400 error with a descriptive message.

### Requirement 9: WebSocket Trade Events

**User Story:** As a frontend developer, I want real-time trade lifecycle events via WebSocket, so that the UI updates immediately when trades change status.

#### Acceptance Criteria

1. WHEN a trade is created, THE WS_Server SHALL broadcast a message with event "trade:created" and the full ForwardTrade as data.
2. WHEN a trade status changes (pending to active), THE WS_Server SHALL broadcast a message with event "trade:updated" and the updated ForwardTrade as data.
3. WHEN a trade is closed (any close status), THE WS_Server SHALL broadcast a message with event "trade:closed" and the final ForwardTrade as data.

### Requirement 10: Frontend Trade Panel

**User Story:** As a forward tester, I want a trade panel in the web UI showing active and recent trades, so that I can monitor the forward test in real time.

#### Acceptance Criteria

1. WHEN the trade panel is rendered, THE Web_UI SHALL display active trades with symbol, side, entry price, current PnL, SL, TP, and time since entry.
2. WHEN the trade panel is rendered, THE Web_UI SHALL display recent closed trades with exit reason, PnL, RR result, and duration.
3. WHEN a "trade:created", "trade:updated", or "trade:closed" WebSocket event is received, THE Web_UI SHALL update the trade panel without a full page reload.
4. WHEN a user clicks a "Close" button on an active trade, THE Web_UI SHALL send a POST request to /api/forward-trades/:id/manual-close.
5. WHEN a user clicks a "Cancel" button on a pending trade, THE Web_UI SHALL send a POST request to /api/forward-trades/:id/cancel.
