# ICT Concepts Pine Script Reference

This file is a reference for implementing ICT concepts from the original Pine Script indicator.
See the original source in the project conversation history.

## Key Concepts to Implement

### 1. Order Blocks (OB)
- Bullish OB: Last bearish candle before a bullish break of structure
- Bearish OB: Last bullish candle before a bearish break of structure
- Breaker blocks: OB that gets invalidated (price closes through it)
- Uses swing lookback (default: 10)
- Options: use candle body or full wick for OB boundaries
- Shows "polarity changes" when breaker becomes support/resistance again

### 2. Killzones (Session Time Filters)
- New York: 0700-0900 America/New_York
- London Open: 0700-1000 Europe/London (= 0200-0500 UTC-5)
- London Close: 1500-1700 Europe/London (= 1000-1200 UTC-5)
- Asian: 1000-1400 Asia/Tokyo (= 2000-0000 UTC-5)
- Rendered as background color zones on chart

### 3. BOS (Break of Structure) — separate from MSS
- MSS = first break that changes direction (market structure SHIFT)
- BOS = subsequent breaks in the SAME direction (continuation)
- Pine script tracks direction state and only marks MSS on first break
- BOS is marked on subsequent breaks of swing points in same direction

### 4. Displacement (Large Body Candles)
- Candle body > average body size
- Small wicks relative to body (high - max(open,close) < body * 0.36 AND min(open,close) - low < body * 0.36)
- Indicates institutional order flow / momentum

### 5. Volume Imbalance (VI)
- Bullish VI: open > previous close AND high[1] > low (gap between bodies)
- Bearish VI: open < previous close AND low[1] < high
- Drawn as two lines marking the gap zone

### 6. NWOG / NDOG
- NWOG: New Week Opening Gap (Friday close → Monday open)
- NDOG: New Day Opening Gap (previous day close → current day open)
- Drawn as boxes with midpoint line

### 7. FVG Enhancements
- IFVG (Implied FVG): where bodies overlap instead of gaps
- Balance Price Range (BPR): overlap zone of bullish + bearish FVG
- FVG mitigation tracking with border style changes (solid → dashed → dotted)

### 8. Fibonacci
- Drawn between last two instances of: FVG, BPR, OB, Liquidity, VI, NWOG
- Standard levels: 0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618

## Pine Script Parameters Reference

```
Market Structure:
- Length: 5 (range 3-10) — swing detection lookback
- MSS colors: bullish #00e6a1, bearish #e60400
- BOS colors: bullish #00e6a1, bearish #e60400

Order Blocks:
- Swing Lookback: 10 (min 3)
- Show Last Bullish OB: 1 (min 0)
- Show Last Bearish OB: 1 (min 0)
- Use Candle Body: true
- Bullish OB color: #3e89fa
- Bullish Break color: #4785f9 (85% transparency)
- Bearish OB color: #FF3131
- Bearish Break color: #f9ff57 (85% transparency)

Liquidity:
- Margin: 4 (range 2-7, used as atr/margin for proximity detection)
- Visible boxes: 2 (range 1-50)
- Buyside color: #fa451c
- Sellside color: #1ce4fa
- Detection: multiple swing points within ATR/margin range = liquidity pool

FVG:
- Options: FVG or IFVG
- Visible FVGs: 2 (range 1-20)
- Bullish FVG: #00e676, Break: #808000
- Bearish FVG: #ff5252, Break: #FF0000
- Balance Price Range toggle
- Mitigation: solid border → dashed (partial touch) → dotted + dim (full break)
```
