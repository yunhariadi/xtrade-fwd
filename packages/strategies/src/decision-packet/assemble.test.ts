import { describe, expect, it } from "vitest";
import type { Candle } from "@ict-forward-lab/core";
import { assembleDecisionPacket } from "./assemble";

const HOUR = 3600;
const MON_2024_01_08 = Math.floor(Date.UTC(2024, 0, 8) / 1000); // a Monday, 00:00 UTC

/** Generate `count` candles from `startSec` at `stepSec` spacing. */
function gen(
  startSec: number,
  count: number,
  stepSec: number,
  priceAt: (i: number, t: number) => number
): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const time = startSec + i * stepSec;
    const close = priceAt(i, time);
    const open = i === 0 ? close : out[i - 1].close;
    const high = Math.max(open, close) + 5;
    const low = Math.min(open, close) - 5;
    out.push({ time, open, high, low, close, volume: 10 + (i % 5), isClosed: true });
  }
  return out;
}

describe("assembleDecisionPacket", () => {
  // 5m candles for the current day, ending inside the London killzone (07:30 UTC).
  const candles5m = gen(MON_2024_01_08, 90, 300, (i) => 67000 + i * 8);
  // Coarser series ending around the same moment.
  const candles15m = gen(MON_2024_01_08 - 3 * 86400, 400, 900, (i) => 66000 + i * 3);
  const candles1h = gen(MON_2024_01_08 - 5 * 86400, 130, HOUR, (i) => 66000 + i * 6);
  // 4h spanning two weeks so previous-week range exists.
  const candles4h = gen(
    Math.floor(Date.UTC(2023, 11, 25) / 1000),
    84,
    4 * HOUR,
    (i) => 66000 + i * 40
  );

  const packet = assembleDecisionPacket({
    symbol: "BTCUSDT",
    candles5m,
    candles15m,
    candles1h,
    candles4h,
  });

  it("stamps the packet from the latest 5m candle", () => {
    expect(packet.symbol).toBe("BTCUSDT");
    expect(packet.timestamp).toBe(candles5m[candles5m.length - 1].time);
  });

  it("detects the London killzone for a 07:30 UTC close", () => {
    expect(packet.inKillzone).toBe(true);
    expect(packet.session.name).toBe("London Open");
  });

  it("produces a bounded score and a resolved bias", () => {
    expect(packet.score.total).toBeGreaterThanOrEqual(0);
    expect(packet.score.total).toBeLessThanOrEqual(100);
    expect(["long", "short", "none"]).toContain(packet.bias.final);
    expect(packet.bias.confidence).toBeGreaterThanOrEqual(0);
    expect(packet.bias.confidence).toBeLessThanOrEqual(1);
  });

  it("builds liquidity targets and a non-empty narrative", () => {
    expect(packet.liquidity.targets.length).toBeGreaterThan(0);
    expect(packet.liquidity.targets.some((t) => t.category === "ERL")).toBe(true);
    expect(typeof packet.narrative.short).toBe("string");
    expect(packet.narrative.short.length).toBeGreaterThan(0);
  });

  it("recommends a routing decision consistent with the score", () => {
    const { total, recommendation } = packet.score;
    if (total >= 80) expect(recommendation).toBe("send_to_oc_and_ha");
    else if (total >= 70) expect(recommendation).toBe("send_to_oc");
  });
});
