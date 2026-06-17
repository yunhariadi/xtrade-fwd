import type { Candle, FvgZone } from "@ict-forward-lab/core";

export interface SwingPoint {
  type: "high" | "low";
  price: number;
  time: number;
  index: number;
}

export type BiasDirection = "bullish" | "bearish" | "neutral";

export interface LiquiditySweepResult {
  type: "sell-side" | "buy-side";
  sweptLevel: number;
  sweepCandle: Candle;
  time: number;
}

export interface MSSResult {
  direction: "bullish" | "bearish";
  breakLevel: number;
  breakCandle: Candle;
  time: number;
}

export interface FvgEntryResult {
  direction: "bullish" | "bearish";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  fvgZone: FvgZone;
  time: number;
}

export interface StrategyContext {
  symbol: string;
  exchange: "binance" | "bybit";
  candles5m: Candle[];
  candles15m: Candle[];
  candles1h: Candle[];
  candles4h: Candle[];
}

export type SignalSide = "long" | "short" | "none";

export interface ChartDrawing {
  id: string;
  type: "box" | "line" | "marker" | "label";
  label?: string;
  fromTime?: number;
  toTime?: number;
  price?: number;
  top?: number;
  bottom?: number;
  direction?: "bullish" | "bearish";
  metadata?: Record<string, unknown>;
}

export interface StrategySignal {
  side: SignalSide;
  symbol: string;
  timeframe: string;
  signalTime: number;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskReward?: number;
  reasons: string[];
  drawings: ChartDrawing[];
  metadata?: Record<string, unknown>;
}
