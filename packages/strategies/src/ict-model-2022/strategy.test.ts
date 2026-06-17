import { describe, it, expect } from "vitest";
import type { Candle } from "@ict-forward-lab/core";
import { ictModel2022Strategy } from "./strategy";
import { detect4HBias } from "../bias/detect";
import type { StrategyContext } from "./types";

function candle(time: number, o: number, h: number, l: number, c: number): Candle {
  return { time, open: o, high: h, low: l, close: c, volume: 1, isClosed: true };
}

/** A flat series with no swing structure → neutral bias, no setup. */
function flatSeries(count: number, price = 100, step = 60): Candle[] {
  return Array.from({ length: count }, (_, i) =>
    candle(1000 + i * step, price, price + 0.5, price - 0.5, price),
  );
}

function ctx(overrides: Partial<StrategyContext> = {}): StrategyContext {
  return {
    symbol: "BTCUSDT",
    exchange: "binance",
    candles5m: flatSeries(100),
    candles15m: flatSeries(100),
    candles1h: flatSeries(50),
    candles4h: flatSeries(30),
    ...overrides,
  };
}

describe("ictModel2022Strategy — guard clauses", () => {
  it("returns a well-formed none signal for flat (neutral) data", () => {
    const signal = ictModel2022Strategy(ctx());
    expect(signal.side).toBe("none");
    expect(signal.symbol).toBe("BTCUSDT");
    expect(signal.timeframe).toBe("5m");
    expect(signal.reasons).toEqual([]);
    expect(signal.drawings).toEqual([]);
    expect(signal.entry).toBeUndefined();
  });

  it("returns none when 4H bias is neutral even if lower timeframes have structure", () => {
    // Flat 4H guarantees neutral bias, so the strategy must short-circuit at step 1.
    const signal = ictModel2022Strategy(ctx({ candles4h: flatSeries(30) }));
    expect(signal.side).toBe("none");
  });

  it("returns none for empty candle arrays without throwing", () => {
    const signal = ictModel2022Strategy({
      symbol: "BTCUSDT",
      exchange: "binance",
      candles5m: [],
      candles15m: [],
      candles1h: [],
      candles4h: [],
    });
    expect(signal.side).toBe("none");
    expect(signal.signalTime).toBe(0);
  });

  it("sets signalTime to the last 5m candle time on a none signal", () => {
    const c = ctx();
    const signal = ictModel2022Strategy(c);
    expect(signal.signalTime).toBe(c.candles5m[c.candles5m.length - 1].time);
  });
});

describe("detect4HBias — sanity", () => {
  it("flat data is neutral", () => {
    expect(detect4HBias(flatSeries(30))).toBe("neutral");
  });

  it("classifies a clean higher-high / higher-low series as bullish", () => {
    // Ascending zig-zag with clear 3-bar pivots: troughs and peaks both rising.
    const prices = [
      100, 104, 108, 104, 100, // trough ~100
      106, 112, 118, 112, 106, // peak ~118, higher than start
      110, 116, 122, 116, 110, // higher low ~110, higher high ~122
      118, 124, 130, 124, 118, // higher low ~118, higher high ~130
    ];
    const candles = prices.map((p, i) => candle(1000 + i * 60, p, p + 1, p - 1, p));
    expect(detect4HBias(candles)).toBe("bullish");
  });

  it("classifies a clean lower-high / lower-low series as bearish", () => {
    const prices = [
      130, 126, 122, 126, 130, // peak ~130
      124, 118, 112, 118, 124, // trough ~112, lower
      120, 114, 108, 114, 120, // lower high ~120, lower low ~108
      112, 106, 100, 106, 112, // lower high ~112, lower low ~100
    ];
    const candles = prices.map((p, i) => candle(1000 + i * 60, p, p + 1, p - 1, p));
    expect(detect4HBias(candles)).toBe("bearish");
  });
});
