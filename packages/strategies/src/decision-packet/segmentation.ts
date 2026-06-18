import type { Candle } from "@ict-forward-lab/core";
import { getKillzone } from "../sessions";

const SECONDS_PER_DAY = 86_400;

/** UTC day index (days since epoch). */
export function dayIndex(timeSec: number): number {
  return Math.floor(timeSec / SECONDS_PER_DAY);
}

/**
 * ISO-style week index with weeks starting Monday (UTC). Epoch day 0 is a
 * Thursday, so `(d + 3)` shifts Monday to a multiple of 7.
 */
export function weekIndex(timeSec: number): number {
  return Math.floor((dayIndex(timeSec) + 3) / 7);
}

export interface PriceRange {
  high: number;
  low: number;
}

/** High/low envelope of a candle set, or null if empty. */
export function rangeOf(candles: Candle[]): PriceRange | null {
  if (candles.length === 0) return null;
  let high = -Infinity;
  let low = Infinity;
  for (const c of candles) {
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
  }
  return { high, low };
}

/** Candles sharing the latest candle's UTC day. */
export function currentDay(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];
  const d = dayIndex(candles[candles.length - 1].time);
  return candles.filter((c) => dayIndex(c.time) === d);
}

/** Candles from the UTC day immediately before the latest candle's day. */
export function previousDay(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];
  const d = dayIndex(candles[candles.length - 1].time);
  return candles.filter((c) => dayIndex(c.time) === d - 1);
}

/** Candles sharing the latest candle's Monday-start week. */
export function currentWeek(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];
  const w = weekIndex(candles[candles.length - 1].time);
  return candles.filter((c) => weekIndex(c.time) === w);
}

/** Candles from the week immediately before the latest candle's week. */
export function previousWeek(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];
  const w = weekIndex(candles[candles.length - 1].time);
  return candles.filter((c) => weekIndex(c.time) === w - 1);
}

/**
 * Candles in the same killzone as the latest candle, within the current day.
 * Returns `{ name, candles }`, or null if the latest candle is outside any
 * killzone.
 */
export function currentSession(
  candles: Candle[]
): { name: string; candles: Candle[] } | null {
  if (candles.length === 0) return null;
  const last = candles[candles.length - 1];
  const kz = getKillzone(last.time);
  if (!kz) return null;
  const today = currentDay(candles);
  return {
    name: kz.name,
    candles: today.filter((c) => getKillzone(c.time)?.name === kz.name),
  };
}

/** High/low of the current day's Asian-session candles (the ICT "Asia range"). */
export function asiaRange(candles: Candle[]): PriceRange | null {
  const today = currentDay(candles);
  const asia = today.filter((c) => getKillzone(c.time)?.name === "Asian");
  return rangeOf(asia);
}
