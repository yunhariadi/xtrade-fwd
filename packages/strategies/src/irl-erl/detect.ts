import type { Candle } from "@ict-forward-lab/core";
import {
  DEFAULT_IRL_ERL_CONFIG,
  type IrlErlConfig,
  type IrlErlResult,
  type LiquidityTarget,
} from "./types";

/**
 * Classify the current draw on liquidity: is price drawing from an internal
 * level out to external liquidity (IRL→ERL), or retracing from an external
 * sweep back into an internal level (ERL→IRL)?
 *
 * The anchor (`from`) is the target most recently interacted with by price; the
 * `to` is the nearest opposite-category target in the direction of travel.
 *
 * Pure and deterministic. Feed closed candles only.
 */
export function classifyDraw(
  candles: Candle[],
  targets: LiquidityTarget[],
  config: Partial<IrlErlConfig> = {}
): IrlErlResult {
  const cfg: IrlErlConfig = { ...DEFAULT_IRL_ERL_CONFIG, ...config };
  const empty: IrlErlResult = {
    currentDraw: "unclear",
    from: null,
    to: null,
    travel: "flat",
    status: "no_levels",
    confidence: 0,
  };
  if (candles.length < 2 || targets.length === 0) return empty;

  const window = candles.slice(-cfg.lookback);
  const price = window[window.length - 1].close;
  const travel = inferTravel(window);

  // The anchor is the most recently *touched* target, scanning newest candle
  // first. Touch = candle range overlaps the target's price/zone.
  let from: LiquidityTarget | null = null;
  for (let i = window.length - 1; i >= 0 && !from; i--) {
    const c = window[i];
    for (const t of targets) {
      const lo = t.low ?? t.price;
      const hi = t.high ?? t.price;
      if (c.low <= hi && c.high >= lo) {
        from = t;
        break;
      }
    }
  }
  if (!from) {
    return { ...empty, travel, status: "no_recent_interaction" };
  }

  const currentDraw =
    from.category === "IRL" ? "IRL_to_ERL" : "ERL_to_IRL";
  const wantCategory = from.category === "IRL" ? "ERL" : "IRL";

  // Target: nearest opposite-category level in the travel direction.
  const to = nearestInDirection(targets, wantCategory, price, travel);

  const status = deriveStatus(currentDraw, from, to, price, travel);
  const confidence = to ? (travel === "flat" ? 0.4 : 0.65) : 0.3;

  return { currentDraw, from, to, travel, status, confidence };
}

function inferTravel(window: Candle[]): "up" | "down" | "flat" {
  const first = window[0].close;
  const last = window[window.length - 1].close;
  const meanRange =
    window.reduce((a, c) => a + (c.high - c.low), 0) / window.length;
  const delta = last - first;
  if (Math.abs(delta) < meanRange * 0.5) return "flat";
  return delta > 0 ? "up" : "down";
}

function nearestInDirection(
  targets: LiquidityTarget[],
  category: "IRL" | "ERL",
  price: number,
  travel: "up" | "down" | "flat"
): LiquidityTarget | null {
  const pool = targets.filter((t) => t.category === category);
  const above = pool
    .filter((t) => t.price > price)
    .sort((a, b) => a.price - b.price);
  const below = pool
    .filter((t) => t.price < price)
    .sort((a, b) => b.price - a.price);

  if (travel === "up") return above[0] ?? below[0] ?? null;
  if (travel === "down") return below[0] ?? above[0] ?? null;
  // flat: whichever is closest
  const candidates = [above[0], below[0]].filter(Boolean) as LiquidityTarget[];
  candidates.sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price));
  return candidates[0] ?? null;
}

function deriveStatus(
  draw: IrlErlResult["currentDraw"],
  from: LiquidityTarget,
  to: LiquidityTarget | null,
  price: number,
  travel: "up" | "down" | "flat"
): string {
  if (!to) return "target_unclear";
  const fromLo = from.low ?? from.price;
  const fromHi = from.high ?? from.price;
  const insideFrom = price >= fromLo && price <= fromHi;

  if (draw === "IRL_to_ERL") {
    if (insideFrom) return "at_irl_waiting_for_expansion";
    if (travel === "flat") return "consolidating_between_irl_and_erl";
    return "expanding_toward_erl";
  }
  // ERL_to_IRL
  if (insideFrom) return "at_erl_after_sweep";
  return "retracing_toward_irl";
}
