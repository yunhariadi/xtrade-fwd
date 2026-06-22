import type { Pool } from "pg";
import { dbRowToCandle, type Candle } from "@ict-forward-lab/core";
import { detectOrderBlocks, detectStructureBreaks } from "@ict-forward-lab/strategies";
import type { FvgTracker } from "../fvg/fvg-tracker";
import type { StrategyRunner } from "../strategy/strategy-runner";
import type {
  AlertTargetKind,
  AlertTrigger,
  CreateIndicatorAlertInput,
  PriceAlertDirection,
} from "./types";

/** The concrete, snapshotted target an indicator alert watches. */
export interface ResolvedIndicatorTarget {
  targetKind: AlertTargetKind;
  /** Always 'cross' for indicator alerts; zone behaviour is governed by `trigger`. */
  direction: PriceAlertDirection;
  targetPrice: number | null;
  priceLow: number | null;
  priceHigh: number | null;
  trigger: AlertTrigger | null;
  indicatorDirection: string | null;
}

export interface IndicatorResolverDeps {
  pool: Pool;
  exchange: string;
  fvgTracker: FvgTracker;
  strategyRunner: StrategyRunner;
}

/** Thrown when the referenced indicator instance can't be found at create time. */
export class IndicatorNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IndicatorNotFoundError";
  }
}

/**
 * Resolve an indicator-alert request into a concrete price target by snapshotting
 * the referenced indicator instance's current boundaries.
 *
 * FVG/OB are zones → [priceLow, priceHigh] watched on `touch` (enter band) or
 * `cross` (through far edge). Liquidity/BoS are single levels → targetPrice
 * watched with direction `cross`. Throws IndicatorNotFoundError if the instance
 * named by `indicatorId` is no longer present.
 */
export async function resolveIndicatorAlert(
  input: CreateIndicatorAlertInput,
  deps: IndicatorResolverDeps,
): Promise<ResolvedIndicatorTarget> {
  const symbol = input.symbol.toUpperCase();

  switch (input.indicatorKind) {
    case "fvg": {
      const zone = deps.fvgTracker
        .getZones(symbol, input.timeframe)
        .find((z) => z.id === input.indicatorId);
      if (!zone) {
        throw new IndicatorNotFoundError(
          `FVG zone ${input.indicatorId} not found for ${symbol}/${input.timeframe}`,
        );
      }
      return zoneTarget(zone.bottom, zone.top, input.trigger, zone.direction);
    }

    case "ob": {
      const candles = await loadCandles(deps, symbol, input.timeframe, 200);
      const ob = detectOrderBlocks(candles, 10, true).find((o) => o.id === input.indicatorId);
      if (!ob) {
        throw new IndicatorNotFoundError(
          `Order block ${input.indicatorId} not found for ${symbol}/${input.timeframe}`,
        );
      }
      return zoneTarget(ob.bottom, ob.top, input.trigger, ob.direction);
    }

    case "liquidity": {
      const levels = await deps.strategyRunner.getLiquidityLevels(symbol, input.timeframe);
      const level = levels.find((l) => l.id === input.indicatorId);
      if (!level) {
        throw new IndicatorNotFoundError(
          `Liquidity level ${input.indicatorId} not found for ${symbol}/${input.timeframe}`,
        );
      }
      return levelTarget(level.price, level.type);
    }

    case "bos": {
      const candles = await loadCandles(deps, symbol, input.timeframe, 300);
      const brk = detectStructureBreaks(candles, 5, 5).find((b) => b.id === input.indicatorId);
      if (!brk) {
        throw new IndicatorNotFoundError(
          `Structure break ${input.indicatorId} not found for ${symbol}/${input.timeframe}`,
        );
      }
      return levelTarget(brk.breakLevel, brk.direction);
    }

    default:
      throw new IndicatorNotFoundError(`Unsupported indicator kind: ${input.indicatorKind}`);
  }
}

function zoneTarget(
  bottom: number,
  top: number,
  trigger: AlertTrigger | undefined,
  indicatorDirection: string,
): ResolvedIndicatorTarget {
  return {
    targetKind: "zone",
    direction: "cross",
    targetPrice: null,
    priceLow: Math.min(bottom, top),
    priceHigh: Math.max(bottom, top),
    trigger: trigger ?? "touch",
    indicatorDirection,
  };
}

function levelTarget(price: number, indicatorDirection: string): ResolvedIndicatorTarget {
  return {
    targetKind: "level",
    direction: "cross",
    targetPrice: price,
    priceLow: null,
    priceHigh: null,
    trigger: null,
    indicatorDirection,
  };
}

async function loadCandles(
  deps: IndicatorResolverDeps,
  symbol: string,
  timeframe: string,
  limit: number,
): Promise<Candle[]> {
  const result = await deps.pool.query(
    `SELECT * FROM (
       SELECT * FROM candles WHERE exchange = $3 AND symbol = $1 AND timeframe = $2 AND is_closed = true
       ORDER BY open_time DESC LIMIT $4
     ) sub ORDER BY open_time ASC`,
    [symbol, timeframe, deps.exchange, limit],
  );
  return result.rows.map(dbRowToCandle);
}
